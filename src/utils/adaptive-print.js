/**
 * Adaptive Print Orchestrator for CKBPOS
 * Routes print jobs to the best available strategy:
 * 1. ESC/POS raw (for thermal printers that support it)
 * 2. Windows driver (webContents.print for standard printers)
 * 3. PDF fallback (for virtual printers or when others fail)
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { BrowserWindow, dialog, shell } = require('electron');
const { detectPrinterCapabilities, classifyPrinter } = require('./printer-detect');
const { createTicketBuilder, BARCODE } = require('./escpos');

// ── Strategy Cache ─────────────────────────────────────────
const _capabilityCache = new Map(); // printerName → capabilities
const _methodCache = new Map();     // printerName → method
const _printStats = [];             // recent print stats

// ── Logging ────────────────────────────────────────────────
function _log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[PRINT:${tag}] ${msg}`);
}

function _logError(tag, msg) {
  console.error(`[PRINT:${tag}] ERROR: ${msg}`);
}

// ── Capability Detection (cached) ──────────────────────────

function getCachedCapabilities(printerName, electronPrinters = []) {
  if (_capabilityCache.has(printerName)) {
    return _capabilityCache.get(printerName);
  }

  const printer = electronPrinters.find(p => p.name === printerName) || { name: printerName };
  const caps = detectPrinterCapabilities(printer);
  _capabilityCache.set(printerName, caps);
  return caps;
}

function clearCapabilityCache(printerName) {
  if (printerName) {
    _capabilityCache.delete(printerName);
    _methodCache.delete(printerName);
  } else {
    _capabilityCache.clear();
    _methodCache.clear();
  }
}

// ── ESC/POS Strategy ───────────────────────────────────────

/**
 * Print using ESC/POS raw commands
 * This bypasses the Windows print driver and sends commands directly.
 * Best for mobile thermal printers connected via USB/Bluetooth.
 */
async function printESCPOS(htmlData, ticketData, printerName, options = {}) {
  const startTime = Date.now();
  const caps = getCachedCapabilities(printerName);
  const paperWidth = caps.estimatedWidth || options.paperWidth || 80;

  _log('ESCPOS', `Generating ESC/POS for ${printerName} (${paperWidth}mm)`);

  // Build ESC/POS ticket
  const builder = createTicketBuilder(paperWidth);

  // Convert HTML ticket data to ESC/POS format
  builder.buildTicket({
    shopName: ticketData.shopName || '',
    shopAddress: ticketData.shopAddress || '',
    shopPhone: ticketData.shopPhone || '',
    shopNif: ticketData.shopNif || '',
    clientNom: ticketData.clientNom || '',
    clientNif: ticketData.clientNif || '',
    items: ticketData.items || [],
    total: ticketData.total || '0',
    cashGiven: ticketData.cashGiven || '',
    change: ticketData.change || '',
    seller: ticketData.seller || '',
    date: ticketData.date || '',
    currency: ticketData.currency || 'Kz',
    payMode: ticketData.payMode || 'dinheiro',
    montantDinheiro: ticketData.montantDinheiro || '',
    montantExpress: ticketData.montantExpress || '',
    numeroFacture: ticketData.numeroFacture || '',
    segundaVia: ticketData.segundaVia || false,
    statut: ticketData.statut || '',
    flags: ticketData.flags || {},
    appVersion: ticketData.appVersion || '',
  });

  const rawData = builder.getData();
  _log('ESCPOS', `Generated ${rawData.length} bytes of ESC/POS data`);

  // Strategy: Try to print via raw data
  // For USB/Bluetooth printers, we use webContents.print with a minimal HTML
  // that contains the ESC/POS commands embedded as a preformatted block
  // This works because many thermal printer drivers pass through ESC/POS commands

  const result = await printViaRawFallback(rawData, printerName, options);
  const elapsed = Date.now() - startTime;

  _printStats.push({
    method: 'escpos',
    printer: printerName,
    bytes: rawData.length,
    elapsed,
    success: result.success,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Fallback: print ESC/POS data via a minimal HTML wrapper
 * Some printer drivers pass through raw ESC/POS when they see preformatted text
 */
async function printViaRawFallback(rawData, printerName, options = {}) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), 'ckbpos_escpos_' + Date.now() + '.html');

    // Convert ESC/POS to readable text for the printer
    // This is a lossy conversion but works better than nothing
    const textContent = rawData.toString('ascii').replace(/[\x00-\x08\x0E-\x1F]/g, '');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @page { size: auto; margin: 0; }
      body {
        font-family: 'Courier New', monospace;
        font-size: 12px;
        white-space: pre;
        margin: 0;
        padding: 2mm;
      }
    </style></head><body><pre>${textContent}</pre></body></html>`;

    fs.writeFileSync(tmpFile, html, 'utf8');
    const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch(e) {} };

    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    win.loadURL('file:///' + tmpFile.replace(/\\/g, '/'));

    win.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        try {
          const printOptions = {
            silent: true,
            printBackground: false,
            color: false,
            copies: options.copies || 1,
            margins: { marginType: 'none' },
            scaleFactor: 100,
          };

          if (printerName && printerName.trim()) {
            printOptions.deviceName = printerName.trim();
          }

          win.webContents.print(printOptions, (success, errorType) => {
            win.close();
            cleanup();
            if (success) {
              resolve({ success: true, method: 'escpos-raw' });
            } else {
              // If ESC/POS raw fails, reject so orchestrator can try next strategy
              reject(new Error(`ESC/POS raw print failed: ${errorType}`));
            }
          });
        } catch(err) {
          win.close();
          cleanup();
          reject(err);
        }
      }, 800);
    });

    win.webContents.on('did-fail-load', (e, code, desc) => {
      win.close();
      cleanup();
      reject(new Error(desc));
    });
  });
}

// ── Windows Driver Strategy ────────────────────────────────

/**
 * Print using Windows driver (original method)
 * This is the existing webContents.print() approach.
 * Works well for desktop POS-80 printers with full Windows drivers.
 */
async function printWindowsDriver(htmlContent, printerName, options = {}) {
  const startTime = Date.now();
  const { isTicket = false, ticketWidthMicrons = 72100, copies = 1 } = options;

  _log('WINDOWS', `Printing via Windows driver: ${printerName || 'default'} (${ticketWidthMicrons} microns)`);

  const tmpFile = path.join(os.tmpdir(), 'ckbpos_win_' + Date.now() + '.html');
  fs.writeFileSync(tmpFile, htmlContent, 'utf8');
  const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch(e) {} };

  // Thermal printer CSS fix
  const thermalFix = isTicket ? `<style>
    * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { background: #ffffff !important; }
  </style>` : '';
  const fixedHtml = htmlContent.replace('</head>', thermalFix + '</head>');
  fs.writeFileSync(tmpFile, fixedHtml, 'utf8');

  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadURL('file:///' + tmpFile.replace(/\\/g, '/'));

  return new Promise((resolve, reject) => {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const printOptions = {
            silent: true,
            printBackground: true,
            color: false,
            copies: Math.max(1, copies),
            margins: { marginType: 'none' },
            scaleFactor: 100,
          };

          if (isTicket) {
            printOptions.pageSize = { width: ticketWidthMicrons, height: 400000 };
          }

          if (printerName && printerName.trim()) {
            printOptions.deviceName = printerName.trim();
          }

          win.webContents.print(printOptions, (success, errorType) => {
            win.close();
            cleanup();
            const elapsed = Date.now() - startTime;

            _printStats.push({
              method: 'windows',
              printer: printerName,
              bytes: htmlContent.length,
              elapsed,
              success,
              timestamp: Date.now(),
            });

            if (success) {
              resolve({ success: true, method: 'windows-driver' });
            } else {
              reject(new Error(errorType || 'Windows print failed'));
            }
          });
        } catch(err) {
          win.close();
          cleanup();
          reject(err);
        }
      }, 1500);
    });

    win.webContents.on('did-fail-load', (e, code, desc) => {
      win.close();
      cleanup();
      reject(new Error(desc));
    });
  });
}

// ── PDF Fallback Strategy ──────────────────────────────────

/**
 * Print via PDF generation + Windows default printer
 * Used for virtual printers (Microsoft Print to PDF) or as last resort.
 */
async function printPDFFallback(htmlContent, printerName, options = {}) {
  const startTime = Date.now();
  const { isTicket = false, ticketWidthMicrons = 72100, copies = 1 } = options;

  _log('PDF', `Generating PDF fallback for ${printerName || 'default'}`);

  const tmpFile = path.join(os.tmpdir(), 'ckbpos_pdf_' + Date.now() + '.html');
  fs.writeFileSync(tmpFile, htmlContent, 'utf8');
  const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch(e) {} };

  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadURL('file:///' + tmpFile.replace(/\\/g, '/'));

  return new Promise((resolve, reject) => {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const pdfOptions = {
            printBackground: true,
            pageSize: isTicket
              ? { width: ticketWidthMicrons || 72100, height: 400000 }
              : { width: 210000, height: 297000 }, // A4
            margins: { marginType: 'none' },
          };

          const pdfBuffer = await win.webContents.printToPDF(pdfOptions);
          win.close();
          cleanup();

          // Save and open PDF
          const result = await dialog.showSaveDialog({
            title: 'Salvar PDF',
            defaultPath: path.join(os.homedir(), 'Desktop', `ckbpos_${Date.now()}.pdf`),
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
          });

          if (result.canceled) {
            const elapsed = Date.now() - startTime;
            _printStats.push({
              method: 'pdf',
              printer: printerName,
              bytes: pdfBuffer.length,
              elapsed,
              success: true,
              canceled: true,
              timestamp: Date.now(),
            });
            return resolve({ success: true, method: 'pdf', canceled: true });
          }

          fs.writeFileSync(result.filePath, pdfBuffer);
          shell.openPath(result.filePath).catch(() => {});

          const elapsed = Date.now() - startTime;
          _printStats.push({
            method: 'pdf',
            printer: printerName,
            bytes: pdfBuffer.length,
            elapsed,
            success: true,
            timestamp: Date.now(),
          });

          resolve({ success: true, method: 'pdf', path: result.filePath });
        } catch(err) {
          win.close();
          cleanup();
          reject(err);
        }
      }, 1500);
    });

    win.webContents.on('did-fail-load', (e, code, desc) => {
      win.close();
      cleanup();
      reject(new Error(desc));
    });
  });
}

// ── Main Orchestrator ──────────────────────────────────────

/**
 * Adaptive print — tries the best strategy for the given printer
 * @param {Object} params
 * @param {string} params.html - HTML content to print
 * @param {Object} params.ticketData - structured ticket data (for ESC/POS)
 * @param {string} params.printerName - target printer name
 * @param {Object} params.settings - print settings from DB
 * @param {string} params.methodOverride - 'auto' | 'escpos' | 'windows' | 'pdf'
 * @param {boolean} params.isTicket - true for thermal ticket format
 * @param {number} params.copies - number of copies
 */
async function adaptivePrint({
  html,
  ticketData = null,
  printerName = '',
  settings = {},
  methodOverride = 'auto',
  isTicket = false,
  copies = 1,
}) {
  const startTime = Date.now();
  const caps = getCachedCapabilities(printerName, settings.printers || []);

  _log('ADAPTIVE', `Printer: ${printerName || 'default'} | Type: ${caps.type} | ESC/POS: ${caps.supportsESCPOS} | Override: ${methodOverride}`);

  // Determine the method to use
  let method = methodOverride;
  if (method === 'auto') {
    method = _methodCache.get(printerName) || caps.recommendedMethod || 'windows';
  }

  _log('ADAPTIVE', `Using method: ${method}`);

  // Calculate ticket width in microns
  const ticketSizeMm = settings.ticketSizeMm || caps.estimatedWidth || 72;
  const ticketWidthMicrons = (ticketSizeMm * 1000) + 100;

  // Strategy chain with fallback
  const strategies = [];

  if (method === 'escpos' && ticketData) {
    strategies.push({
      name: 'ESC/POS',
      fn: () => printESCPOS(html, ticketData, printerName, {
        paperWidth: caps.estimatedWidth || ticketSizeMm,
        copies,
      }),
    });
  }

  if (method === 'windows' || method === 'auto') {
    strategies.push({
      name: 'Windows Driver',
      fn: () => printWindowsDriver(html, printerName, {
        isTicket,
        ticketWidthMicrons,
        copies,
      }),
    });
  }

  if (method === 'pdf') {
    strategies.push({
      name: 'PDF',
      fn: () => printPDFFallback(html, printerName, {
        isTicket,
        ticketWidthMicrons,
        copies,
      }),
    });
  }

  // If ESC/POS was chosen but no ticket data, fall back to Windows
  if (strategies.length === 0) {
    if (ticketData) {
      strategies.push({
        name: 'ESC/POS (fallback)',
        fn: () => printESCPOS(html, ticketData, printerName, {
          paperWidth: caps.estimatedWidth || ticketSizeMm,
          copies,
        }),
      });
    }
    strategies.push({
      name: 'Windows Driver (fallback)',
      fn: () => printWindowsDriver(html, printerName, {
        isTicket,
        ticketWidthMicrons,
        copies,
      }),
    });
  }

  // Always add PDF as last resort
  strategies.push({
    name: 'PDF (last resort)',
    fn: () => printPDFFallback(html, printerName, {
      isTicket,
      ticketWidthMicrons,
      copies,
    }),
  });

  // Execute strategies with fallback
  let lastError = null;
  for (const strategy of strategies) {
    try {
      _log('ADAPTIVE', `Trying: ${strategy.name}`);
      const result = await strategy.fn();
      const elapsed = Date.now() - startTime;
      _log('ADAPTIVE', `Success via ${strategy.name} (${elapsed}ms)`);
      return {
        success: true,
        method: result.method || strategy.name.toLowerCase().replace(/\s+/g, '-'),
        elapsed,
        printer: printerName,
      };
    } catch (err) {
      _logError('ADAPTIVE', `${strategy.name} failed: ${err.message}`);
      lastError = err;
      // Continue to next strategy
    }
  }

  // All strategies failed
  const elapsed = Date.now() - startTime;
  _logError('ADAPTIVE', `All strategies failed (${elapsed}ms)`);
  return {
    success: false,
    error: lastError?.message || 'All print strategies failed',
    elapsed,
    printer: printerName,
  };
}

// ── Public API ─────────────────────────────────────────────

/**
 * Get print statistics
 */
function getPrintStats() {
  return [..._printStats].slice(-20); // Last 20
}

/**
 * Reset capability cache (call when printer settings change)
 */
function resetPrintCache() {
  clearCapabilityCache();
  _printStats.length = 0;
}

module.exports = {
  adaptivePrint,
  printESCPOS,
  printWindowsDriver,
  printPDFFallback,
  getCachedCapabilities,
  clearCapabilityCache,
  resetPrintCache,
  getPrintStats,
};
