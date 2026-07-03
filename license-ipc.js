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

  // ── v4.9.5 — Vérification périodique de la licence (toutes les 30 min) ──
  // Même pattern que le check auto-update existant dans main.js.
  // Notifie le renderer pour forcer un refresh React — couvre le cas d'une
  // expiration de date qui tombe pendant une session inactive.
  function periodicLicenseCheck() {
    try {
      const payload = getStoredPayload(db);
      const salesUsed = getSalesUsed(db);
      const status = evaluateStatus(payload, machineId, salesUsed);
      if (global._mainWindowRef && !global._mainWindowRef.isDestroyed()) {
        global._mainWindowRef.webContents.send('license-sales-updated');
      }
      if (!status.valid && payload) {
        console.log('[LICENSE] Periodic check — statut invalide:', status.reason);
      }
    } catch (_e) {
      // silencieux — ne jamais crasher l'app pour un check licence
    }
  }

  // Premier check différé (10s) + intervalle 30 min
  setTimeout(periodicLicenseCheck, 10000);
  setInterval(periodicLicenseCheck, 30 * 60 * 1000);

  function activate(ckbContent) {
    const payload = validateCkbContent(ckbContent, machineId);
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

      const cleanEmail = email.toLowerCase().trim();

      // \u2705 Fix race condition (persistance) : recuperer immediatement toute
      // licence deja deposee avant qu'on ait commence a ecouter (ex: admin
      // a cree la licence pendant que le client etait hors ligne).
      async function applyDelivery(row) {
        const payload = activate(row.ckb_content);
        try {
          await supabaseClient.from('license_deliveries').update({ delivered: true }).eq('id', row.id);
        } catch (_e) { /* non bloquant */ }
        if (global._mainWindowRef) {
          global._mainWindowRef.webContents.send('license-received', payload);
        }
        return payload;
      }

      try {
        const { data: pending } = await supabaseClient
          .from('license_deliveries')
          .select('*')
          .eq('email', cleanEmail)
          .eq('delivered', false)
          .order('created_at', { ascending: false })
          .limit(1);
        if (pending && pending.length > 0) {
          await applyDelivery(pending[0]);
          return { ok: true, immediate: true };
        }
      } catch (err) {
        console.error('[license-listen-realtime] check pending echoue:', err);
      }

      if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

      const channelName = 'license-' + cleanEmail.replace(/[^a-z0-9]/g, '_');
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

      // \u2705 Filet de securite supplementaire : si la livraison persistee arrive
      // pendant qu'on ecoute (postgres_changes), on l'applique aussi — couvre
      // le cas ou le broadcast ephemere serait manque pour une autre raison.
      realtimeChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'license_deliveries', filter: `email=eq.${cleanEmail}` },
        (payload) => {
          applyDelivery(payload.new).catch((err) =>
            console.error('[license-listen-realtime] postgres_changes activation echouee:', err)
          );
        }
      );

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

  function ensureSupabaseClient() {
    if (!supabaseClient) {
      const { url, anonKey } = getSupabaseConfig();
      supabaseClient = createClient(url, anonKey, { realtime: { transport: WebSocket } });
    }
    return supabaseClient;
  }

  // ── v5 — Achat de licenca en self-service (sans WhatsApp) ──
  // Tarifs lus depuis tier_config_cloud (synchronises par CKBPOS-ADMIN),
  // accessibles meme si l'app Admin est fermee.
  ipcMain.handle('purchase-tiers-list', async () => {
    try {
      const client = ensureSupabaseClient();
      const { data, error } = await client.from('tier_config_cloud').select('*').order('price', { ascending: true });
      if (error) throw new Error(error.message);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Soumet une demande d'achat : upload du comprovativo (image/PDF) dans le
  // bucket Storage 'comprovativos', puis insertion dans purchase_requests.
  // L'admin la verra dans l'onglet "Solicitacoes de compra" et pourra
  // confirmer -> licence generee + livree automatiquement (pipeline existant).
  ipcMain.handle('purchase-request-submit', async (e, req) => {
    try {
      const { email, client_name, whatsapp, tier, comprovativoBase64, comprovativoName, comprovativoMime } = req;
      if (!email || !tier || !comprovativoBase64) throw new Error('Dados incompletos');

      const client = ensureSupabaseClient();
      const cleanEmail = email.toLowerCase().trim();
      const buffer = Buffer.from(comprovativoBase64, 'base64');
      const safeName = `${Date.now()}_${(comprovativoName || 'comprovativo').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const path = `${cleanEmail.replace(/[^a-z0-9]/g, '_')}/${safeName}`;

      const { error: upErr } = await client.storage
        .from('comprovativos')
        .upload(path, buffer, { contentType: comprovativoMime || 'application/octet-stream' });
      if (upErr) throw new Error(upErr.message);

      const { error: insErr } = await client.from('purchase_requests').insert({
        email: cleanEmail,
        client_name: client_name || null,
        whatsapp: whatsapp || null,
        tier,
        machine_id: machineId,
        comprovativo_path: path,
      });
      if (insErr) throw new Error(insErr.message);

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerLicenseIPC, incrementSalesCounter, getStoredPayload, getSalesUsed };
