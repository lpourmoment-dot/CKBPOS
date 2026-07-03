/**
 * CKBPOS In-App Console
 * =====================
 * Intercepts console.log/error/warn → sends to renderer.
 * Captures tags like [LAN] [SYNC] [BEAT] [DB].
 * 250-entry circular buffer.
 *
 * Extracted from main.js during v5.1 refactor.
 */

'use strict';

const MAX_LOG_BUFFER = 250;

let _mainWindowRef = null;
const _logBuffer = [];

const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);

function _pushLog(level, args) {
  try {
    const raw = args.map(a => {
      if (a instanceof Error) return a.message;
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch (_e2) { return String(a); } }
      return String(a);
    }).join(' ');

    const tagMatch = raw.match(/^(\[[A-Z0-9_]+\])\s*/);
    const tag = tagMatch ? tagMatch[1] : '[LOG]';
    const msg = tagMatch ? raw.slice(tagMatch[0].length) : raw;

    const entry = {
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      tag, msg, level,
    };
    _logBuffer.push(entry);
    if (_logBuffer.length > MAX_LOG_BUFFER) _logBuffer.shift();

    if (_mainWindowRef && !_mainWindowRef.isDestroyed()) {
      try { _mainWindowRef.webContents.send('debug-log', entry); } catch (_e2) {}
    }
  } catch (_e2) {}
}

function initConsole(mainWindow) {
  _mainWindowRef = mainWindow;
  console.log = (...a) => { _origLog(...a); _pushLog('info', a); };
  console.error = (...a) => { _origError(...a); _pushLog('error', a); };
  console.warn = (...a) => { _origWarn(...a); _pushLog('warn', a); };
}

function getLogs() {
  return [..._logBuffer];
}

function registerIPC(ipcMain) {
  ipcMain.handle('debug-logs-get', () => ({ success: true, data: [..._logBuffer] }));
}

module.exports = { initConsole, getLogs, registerIPC };
