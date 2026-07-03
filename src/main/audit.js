/**
 * CKBPOS Audit Log Module
 * =======================
 * Centralized action logging + PDF export.
 * Extracted from main.js during v5.1 refactor.
 */

'use strict';

let _db, _MACHINE_ID;

function init(ctx) {
  _db = ctx.db;
  _MACHINE_ID = ctx.MACHINE_ID;
}

function ensureTable() {
  try {
    _db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_nom TEXT,
      action TEXT NOT NULL,
      details TEXT,
      machine_id TEXT,
      machine_label TEXT,
      ts TEXT DEFAULT (datetime('now','utc'))
    )`);
  } catch (_e) {}
}

function insertAuditLog(user_id, user_nom, action, details) {
  try {
    const labelRow = _db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
    const ml = labelRow?.value || 'CKBPOS';
    _db.prepare('INSERT INTO audit_log (user_id, user_nom, action, details, machine_id, machine_label) VALUES (?,?,?,?,?,?)')
      .run(user_id || null, user_nom || 'system', action, details || null, _MACHINE_ID, ml);
  } catch (_e) {}
}

function registerIPC(ipcMain) {
  ipcMain.handle('audit-login', (_, { user_id, user_nom, action, details }) => {
    try {
      insertAuditLog(user_id || null, user_nom || 'unknown', action || 'LOGIN', details || null);
      return { success: true };
    } catch (e) { return { success: false }; }
  });

  ipcMain.handle('audit-list', (_, { limit, offset, user_id, action, date_from, date_to }) => {
    try {
      let sql = 'SELECT * FROM audit_log WHERE 1=1';
      const params = [];
      if (user_id) { sql += ' AND user_id=?'; params.push(user_id); }
      if (action) { sql += ' AND action=?'; params.push(action); }
      if (date_from) { sql += ' AND ts >= ?'; params.push(date_from + ' 00:00:00'); }
      if (date_to) { sql += ' AND ts <= ?'; params.push(date_to + ' 23:59:59'); }
      sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
      params.push(limit || 100, offset || 0);
      const data = _db.prepare(sql).all(...params);
      const total = _db.prepare('SELECT COUNT(*) as c FROM audit_log WHERE 1=1' +
        (user_id ? ' AND user_id=?' : '') +
        (action ? ' AND action=?' : '') +
        (date_from ? ' AND ts >= ?' : '') +
        (date_to ? ' AND ts <= ?' : '')
      ).get(...params.slice(0, -2))?.c || 0;
      return { success: true, data, total };
    } catch (e) { return { success: false, data: [], total: 0 }; }
  });

  ipcMain.handle('audit-actions', () => {
    try {
      const rows = _db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all();
      return { success: true, data: rows.map(r => r.action) };
    } catch (e) { return { success: false, data: [] }; }
  });
}

module.exports = { init, ensureTable, insertAuditLog, registerIPC };
