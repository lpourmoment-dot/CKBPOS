/**
 * CKBPOS Coordinator Module
 * =========================
 * Leader election, stock locking, and print queue.
 * Extracted from main.js during v5.1 refactor.
 *
 * Dependencies (passed via init()):
 *   db, store, mainWindow, MACHINE_ID, peersMap,
 *   getPrintSettings, getTicketFlags, printHTML,
 *   generateTicketHTML, generateShiftHTML, generateCadernoTicketHTML,
 *   sendPrintRequest, encryptPayload, secureSend, QRCode
 */

'use strict';

// ── State ──────────────────────────────────────────────────────
let _db, _mainWindow, _MACHINE_ID, _peersMap;
let _getPrintSettings, _getTicketFlags, _printHTML;
let _generateTicketHTML, _generateShiftHTML, _generateCadernoTicketHTML;
let _sendPrintRequest, _encryptPayload, _secureSend, _QRCode;

let _isCoordinator = false;
let _coordinatorId = '';
let _coordinatorLabel = '';
let _coordCheckTimer = null;
let _coordAnnounceTimer = null;
const COORD_TTL_MS = 12000;
let _lastCoordSeen = 0;
let _degradedMode = false;

// Stock Lock
const RESERVATION_TTL_S = 30;
const _stockReserveCallbacks = new Map();

// Print Queue
let _printQueueRunning = false;
let _printQueueInterval = null;
const _printQueuedCallbacks = new Map();
const _printDoneCallbacks = new Map();

// ── Init ───────────────────────────────────────────────────────

function init(ctx) {
  _db = ctx.db;
  _mainWindow = ctx.mainWindow;
  _MACHINE_ID = ctx.MACHINE_ID;
  _peersMap = ctx.peersMap;
  _getPrintSettings = ctx.getPrintSettings;
  _getTicketFlags = ctx.getTicketFlags;
  _printHTML = ctx.printHTML;
  _generateTicketHTML = ctx.generateTicketHTML;
  _generateShiftHTML = ctx.generateShiftHTML;
  _generateCadernoTicketHTML = ctx.generateCadernoTicketHTML;
  _sendPrintRequest = ctx.sendPrintRequest;
  _encryptPayload = ctx.encryptPayload;
  _secureSend = ctx.secureSend;
  _QRCode = ctx.QRCode;
}

// ── Coordinator Election ───────────────────────────────────────

function shouldBeCoordinator() {
  const label = _db.prepare("SELECT value FROM settings WHERE key='machine_label'").get()?.value || '';
  if (label === 'Caixa Principal') return true;
  const allIds = [_MACHINE_ID, ..._peersMap.keys()].sort();
  return allIds[0] === _MACHINE_ID;
}

function becomeCoordinator() {
  if (_isCoordinator) return;
  _isCoordinator = true;
  _coordinatorId = _MACHINE_ID;
  const label = _db.prepare("SELECT value FROM settings WHERE key='machine_label'").get()?.value || 'CKBPOS';
  _coordinatorLabel = label;
  _db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('coordinator_id',?)").run(_MACHINE_ID);
  _db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('coordinator_label',?)").run(label);
  try { _db.prepare("INSERT INTO coordinator_log (machine_id,machine_label,event) VALUES (?,?,'ELECTED')").run(_MACHINE_ID, label); } catch (_e) {}
  console.log('[COORD] Coordinateur élu: ' + label);
  broadcastCoordAnnounce();
  startPrintQueueWorker();
  notifyCoordStatus();
}

function resignCoordinator() {
  if (!_isCoordinator) return;
  _isCoordinator = false;
  console.log('[COORD] Abandon rôle coordinateur');
  stopPrintQueueWorker();
  notifyCoordStatus();
}

function broadcastCoordAnnounce() {
  if (!_isCoordinator) return;
  const msg = _encryptPayload({ type: 'COORD_ANNOUNCE', machine_id: _MACHINE_ID, machine_label: _coordinatorLabel, ts: Date.now() });
  for (const peer of _peersMap.values()) {
    if (peer.ws?.readyState === 1) try { peer.ws.send(msg); } catch (_e) {}
  }
}

function handleCoordAnnounce(msg) {
  _lastCoordSeen = Date.now();
  _coordinatorId = msg.machine_id;
  _coordinatorLabel = msg.machine_label || '';
  try {
    _db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('coordinator_id',?)").run(msg.machine_id);
    _db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('coordinator_label',?)").run(_coordinatorLabel);
  } catch (_e) {}
  if (_isCoordinator && msg.machine_id !== _MACHINE_ID) {
    const theirLabel = msg.machine_label || '';
    const myLabel = _db.prepare("SELECT value FROM settings WHERE key='machine_label'").get()?.value || '';
    const theyWin = (theirLabel === 'Caixa Principal' && myLabel !== 'Caixa Principal') ||
      (myLabel !== 'Caixa Principal' && msg.machine_id < _MACHINE_ID);
    if (theyWin) { console.log('[COORD] Céder à ' + theirLabel); resignCoordinator(); }
  }
  notifyCoordStatus();
}

function runCoordElection() {
  const coordAbsent = !_coordinatorId || (Date.now() - _lastCoordSeen > COORD_TTL_MS);
  if (coordAbsent && !_isCoordinator) {
    const delay = shouldBeCoordinator() ? 800 : 2500;
    setTimeout(() => {
      if (Date.now() - _lastCoordSeen > COORD_TTL_MS && shouldBeCoordinator()) becomeCoordinator();
    }, delay);
  } else if (_isCoordinator) {
    broadcastCoordAnnounce();
  }
}

function notifyCoordStatus() {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    try { _mainWindow.webContents.send('coord-status-changed', { isCoordinator: _isCoordinator, coordinatorId: _coordinatorId, coordinatorLabel: _coordinatorLabel, degraded: _degradedMode }); } catch (_e) {}
  }
}

// ── Stock Lock ─────────────────────────────────────────────────

function handleStockReserve(ws, msg) {
  if (!_isCoordinator) {
    try { _secureSend(ws, { type: 'STOCK_RESERVED', reservation_id: msg.reservation_id, ok: false, reason: 'not_coordinator' }); } catch (_e) {}
    return;
  }
  try {
    const { reservation_id, product_id, variant_id, qty, machine_id } = msg;
    let stockReel = 0;
    if (variant_id) {
      stockReel = _db.prepare('SELECT stock_cartons FROM product_variants WHERE id=?').get(variant_id)?.stock_cartons || 0;
    } else {
      stockReel = _db.prepare('SELECT stock_cartons FROM products WHERE id=?').get(product_id)?.stock_cartons || 0;
    }
    const reservedQty = _db.prepare(
      "SELECT COALESCE(SUM(qty_reserved),0) as tot FROM stock_reservations WHERE product_id=? AND status='active' AND expires_at > datetime('now','utc')"
    ).get(product_id)?.tot || 0;
    const available = stockReel - reservedQty;
    if (available < qty) {
      _secureSend(ws, { type: 'STOCK_RESERVED', reservation_id, ok: false, reason: 'insufficient_stock', available });
      console.log('[COORD] STOCK refusé prod=' + product_id + ' dispo=' + available + ' demandé=' + qty);
      return;
    }
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_S * 1000).toISOString().replace('T', ' ').slice(0, 19);
    _db.prepare('INSERT INTO stock_reservations (reservation_id,product_id,variant_id,qty_reserved,machine_id,expires_at) VALUES (?,?,?,?,?,?)')
      .run(reservation_id, product_id, variant_id || null, qty, machine_id, expiresAt);
    _secureSend(ws, { type: 'STOCK_RESERVED', reservation_id, ok: true, available: available - qty });
    console.log('[COORD] STOCK réservé ' + reservation_id.slice(0, 8) + ' prod=' + product_id + ' qty=' + qty);
  } catch (e) {
    console.error('[COORD] handleStockReserve:', e.message);
    try { _secureSend(ws, { type: 'STOCK_RESERVED', reservation_id: msg.reservation_id, ok: false, reason: 'error' }); } catch (_e) {}
  }
}

function handleStockRelease(msg) {
  if (!_isCoordinator) return;
  try { _db.prepare('UPDATE stock_reservations SET status=? WHERE reservation_id=?').run(msg.consumed ? 'consumed' : 'released', msg.reservation_id); }
  catch (e) { console.error('[COORD] handleStockRelease:', e.message); }
}

function handleStockReserved(msg) {
  const cb = _stockReserveCallbacks.get(msg.reservation_id);
  if (!cb) return;
  clearTimeout(cb.timer);
  _stockReserveCallbacks.delete(msg.reservation_id);
  if (msg.ok) cb.resolve({ ok: true, reservation_id: msg.reservation_id });
  else cb.reject(new Error(msg.reason === 'insufficient_stock' ? 'Stock insuficiente (disponível: ' + (msg.available || 0) + ')' : msg.reason || 'erro'));
}

function requestStockReservation(product_id, variant_id, qty) {
  return new Promise((resolve, reject) => {
    if (_isCoordinator) {
      const reservation_id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      const fakeWs = { send: (data) => {
        try { const m = JSON.parse(data); if (m.ok) resolve({ ok: true, reservation_id }); else reject(new Error(m.reason || 'stock insuficiente')); }
        catch (_e) { reject(new Error('erro interno')); }
      } };
      handleStockReserve(fakeWs, { reservation_id, product_id, variant_id, qty, machine_id: _MACHINE_ID });
      return;
    }
    const coordPeer = _peersMap.get(_coordinatorId);
    if (!coordPeer || coordPeer.ws?.readyState !== 1) {
      console.warn('[COORD] Coordinador offline — modo degradado, venda sem lock');
      resolve({ ok: true, reservation_id: null, degraded: true });
      return;
    }
    const reservation_id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      _stockReserveCallbacks.delete(reservation_id);
      console.warn('[COORD] Timeout reserva stock — modo degradado');
      resolve({ ok: true, reservation_id: null, degraded: true });
    }, 3000);
    _stockReserveCallbacks.set(reservation_id, { resolve, reject, timer });
    coordPeer.secureSend({ type: 'STOCK_RESERVE', reservation_id, product_id, variant_id, qty, machine_id: _MACHINE_ID });
  });
}

function releaseStockReservation(reservation_id, consumed = true) {
  if (!reservation_id) return;
  if (_isCoordinator) {
    try { _db.prepare('UPDATE stock_reservations SET status=? WHERE reservation_id=?').run(consumed ? 'consumed' : 'released', reservation_id); } catch (_e) {}
    return;
  }
  const coordPeer = _peersMap.get(_coordinatorId);
  if (coordPeer?.ws?.readyState === 1) {
    try { coordPeer.secureSend({ type: 'STOCK_RELEASE', reservation_id, consumed }); } catch (_e) {}
  }
}

// ── Print Queue ────────────────────────────────────────────────

function startPrintQueueWorker() {
  if (_printQueueInterval) return;
  _printQueueInterval = setInterval(processPrintQueue, 500);
  console.log('[PRINT] Queue worker démarré (coordinateur)');
}

function stopPrintQueueWorker() {
  if (_printQueueInterval) { clearInterval(_printQueueInterval); _printQueueInterval = null; }
}

async function processPrintQueue() {
  if (_printQueueRunning) return;
  _printQueueRunning = true;
  try {
    const job = _db.prepare("SELECT * FROM print_queue WHERE status='queued' ORDER BY priority ASC, id ASC LIMIT 1").get();
    if (!job) { _printQueueRunning = false; return; }
    _db.prepare("UPDATE print_queue SET status='printing' WHERE id=?").run(job.id);
    console.log('[PRINT] Job ' + job.job_id.slice(0, 8) + ' type=' + job.print_type);
    try {
      const data = JSON.parse(job.data_json);
      const { ticketSizeMm, copiesTicket, copiesShift } = _getPrintSettings();

      const printerMode = _db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
      const targetId = _db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
      const useRemote = printerMode === 'shared' && targetId && targetId !== _MACHINE_ID;

      if (useRemote) {
        const peer = _peersMap.get(targetId);
        if (peer?.ws?.readyState === 1) {
          console.log('[PRINT] Router job vers machine distante: ' + targetId);
          await _sendPrintRequest(targetId, job.print_type, data);
          _db.prepare("UPDATE print_queue SET status='done', done_at=datetime('now','utc') WHERE id=?").run(job.id);
          notifyPrintDone(job.job_id, job.machine_source, true, null);
          _printQueueRunning = false;
          return;
        } else {
          console.warn('[PRINT] Machine distante hors ligne (' + targetId + ') — fallback local');
        }
      }

      if (job.print_type === 'ticket') {
        let qrDataUrl = '';
        if (_QRCode) try { const t = [data.numeroFacture || 'N/A', `${data.total} ${data.currency}`, data.date, data.seller].join('|'); qrDataUrl = await _QRCode.toDataURL(t, { width: 128, margin: 2, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } }); } catch (_e) {}
        await _printHTML(_generateTicketHTML({ ...data, qrDataUrl, flags: _getTicketFlags(), ticketSizeMm }), data.copies || copiesTicket || 2, true);
      } else if (job.print_type === 'shift') {
        await _printHTML(_generateShiftHTML({ ...data, ticketSizeMm }), data.copies || copiesShift || 1, true);
      } else if (job.print_type === 'caderno') {
        await _printHTML(_generateCadernoTicketHTML({ ...data, ticketSizeMm }), 1, true);
      }
      _db.prepare("UPDATE print_queue SET status='done', done_at=datetime('now','utc') WHERE id=?").run(job.id);
      notifyPrintDone(job.job_id, job.machine_source, true, null);
    } catch (printErr) {
      console.error('[PRINT] Job échoué:', printErr.message);
      _db.prepare("UPDATE print_queue SET status='failed', error=? WHERE id=?").run(printErr.message, job.id);
      notifyPrintDone(job.job_id, job.machine_source, false, printErr.message);
    }
  } catch (e) { console.error('[PRINT] processPrintQueue:', e.message); }
  _printQueueRunning = false;
}

function notifyPrintDone(job_id, sourceMachineId, success, error) {
  if (sourceMachineId === _MACHINE_ID) {
    const cb = _printDoneCallbacks.get(job_id);
    if (cb) { clearTimeout(cb.timer); _printDoneCallbacks.delete(job_id); cb.resolve({ success, error }); }
    return;
  }
  const peer = _peersMap.get(sourceMachineId);
  if (peer?.ws?.readyState === 1) try { peer.secureSend({ type: 'PRINT_DONE', job_id, success, error: error || null }); } catch (_e) {}
}

function handlePrintEnqueue(ws, msg) {
  if (!_isCoordinator) {
    try { _secureSend(ws, { type: 'PRINT_QUEUED', job_id: msg.job_id, position: -1, error: 'not_coordinator' }); } catch (_e) {}
    return;
  }
  try {
    const { job_id, print_type, data, priority, machine_source } = msg;
    _db.prepare('INSERT OR IGNORE INTO print_queue (job_id,print_type,data_json,priority,machine_source) VALUES (?,?,?,?,?)')
      .run(job_id, print_type, JSON.stringify(data), priority || 5, machine_source || _MACHINE_ID);
    const position = _db.prepare("SELECT COUNT(*) as c FROM print_queue WHERE status='queued' AND id<=(SELECT id FROM print_queue WHERE job_id=?)").get(job_id)?.c || 1;
    _secureSend(ws, { type: 'PRINT_QUEUED', job_id, position });
    console.log('[PRINT] Enqueued job=' + job_id.slice(0, 8) + ' pos=' + position);
  } catch (e) {
    console.error('[PRINT] handlePrintEnqueue:', e.message);
    try { _secureSend(ws, { type: 'PRINT_QUEUED', job_id: msg.job_id, position: -1, error: e.message }); } catch (_e) {}
  }
}

function handlePrintQueued(msg) {
  const cb = _printQueuedCallbacks.get(msg.job_id);
  if (!cb) return;
  clearTimeout(cb.timer);
  _printQueuedCallbacks.delete(msg.job_id);
  cb.resolve({ success: !msg.error, job_id: msg.job_id, position: msg.position, queued: true });
}

function handlePrintDoneReceived(msg) {
  const cb = _printDoneCallbacks.get(msg.job_id);
  if (!cb) return;
  clearTimeout(cb.timer);
  _printDoneCallbacks.delete(msg.job_id);
  cb.resolve({ success: msg.success, error: msg.error });
}

function enqueuePrintJob(print_type, data, priority) {
  return new Promise((resolve) => {
    const job_id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    if (_isCoordinator) {
      try {
        _db.prepare('INSERT OR IGNORE INTO print_queue (job_id,print_type,data_json,priority,machine_source) VALUES (?,?,?,?,?)')
          .run(job_id, print_type, JSON.stringify(data), priority || 5, _MACHINE_ID);
        resolve({ success: true, job_id, position: 1, queued: true });
      } catch (e) { resolve({ success: false, error: e.message }); }
      return;
    }
    const coordPeer = _peersMap.get(_coordinatorId);
    if (!coordPeer || coordPeer.ws?.readyState !== 1) {
      console.warn('[PRINT] Coordinador offline — modo degradado');
      resolve({ success: false, degraded: true, job_id });
      return;
    }
    const timer = setTimeout(() => {
      _printQueuedCallbacks.delete(job_id);
      resolve({ success: false, degraded: true, job_id, error: 'timeout' });
    }, 3000);
    _printQueuedCallbacks.set(job_id, { resolve, timer });
    coordPeer.secureSend({ type: 'PRINT_ENQUEUE', job_id, print_type, data, priority: priority || 5, machine_source: _MACHINE_ID });
  });
}

// ── Degraded Mode ──────────────────────────────────────────────

function startDegradedMonitor() {
  setInterval(() => {
    const wasDegraded = _degradedMode;
    _degradedMode = _isCoordinator ? false : !_coordinatorId || (Date.now() - _lastCoordSeen > COORD_TTL_MS * 2);
    if (_degradedMode && !wasDegraded) console.warn('[COORD] MODE DÉGRADÉ activé');
    if (!_degradedMode && wasDegraded) console.log('[COORD] Mode normal restauré');
  }, 5000);
}

// ── Coord v3 handler ───────────────────────────────────────────

function handleSyncMessageV3(msg) {
  if (msg.type === 'COORD_ANNOUNCE') handleCoordAnnounce(msg);
  else if (msg.type === 'STOCK_RESERVE') return { handled: true, fn: () => handleStockReserve(null, msg) };
  else if (msg.type === 'STOCK_RELEASE') handleStockRelease(msg);
  else if (msg.type === 'STOCK_RESERVED') handleStockReserved(msg);
  else if (msg.type === 'PRINT_ENQUEUE') return { handled: true, fn: () => handlePrintEnqueue(null, msg) };
  else if (msg.type === 'PRINT_QUEUED') handlePrintQueued(msg);
  else if (msg.type === 'PRINT_DONE') handlePrintDoneReceived(msg);
  return { handled: false };
}

// ── Register IPC ───────────────────────────────────────────────

function registerIPC(ipcMain) {
  ipcMain.handle('coord-status', () => ({ success: true, isCoordinator: _isCoordinator, coordinatorId: _coordinatorId, coordinatorLabel: _coordinatorLabel, degraded: _degradedMode || false }));

  ipcMain.handle('stock-reserve', async (_, { product_id, variant_id, qty }) => {
    try { return { success: true, ...(await requestStockReservation(product_id, variant_id || null, qty)) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('stock-release', (_, { reservation_id, consumed }) => {
    releaseStockReservation(reservation_id, consumed !== false);
    return { success: true };
  });

  ipcMain.handle('print-queue-status', () => {
    try {
      const queued = _db.prepare("SELECT COUNT(*) as c FROM print_queue WHERE status='queued'").get()?.c || 0;
      const printing = _db.prepare("SELECT COUNT(*) as c FROM print_queue WHERE status='printing'").get()?.c || 0;
      return { success: true, queued, printing, isCoordinator: _isCoordinator, coordinatorId: _coordinatorId, coordinatorLabel: _coordinatorLabel };
    } catch (e) { return { success: false }; }
  });
}

function startTimers() {
  _coordCheckTimer = setInterval(runCoordElection, 10000);
  _coordAnnounceTimer = setInterval(() => { if (_isCoordinator) broadcastCoordAnnounce(); }, 5000);
  setTimeout(() => { if (!_coordinatorId) { if (shouldBeCoordinator()) becomeCoordinator(); else runCoordElection(); } }, 3000);
  startDegradedMonitor();
  setInterval(() => {
    try { _db.prepare("UPDATE stock_reservations SET status='expired' WHERE status='active' AND expires_at < datetime('now','utc')").run(); } catch (_e) {}
  }, 30000);
}

module.exports = {
  init, registerIPC, startTimers,
  handleSyncMessageV3,
  requestStockReservation, releaseStockReservation,
  enqueuePrintJob, handlePrintEnqueue, handlePrintQueued, handlePrintDoneReceived,
  handleStockReserve, handleStockRelease, handleStockReserved,
  startPrintQueueWorker, stopPrintQueueWorker,
  get isCoordinator() { return _isCoordinator; },
  get coordinatorId() { return _coordinatorId; },
  get coordinatorLabel() { return _coordinatorLabel; },
  get degradedMode() { return _degradedMode; },
};
