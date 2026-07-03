/**
 * Printer Detection Module for CKBPOS
 * Detects printer capabilities, type, and connection method.
 * Uses Electron's getPrintersAsync() + Windows wmic for detailed info.
 */

const { execSync } = require('child_process');

// ── Printer Type Classification ────────────────────────────

const PRINTER_PATTERNS = {
  // POS/Thermal printers
  thermal: [
    /pos[\s-]?80/i, /pos[\s-]?58/i,
    /thermal/i, /receipt/i, /ticket/i,
    /epson.*tm[\s-]?(t|u|l|88)/i,
    /xprinter/i, /xp[\s-]?\d+/i,
    /rongta/i, /rp[\s-]?\d+/i,
    /goojprt/i, /gp[\s-]?\d+/i,
    /star.*micronics/i, /tsp\d+/i, /sp\d+/i,
    /bixolon/i, /srp[\s-]?\d+/i,
    /zebra.*zt/i, /zebra.*zd/i,
    /sunmi/i,
    /mini.*printer/i, /mobile.*print/i,
    /mtp[\s-]?\d+/i, /mpc[\s-]?\d+/i,
    /bluetooth.*print/i, /bt.*print/i,
    /label.*print/i,
    /citizen/i, /ct[\s-]?\d+/i,
    /honeywell/i,
    /snbc/i, /btp[\s-]?\d+/i,
    /nicelabel/i,
    /impact/i,
    /printer.*80/i, /printer.*58/i,
    /58mm/i, /80mm/i,
  ],
  // Regular Windows printers (inkjet, laser, etc.)
  regular: [
    /hp[\s-]?deskjet/i, /hp[\s-]?laserjet/i, /hp[\s-]?officejet/i,
    /canon.*pixma/i, /canon.*imageclass/i,
    /brother.*hl/i, /brother.*mfc/i,
    /epson.*workforce/i, /epson.*stylus/i, /epson.*l\d+/i,
    /samsung.*ml/i, /samsung.*clp/i,
    /xerox/i, /ricoh/i, /konica/i, /kyocera/i,
    /dell.*print/i,
    /lexmark/i,
    /okidata/i,
    /fax/i,
  ],
  // Virtual printers
  virtual: [
    /microsoft.*print.*pdf/i,
    /microsoft.*xps/i,
    /adobe.*pdf/i,
    /foxit.*pdf/i,
    /pdf.*creator/i,
    /cute.*pdf/i,
    /nitro.*pdf/i,
    /send.*one.*note/i,
    /onenote/i,
    /fax.*print/i,
    /pdf24/i,
  ],
};

// ── Connection Type Detection ───────────────────────────────

const PORT_PATTERNS = {
  usb:    [/^usb/i, /^usb00/i, /usbprint/i, /dot4/i],
  serial: [/^com\d+/i, /^lpt\d+/i, /^serial/i],
  network:[/^tcpip/i, /^ip_/i, /^wsd/i, /^网络/i, /^net/],
  bluetooth: [/^bt/i, /^bluetooth/i, /^bth/i, /^串/i],
  file:   [/^file:/i, /^ne0:/i],
};

// ── Main Detection Functions ────────────────────────────────

/**
 * Detect printer type from name patterns
 * @param {string} printerName
 * @returns {'thermal' | 'regular' | 'virtual' | 'unknown'}
 */
function classifyPrinter(printerName) {
  if (!printerName) return 'unknown';
  const name = printerName.toLowerCase();

  for (const [type, patterns] of Object.entries(PRINTER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(name)) return type;
    }
  }
  return 'unknown';
}

/**
 * Detect connection type from port name
 * @param {string} port
 * @returns {'usb' | 'serial' | 'network' | 'bluetooth' | 'file' | 'unknown'}
 */
function detectConnectionType(port) {
  if (!port) return 'unknown';
  const p = port.toLowerCase();

  for (const [type, patterns] of Object.entries(PORT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(p)) return type;
    }
  }
  return 'unknown';
}

/**
 * Extract paper widths from printer capabilities string
 * @param {string} capabilities
 * @returns {number[]} - array of widths in mm
 */
function extractPaperWidths(capabilities) {
  if (!capabilities) return [];
  const widths = [];
  // Match patterns like "80mm", "58mm", "3.5 in", "80 x 297 mm"
  const matches = capabilities.match(/(\d+)\s*mm/gi);
  if (matches) {
    for (const m of matches) {
      const w = parseInt(m);
      if (w >= 50 && w <= 200) widths.push(w);
    }
  }
  return [...new Set(widths)].sort((a, b) => a - b);
}

/**
 * Detect if printer supports ESC/POS
 * Based on name, driver, and port patterns
 */
function detectESCPOSSupport(printerName, driverName, portName) {
  const name = (printerName || '').toLowerCase();
  const driver = (driverName || '').toLowerCase();
  const port = (portName || '').toLowerCase();

  // Positive indicators
  const escposIndicators = [
    /pos/i, /thermal/i, /receipt/i, /ticket/i,
    /escpos/i, /esc.*pos/i,
    /epson.*tm/i, /xprinter/i, /rongta/i, /goojprt/i,
    /star.*micronics/i, /bixolon/i,
    /sunmi/i, /citizen/i, /snbc/i,
  ];

  // Negative indicators (regular printers with drivers)
  const nonEscposIndicators = [
    /microsoft.*print.*pdf/i,
    /adobe.*pdf/i,
    /hp.*laserjet/i, /hp.*deskjet/i,
    /canon.*pixma/i,
    /brother.*hl/i,
    /epson.*workforce/i, /epson.*l\d+/i,
    /samsung.*ml/i,
    /xerox/i, /ricoh/i, /konica/i,
  ];

  for (const p of nonEscposIndicators) {
    if (p.test(name) || p.test(driver)) return false;
  }

  for (const p of escposIndicators) {
    if (p.test(name) || p.test(driver)) return true;
  }

  // Port-based heuristic: USB/Bluetooth = likely ESC/POS if thermal name
  const connType = detectConnectionType(port);
  if ((connType === 'usb' || connType === 'bluetooth') && classifyPrinter(name) === 'thermal') {
    return true;
  }

  return false;
}

/**
 * Get estimated paper width from printer name
 * @returns {number} - width in mm (58, 80, or 0 if unknown)
 */
function estimatePaperWidth(printerName) {
  if (!printerName) return 0;
  const name = printerName.toLowerCase();

  // Explicit patterns
  if (/58\s*mm|58mm/i.test(name)) return 58;
  if (/80\s*mm|80mm|pos[\s-]?80/i.test(name)) return 80;
  if (/pos[\s-]?58/i.test(name)) return 58;

  // Brand defaults
  if (/xp[\s-]?80|rp[\s-]?80|gp[\s-]?80/i.test(name)) return 80;
  if (/xp[\s-]?58|rp[\s-]?58|gp[\s-]?58/i.test(name)) return 58;

  // Default for thermal printers
  if (classifyPrinter(name) === 'thermal') return 80;

  return 0;
}

/**
 * Get detailed printer info from Windows via wmic
 * @param {string} printerName
 * @returns {Object|null}
 */
function getWindowsPrinterInfo(printerName) {
  if (!printerName) return null;

  try {
    const cmd = `wmic printer where "Name like '%${printerName.replace(/'/g, "''")}%'" get DriverName,PortName,PrinterStatus,Default,WorkOffline /format:csv`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 5000, windowsHide: true });

    const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('Node'));
    if (lines.length < 2) return null;

    // Parse CSV output
    const headers = lines[0].split(',').map(h => h.trim());
    const values = lines[1].split(',').map(v => v.trim());

    const info = {};
    for (let i = 0; i < headers.length && i < values.length; i++) {
      info[headers[i]] = values[i];
    }

    return {
      driverName: info.DriverName || '',
      portName: info.PortName || '',
      status: info.PrinterStatus || '',
      isDefault: info.Default === 'TRUE',
      isOffline: info.WorkOffline === 'TRUE',
    };
  } catch (e) {
    // wmic may not be available or the query may fail
    return null;
  }
}

/**
 * Comprehensive printer capability detection
 * @param {Object} printer - from Electron getPrintersAsync()
 * @returns {Object} - detailed capability info
 */
function detectPrinterCapabilities(printer) {
  const name = printer.name || '';
  const driver = printer.driverName || '';
  const port = printer.portName || '';

  const type = classifyPrinter(name);
  const connection = detectConnectionType(port);
  const supportsESCPOS = detectESCPOSSupport(name, driver, port);
  const estimatedWidth = estimatePaperWidth(name);

  // Get Windows-level info
  const winInfo = getWindowsPrinterInfo(name);

  return {
    name,
    displayName: name,
    // Classification
    type, // 'thermal' | 'regular' | 'virtual' | 'unknown'
    connection, // 'usb' | 'serial' | 'network' | 'bluetooth' | 'file' | 'unknown'
    supportsESCPOS,
    // Paper
    estimatedWidth, // mm (58, 80, 0)
    paperWidths: extractPaperWidths(driver),
    // Windows details
    driverName: winInfo?.driverName || driver,
    portName: winInfo?.portName || port,
    isOffline: winInfo?.isOffline || false,
    // Recommended print method
    recommendedMethod: supportsESCPOS ? 'escpos' :
                       type === 'virtual' ? 'pdf' :
                       type === 'thermal' ? 'escpos' :
                       'windows',
  };
}

/**
 * Auto-detect the best print method for a given printer
 * @param {string} printerName
 * @param {Object} printer - from Electron getPrintersAsync()
 * @returns {string} 'escpos' | 'windows' | 'pdf' | 'auto'
 */
function getRecommendedPrintMethod(printerName, printer) {
  if (!printerName) return 'auto';

  const caps = detectPrinterCapabilities(printer || { name: printerName });
  return caps.recommendedMethod;
}

module.exports = {
  classifyPrinter,
  detectConnectionType,
  extractPaperWidths,
  detectESCPOSSupport,
  estimatePaperWidth,
  getWindowsPrinterInfo,
  detectPrinterCapabilities,
  getRecommendedPrintMethod,
};
