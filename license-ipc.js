// license-ipc.js — CKBPOS (cote client)
//
// Module autonome a brancher dans main.js avec :
//   const { registerLicenseIPC } = require('./license-ipc');
//   registerLicenseIPC(db, ipcMain, getMachineId());  // a la fin de app.whenReady()
//
// Expose aussi incrementSalesCounter(db) a appeler a chaque vente validee
// (cote CKBPOS, dans le handler qui enregistre une vente).

const { validateCkbContent, evaluateStatus, getSupabaseConfig } = require('./licensing');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

function getSetting(db, key) {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`).run(key, value);
}

function getStoredPayload(db) {
  const raw = getSetting(db, 'license_payload');
  return raw ? JSON.parse(raw) : null;
}

function getSalesUsed(db) {
  return parseInt(getSetting(db, 'license_sales_used') || '0', 10);
}

function incrementSalesCounter(db) {
  const current = getSalesUsed(db);
  setSetting(db, 'license_sales_used', String(current + 1));
}

function registerLicenseIPC(db, ipcMain, machineId) {
  let realtimeChannel = null;
  let supabaseClient = null;

  function activate(ckbContent) {
    const payload = validateCkbContent(ckbContent);
    setSetting(db, 'license_payload', JSON.stringify(payload));
    setSetting(db, 'license_ckb_raw', ckbContent);
    return payload;
  }

  ipcMain.handle('license-activate-manual', (e, ckbContent) => {
    try {
      const payload = activate(ckbContent);
      return { ok: true, data: payload };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('license-status', () => {
    try {
      const payload = getStoredPayload(db);
      const salesUsed = getSalesUsed(db);
      const status = evaluateStatus(payload, machineId, salesUsed);
      return { ok: true, data: { ...status, salesUsed, payload } };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Ecoute Supabase Realtime : recoit automatiquement le .ckb apres paiement confirme
  ipcMain.handle('license-listen-realtime', async (e, email) => {
    try {
      const { url, anonKey } = getSupabaseConfig();
      if (!supabaseClient) supabaseClient = createClient(url, anonKey, {
        realtime: { transport: WebSocket },
      });

      if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

      const channelName = 'license-' + email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
      realtimeChannel = supabaseClient.channel(channelName);

      realtimeChannel.on('broadcast', { event: 'license-delivered' }, (msg) => {
        try {
          const payload = activate(msg.payload.ckbContent);
          if (global._mainWindowRef) {
            global._mainWindowRef.webContents.send('license-received', payload);
          }
        } catch (err) {
          console.error('[license-listen-realtime] activation echouee:', err);
        }
      });

      // \u2705 Fix race condition : attendre la confirmation reelle de jonction
      // (SUBSCRIBED) avant de signaler au renderer que l'ecoute est active.
      // Sans ca, un broadcast emis juste apres l'appel pouvait arriver avant
      // que le channel soit reellement rejoint cote serveur Supabase.
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 8000);
        realtimeChannel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timeout);
            reject(err || new Error('Realtime subscribe failed: ' + status));
          }
        });
      });

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('license-stop-listen', () => {
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    return { ok: true };
  });
}

module.exports = { registerLicenseIPC, incrementSalesCounter, getStoredPayload, getSalesUsed };
