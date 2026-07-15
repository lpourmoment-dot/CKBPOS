// ── STARTUP GUARD ──────────────────────────────────────────────
// Les checks sont déclenchés dans app.whenReady() — app.getAppPath() n'est
// pas fiable avant que le processus principal ne soit prêt.
const { checkStartupFiles, showStartupError } = require('./scripts/startup-guard');
// ── FIN STARTUP GUARD ──────────────────────────────────────────

const { registerLicenseIPC, incrementSalesCounter } = require('./license-ipc');
const { generateTicketHTML, generateHistoriqueTicketHTML, generateShiftHTML, generateProdutosHTML, generateProdutosTicketHTML, generateHistoriqueHTML, generateCadernoTicketHTML, fmtNum, fmtDate } = require('./src/main/templates');
const consoleModule = require('./src/main/console');
const coordinatorModule = require('./src/main/coordinator');
const auditModule = require('./src/main/audit');
const emailModule = require('./src/main/email');
const excelModule = require('./src/main/excel');
// \u2705 Licensing — notifie le renderer pour re-verifier l'acces immediatement apres une vente
function notifyLicenseSalesUpdated() {
  try {
    if (global._mainWindowRef && !global._mainWindowRef.isDestroyed()) {
      global._mainWindowRef.webContents.send('license-sales-updated');
    }
  } catch (_e) {}
}
const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const store = new Store();

// QR Code generator (npm install qrcode)
let QRCode = null;
try { QRCode = require('qrcode'); } catch(e) { console.log('qrcode non installé, QR désactivé'); }

// ── Adaptive Print Engine (v5.0) ────────────────────────────
const { adaptivePrint, getCachedCapabilities, clearCapabilityCache, getPrintStats } = require('./src/utils/adaptive-print');
const { detectPrinterCapabilities, classifyPrinter } = require('./src/utils/printer-detect');
const { createTicketBuilder } = require('./src/utils/escpos');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development' || (!app.isPackaged && process.env.NODE_ENV !== 'production');

// \u2705 Auto-update (electron-updater)
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch(e) { console.log('electron-updater non installé'); }

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1280, height:800, minWidth:1024, minHeight:700,
    // global._mainWindowRef defini juste apres la creation (voir plus bas)
    webPreferences:{
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname,'preload.js'),
      spellcheck: false,          // Fix input freeze sur Windows
      backgroundThrottling: false // Empêche le gel en arrière-plan
    },
    titleBarStyle: 'hidden',
    frame: false,
    backgroundColor: '#0f0f0f',
    show: false,
  });

  // \u2705 Licensing — reference globale pour notifications realtime (license-ipc.js)
  global._mainWindowRef = mainWindow;

  // Fix bug input Electron Windows : redonner le focus au webContents
  // quand la fenêtre reprend le focus (évite le freeze des inputs)
  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.focus();
    }
  });

  // Fix supplémentaire : forcer le focus sur la fenêtre principale
  // après chaque interaction système (dialog, impression, etc.)
  mainWindow.on('blur', () => {
    // Re-focus automatique après 100ms si aucune autre fenêtre active
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
        // Ne pas forcer le focus si une autre app est au premier plan
      }
    }, 100);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    consoleModule.initConsole(mainWindow);
    mainWindow.focus();
    mainWindow.webContents.focus();
    // \u2705 Fix charset UTF-8 : injecter meta charset si absent (corrige symboles/emojis cassés)
    mainWindow.webContents.executeJavaScript(`
      if (!document.querySelector('meta[charset]')) {
        const m = document.createElement('meta');
        m.setAttribute('charset', 'UTF-8');
        document.head.prepend(m);
      }
    `).catch(()=>{});
  });

  // DevTools uniquement en mode développement (F12 / Ctrl+Shift+I)
  if (isDev) {
    mainWindow.webContents.on('before-input-event', (_, input) => {
      if (input.type === 'keyDown' && (
        input.key === 'F12' ||
        (input.control && input.shift && input.key === 'I')
      )) {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  // ── Anti-debug en production ──
  if (!isDev) {
    // Fermer DevTools si ouvert en production (détection périodique)
    const _antiDebugInterval = setInterval(() => {
      try {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        }
      } catch(_e) {}
    }, 3000);

    // Bloquer l'ouverture de DevTools via context menu ou autre moyen
    mainWindow.webContents.on('devtools-opened', () => {
      try { mainWindow.webContents.closeDevTools(); } catch(_e) {}
    });
  }

  // ── Anti-tamper: détection d'environnement de debug ──
  if (!isDev) {
    // Vérifier les variables d'environnement suspectes (x64dbg, ollydbg, etc.)
    const _debugEnvVars = ['NODE_OPTIONS', 'ELECTRON_ENABLE_LOGGING', 'ELECTRON_ENABLE_STACK_DUMPING'];
    for (const envVar of _debugEnvVars) {
      if (process.env[envVar]) {
        console.error(`[SECURITY] Variable de debug détectée: ${envVar}`);
        // Optionnel: quitter l'app
        // app.exit(1);
      }
    }
  }

  if (isDev) {
    // Désactiver le cache en mode dev
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      details.requestHeaders['Pragma'] = 'no-cache';
      details.requestHeaders['Expires'] = '0';
      callback({ requestHeaders: details.requestHeaders });
    });

    // Attendre que React dev server soit prêt avant de charger
    mainWindow.loadURL('http://localhost:3000');

    // Recharger si la page est blanche/noire (fallback après 5s)
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript('document.body.innerHTML.length').then(len => {
          if (len < 10) {
            console.log('[DEV] Page vide détectée, rechargement...');
            mainWindow.webContents.reloadIgnoringCache();
          }
        }).catch(() => {});
      }
    }, 5000);
  } else {
    mainWindow.loadFile(path.join(__dirname,'build','index.html'));
  }
}

// ── Auto-update (electron-updater) ──────────────────────────
// Source principale : serveur Windows distant (provider "generic" dans package.json>build.publish)
// Fallback : GitHub Releases (2e entrée du tableau publish)
let _updateCheckInProgress = false;

function setupAutoUpdater() {
  if (!autoUpdater || isDev) return; // pas de check en dev

  autoUpdater.autoDownload = false;       // on demande confirmation avant de télécharger
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    _send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    _send('update-status', { status: 'available', version: info.version, releaseDate: info.releaseDate });
  });

  autoUpdater.on('update-not-available', () => {
    _send('update-status', { status: 'not-available' });
  });

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err?.message || err);
    _send('update-status', { status: 'error', error: err?.message || String(err) });
  });

  autoUpdater.on('download-progress', (progress) => {
    _send('update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    _send('update-status', { status: 'downloaded', version: info.version });
  });
}

function _send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send(channel, payload); } catch(_e) {}
  }
}

async function checkForUpdates(silent) {
  if (!autoUpdater || isDev) return { success: false, error: 'auto-update indisponible en dev' };
  if (_updateCheckInProgress) return { success: false, error: 'vérification déjà en cours' };
  _updateCheckInProgress = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, data: result ? { version: result.updateInfo?.version } : null };
  } catch(e) {
    if (!silent) console.error('[checkForUpdates]', e.message);
    return { success: false, error: e.message };
  } finally {
    _updateCheckInProgress = false;
  }
}

ipcMain.handle('update-check', () => checkForUpdates(false));
ipcMain.handle('update-download', async () => {
  if (!autoUpdater) return { success: false, error: 'auto-update indisponible' };
  try { await autoUpdater.downloadUpdate(); return { success: true }; }
  catch(e) { return { success: false, error: e.message }; }
});
ipcMain.handle('update-install', () => {
  if (!autoUpdater) return { success: false, error: 'auto-update indisponible' };
  autoUpdater.quitAndInstall(false, true);
  return { success: true };
});

app.whenReady().then(() => {
  // Startup guard — vérifier les fichiers critiques après que app est prêt
  const _startupCheck = checkStartupFiles(require('electron').app);
  if (!_startupCheck.ok) {
    showStartupError(require('electron').app, _startupCheck.missing, _startupCheck.tampered);
    return;
  }
  createWindow();
  // Certificate pinning pour Supabase (anti-MITM)
  try { const { setupCertPinning } = require('./scripts/cert-pinning'); setupCertPinning(require('electron').session); } catch(_e) {}
  // DB Encryption: chiffer à l'arrêt
  try { setupExitEncryption(_dbPath); } catch(_e) {}
  // Pré-charger les modules lourds en arrière-plan après que la fenêtre est prête
  setTimeout(() => {
    try { require('./database/driveSync'); } catch(e) {}
  }, 2000);
  // v1.4.0 — Services réseau LAN (WS + UDP) — délai pour laisser la BDD s'initialiser
  setTimeout(startNetworkServices, 1500);
  // Auto-update : check au démarrage (5s après affichage, silencieux si rien)
  setupAutoUpdater();
  setTimeout(() => checkForUpdates(true), 5000);
  // \u2705 Licensing — enregistrement des IPC de licence (apres init complete du module)
  setTimeout(() => {
    try { registerLicenseIPC(db, ipcMain, MACHINE_ID); }
    catch(e) { console.error('[LICENSE] registerLicenseIPC echoue:', e.message); }
  }, 100);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());

ipcMain.handle('store-get', (_, key) => store.get(key));
consoleModule.registerIPC(ipcMain);
ipcMain.handle('store-set', (_, key, value) => { store.set(key, value); return true; });
ipcMain.handle('store-delete', (_, key) => { store.delete(key); return true; });

// Lister les imprimantes disponibles (enhanced v5.0)
ipcMain.handle('get-printers', async () => {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    // v5.0 — Include capability detection for each printer
    const enhanced = printers.map(p => {
      const caps = detectPrinterCapabilities(p);
      return {
        name: p.name,
        driverName: p.driverName || '',
        portName: p.portName || '',
        // v5.0 capability info
        type: caps.type,
        connection: caps.connection,
        supportsESCPOS: caps.supportsESCPOS,
        estimatedWidth: caps.estimatedWidth,
        recommendedMethod: caps.recommendedMethod,
      };
    });
    return { success: true, data: enhanced };
  } catch(e) { return { success: false, error: e.message, data: [] }; }
});

// ── v5.0 — Printer capability detection ───────────────────
ipcMain.handle('detect-printer', async (_, printerName) => {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const printer = printers.find(p => p.name === printerName) || { name: printerName };
    const caps = detectPrinterCapabilities(printer);
    console.log('[PRINT] Detected:', JSON.stringify(caps));
    return { success: true, data: caps };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── v5.0 — Test print ────────────────────────────────────
ipcMain.handle('test-print', async (_, { printerName, method }) => {
  try {
    const settings = getPrintSettings();
    const testHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @page { size: ${settings.ticketSizeMm || 72}mm auto; margin: 0; }
      body { font-family: 'Courier New', monospace; font-size: 12px; width: ${settings.ticketSizeMm || 72}mm; padding: 4mm 2mm; }
      .center { text-align: center; }
      .bold { font-weight: 900; }
    </style></head><body>
    <div class="center bold" style="font-size:16px;">CKBPOS-PRO</div>
    <div class="center">Teste de Impressao</div>
    <div style="border-top:2px solid #000;margin:8px 0;"></div>
    <div>Data: ${new Date().toLocaleString('pt-BR')}</div>
    <div>Impressora: ${printerName || 'Padrao'}</div>
    <div>Metodo: ${method || 'Auto'}</div>
    <div style="border-top:2px solid #000;margin:8px 0;"></div>
    <div class="center bold">OK!</div>
    <div style="border-top:2px solid #000;margin:8px 0;"></div>
    <div class="center" style="font-size:9px;">CKBPOS-PRO v${APP_VERSION}</div>
    </body></html>`;

    const ticketData = {
      shopName: 'CKBPOS-PRO',
      shopAddress: 'Teste de Impressao',
      shopPhone: '',
      shopNif: '',
      clientNom: '',
      clientNif: '',
      items: [{ name: 'Item Teste', qty: 1, price: '0', subtotal: '0', type: 'unidade' }],
      total: '0',
      cashGiven: '',
      change: '',
      seller: 'Teste',
      date: new Date().toLocaleString('pt-BR'),
      currency: 'Kz',
      payMode: 'dinheiro',
      montantDinheiro: '',
      montantExpress: '',
      numeroFacture: 'TEST-001',
      segundaVia: false,
      statut: '',
      flags: {},
      appVersion: APP_VERSION,
    };

    const result = await printHTML(testHtml, 1, true, ticketData);
    return { success: true, ...result };
  } catch(e) {
    console.error('[PRINT] Test print error:', e.message);
    return { success: false, error: e.message };
  }
});

// ── v5.0 — Get print statistics ──────────────────────────
ipcMain.handle('print-stats', () => {
  try {
    return { success: true, data: getPrintStats() };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── v5.0 — Reset print cache ─────────────────────────────
ipcMain.handle('print-cache-reset', () => {
  try {
    clearCapabilityCache();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── DB Encryption: déchiffrer AVANT ouverture ──
const { preDecryptDb, setupExitEncryption } = require('./scripts/db-encryption');
const _dbPath = require('path').join(require('electron').app.getPath('userData'), 'ckbpos.db');
preDecryptDb(_dbPath);

const db = require('./database/db');
const { MACHINE_ID } = require('./database/db');
// Version auto depuis package.json
const APP_VERSION = (() => { try { return require('./package.json').version; } catch(e) { return '3.2.0'; } })();
// ✅ Version auto depuis package.json — utilisé dans SettingsPage.js
ipcMain.handle('app-version', () => APP_VERSION);

// Initialize extracted modules
auditModule.init({ db, MACHINE_ID });
emailModule.init({ db, APP_VERSION });
excelModule.init({ db, app });

const DB_QUERY_WHITELIST = new Set([
  'users','products','product_variants','stock_mouvements','ventes','vente_items',
  'shifts','settings','clients','reservations','reservation_items','empresas',
  'caderno_entries','caderno_motivos','caderno_trabalhadores','caderno_produtos',
  'network_peers','sync_log','sync_state','stock_reservations','print_queue',
  'coordinator_log','user_sessions','document_series','fiscal_config',
  'lancamentos_contabilisticos','pgc_contas','historique_modifications',
  'notas_credito_debito'
]);

ipcMain.handle('db-query', (_, sql, params) => {
  try {
    // Whitelist : extraire les noms de tables de la requête et vérifier
    const tablePattern = /\b(?:FROM|INTO|UPDATE|JOIN)\s+["`]?(\w+)["`]?/gi;
    let m;
    while ((m = tablePattern.exec(sql)) !== null) {
      const tbl = m[1].toLowerCase();
      if (!DB_QUERY_WHITELIST.has(tbl)) {
        return { success:false, error:'Table non autorisée: ' + tbl };
      }
    }
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return { success:true, data:db.prepare(sql).all(...(params||[])) };
    }
    // v3.4 — Injecter machine_id automatiquement dans INSERT INTO ventes si absent
    let finalSql    = sql;
    let finalParams = params ? [...params] : [];
    const sqlUp = sql.trim().toUpperCase();
    if (sqlUp.startsWith('INSERT') && /\bVENTES\b/.test(sqlUp) && !/MACHINE_ID/.test(sqlUp)) {
      const newSql = sql.replace(
        /INSERT INTO ventes\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
        (m, cols, vals) => 'INSERT INTO ventes (' + cols + ', machine_id) VALUES (' + vals + ', ?)'
      );
      if (newSql !== sql) { finalSql = newSql; finalParams.push(MACHINE_ID); }
    }
    // v4.9.5 — Injecter uuid automatiquement dans INSERT INTO ventes si absent
    if (sqlUp.startsWith('INSERT') && /\bVENTES\b/.test(sqlUp) && !/UUID/i.test(sqlUp)) {
      const { randomUUID } = require('crypto');
      const uuidSql = finalSql.replace(
        /INSERT INTO ventes\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
        (m, cols, vals) => 'INSERT INTO ventes (' + cols + ', uuid) VALUES (' + vals + ', ?)'
      );
      if (uuidSql !== finalSql) { finalSql = uuidSql; finalParams.push(randomUUID()); }
    }
    const result = db.prepare(finalSql).run(...finalParams);

    // \u2705 Licensing — incrémenter le compteur de ventes (tier FREE)
    if (sqlUp.startsWith('INSERT') && /\bVENTES\b/.test(sqlUp)) {
      try { incrementSalesCounter(db); notifyLicenseSalesUpdated(); } catch(_lic) {}
    }

    // v3.8.0 — Enregistrer dans sync_log pour les tables synchées (users, products, etc.)
    const SYNC_WRITE_TABLES = ['USERS','PRODUCTS','STOCK_MOUVEMENTS','CADERNO_ENTRIES','CADERNO_MOTIVOS','CADERNO_TRABALHADORES','CADERNO_PRODUTOS'];
    const matchedTable = SYNC_WRITE_TABLES.find(t => new RegExp('\\b' + t + '\\b').test(sqlUp));
    if (matchedTable && result?.lastInsertRowid) {
      const tableLower = matchedTable.toLowerCase();
      const operation  = sqlUp.startsWith('INSERT') ? 'INSERT' : sqlUp.startsWith('UPDATE') ? 'UPDATE' : 'DELETE';
      const recordId   = result.lastInsertRowid;
      try {
        db.prepare(
          "INSERT INTO sync_log (machine_id, table_name, record_id, operation, synced_to) VALUES (?,?,?,?,'[]')"
        ).run(MACHINE_ID, tableLower, recordId, operation);
      } catch(_sl) {}
    }

    // v4.2.0 — Audit Log automatique (non-bloquant)
    setImmediate(() => {
      try {
        if (typeof insertAuditLog !== 'function') return;
        const auditAction = (() => {
          if (/\bVENTES\b/.test(sqlUp) && sqlUp.startsWith('INSERT') && !/VENTE_ITEMS/.test(sqlUp)) return 'VENTE';
          if (/\bVENTES\b/.test(sqlUp) && /ANNULE/.test(sqlUp)) return 'ANNULATION';
          if (/\bPRODUCTS\b/.test(sqlUp) && sqlUp.startsWith('INSERT')) return 'CREATE_PRODUCT';
          if (/\bPRODUCTS\b/.test(sqlUp) && sqlUp.startsWith('DELETE')) return 'DELETE_PRODUCT';
          if (/\bSTOCK_MOUVEMENTS\b/.test(sqlUp) && sqlUp.startsWith('INSERT')) return 'STOCK_MOUVEMENT';
          if (/\bUSERS\b/.test(sqlUp) && sqlUp.startsWith('INSERT')) return 'CREATE_USER';
          if (/\bUSERS\b/.test(sqlUp) && sqlUp.startsWith('DELETE')) return 'DELETE_USER';
          if (/\bUSERS\b/.test(sqlUp) && sqlUp.startsWith('UPDATE') && !/last_login|tentativas/.test(sql)) return 'UPDATE_USER';
          return null;
        })();
        if (auditAction) insertAuditLog(null, 'system', auditAction, null);
      } catch(_al) {}
    });

    // v1.8.1 — Push instantané si écriture sur ventes/vente_items/users
    if (/\b(VENTES|VENTE_ITEMS|USERS)\b/.test(sqlUp)) {
      setImmediate(() => triggerInstantSync());
    }

    // Auto-caderno : quand une vente est annulée, créer une entrée caderno
    if (sqlUp.startsWith('UPDATE') && /\bVENTES\b/.test(sqlUp) && /ANNULE/.test(sqlUp) && /\bSTATUT\b/.test(sqlUp)) {
      setImmediate(() => {
        try {
          // Extraire l'ID de la vente depuis les params (dernier param = WHERE id=?)
          const venteId = params && params.length > 0 ? params[params.length - 1] : null;
          if (!venteId) return;
          const vente = db.prepare("SELECT id, total, user_id, client_nom, facture_num FROM ventes WHERE id=?").get(venteId);
          if (!vente || !vente.total || vente.total <= 0) return;
          const today = new Date().toISOString().slice(0,10);
          db.prepare(
            `INSERT INTO caderno_entries (nom, motivo, montant, montant_raw, note, direction, est_dette, statut_dette, user_id, machine_id, date_jour)
             VALUES (?, 'Anulação', ?, ?, ?, 'sortie', 0, NULL, ?, ?, ?)`
          ).run(
            vente.client_nom || 'Cliente',
            vente.total,
            `Venda #${vente.id} ${vente.facture_num || ''}`.trim(),
            `Anulação venda #${vente.id}`,
            vente.user_id,
            MACHINE_ID,
            today
          );
          // Écriture PGC : débit 612 / crédit 43
          db.prepare(
            "INSERT INTO lancamentos_contabilisticos (vente_id,descricao,conta_debito,conta_credito,valor,machine_id) VALUES (?,?,?,?,?,?)"
          ).run(venteId, `Anulação Venda #${vente.id}`, '612', '43', vente.total, MACHINE_ID);
        } catch(_ac) { console.error('[CADERNO-AUTO]', _ac.message); }
      });
    }

    return { success:true, data:result };
  } catch(err) { return { success:false, error:err.message }; }
});
ipcMain.handle('db-get', (_, sql, params) => {
  try { return { success:true, data:db.prepare(sql).get(...(params||[])) }; }
  catch(err) { return { success:false, error:err.message }; }
});

// v4.9.6 — Auth bcrypt côté main uniquement (retiré du renderer, évite le polyfill 'crypto' webpack)
ipcMain.handle('auth-hash-password', (_, plain) => {
  try {
    const bcrypt = require('bcryptjs');
    return { success:true, data:bcrypt.hashSync(plain, 10) };
  } catch(err) { return { success:false, error:err.message }; }
});
ipcMain.handle('auth-verify-password', (_, plain, hash) => {
  try {
    const bcrypt = require('bcryptjs');
    return { success:true, data:bcrypt.compareSync(plain, hash || '') };
  } catch(err) { return { success:false, error:err.message }; }
});

// ── Auth login sécurisé (brute-force protection côté serveur) ──
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const _loginAttempts = new Map(); // email -> { count, lastAttempt }

ipcMain.handle('auth-login', (_, { email, password }) => {
  try {
    if (!email || !password) return { success:false, error:'Email et mot de passe requis' };

    // Vérifier lockout
    const record = _loginAttempts.get(email);
    if (record && record.count >= LOGIN_MAX_ATTEMPTS) {
      const elapsed = Date.now() - record.lastAttempt;
      if (elapsed < LOGIN_LOCKOUT_MS) {
        const remaining = Math.ceil((LOGIN_LOCKOUT_MS - elapsed) / 60000);
        return { success:false, error:`Compte temporairement bloqué. Réessayez dans ${remaining} minute(s)` };
      }
      _loginAttempts.delete(email);
    }

    // Trouver l'utilisateur
    const user = db.prepare('SELECT * FROM users WHERE email=? AND actif=1').get(email);
    if (!user) return { success:false, error:'Identifiants invalides' };

    // Vérifier le mot de passe
    const bcrypt = require('bcryptjs');
    const valid = bcrypt.compareSync(password, user.password_hash || '');
    if (!valid) {
      // Incrémenter compteur
      const newCount = (record ? record.count : 0) + 1;
      _loginAttempts.set(email, { count: newCount, lastAttempt: Date.now() });
      try { db.prepare('UPDATE users SET tentativas_login=? WHERE id=?').run(newCount, user.id); } catch(_e) {}
      if (newCount >= LOGIN_MAX_ATTEMPTS) {
        return { success:false, error:'Compte bloqué après 5 tentatives. Réessayez dans 15 minutes.' };
      }
      return { success:false, error:`Identifiants invalides (${newCount}/${LOGIN_MAX_ATTEMPTS})` };
    }

    // Succès — reset compteur
    _loginAttempts.delete(email);
    try {
      db.prepare("UPDATE users SET tentativas_login=0, last_login=datetime('now','utc') WHERE id=?").run(user.id);
    } catch(_e) {}

    return { success:true, data:{ id:user.id, nom:user.nom, email:user.email, role:user.role, peut_modifier_factures:user.peut_modifier_factures } };
  } catch(err) { return { success:false, error:err.message }; }
});

// ── Console SQL (debug terrain) — DEV uniquement ──
ipcMain.handle('dev-sql-query', (_, sql) => {
  if (process.env.NODE_ENV === 'production' || !process.env.ELECTRON_IS_DEV) {
    return { success:false, error:'Non disponible en production' };
  }
  try {
    const s = sql.trim();
    if (!s) return { success:false, error:'Requête vide' };
    const up = s.toUpperCase();
    // Bloquer les commandes destructrices
    const BLOCKED = /^\s*(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE)\b/;
    if (BLOCKED.test(up)) return { success:false, error:'Commande non autorisée en mode debug' };
    if (up.startsWith('SELECT') || up.startsWith('PRAGMA')) {
      const rows = db.prepare(s).all();
      return { success:true, rows, count: rows.length };
    } else {
      return { success:false, error:'Seules les requêtes SELECT/PRAGMA sont autorisées' };
    }
  } catch(e) { return { success:false, error:e.message }; }
});

// ============================================================
// CADERNO DE CAIXA — v1.2.7
// ============================================================

// ── Lister les motivos actifs ──
ipcMain.handle('caderno-motivos-list', () => {
  try {
    const rows = db.prepare('SELECT * FROM caderno_motivos WHERE actif=1 ORDER BY id').all();
    return { success:true, data:rows };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Ajouter un motivo ──
ipcMain.handle('caderno-motivos-add', (_, { icone, label, direction, est_dette, role }) => {
  try {
    const r = db.prepare('INSERT INTO caderno_motivos (icone,label,direction,est_dette,role) VALUES (?,?,?,?,?)')
      .run(icone||'\u{1F4CC}', label, direction, est_dette||0, role||'Geral');
    return { success:true, id:r.lastInsertRowid };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Supprimer un motivo ──
ipcMain.handle('caderno-motivos-delete', (_, id) => {
  try {
    db.prepare('UPDATE caderno_motivos SET actif=0 WHERE id=?').run(id);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Lister les travailleurs ──
ipcMain.handle('caderno-trabalhadores-list', () => {
  try {
    return { success:true, data:db.prepare('SELECT * FROM caderno_trabalhadores ORDER BY nom').all() };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Ajouter un travailleur ──
ipcMain.handle('caderno-trabalhadores-add', (_, nom) => {
  try {
    const r = db.prepare('INSERT OR IGNORE INTO caderno_trabalhadores (nom) VALUES (?)').run(nom.trim());
    return { success:true, id:r.lastInsertRowid };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Supprimer un travailleur ──
ipcMain.handle('caderno-trabalhadores-delete', (_, id) => {
  try {
    db.prepare('DELETE FROM caderno_trabalhadores WHERE id=?').run(id);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Lister les produits caderno ──
ipcMain.handle('caderno-produtos-list', () => {
  try {
    return { success:true, data:db.prepare('SELECT * FROM caderno_produtos ORDER BY nom').all() };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Ajouter un produit caderno ──
ipcMain.handle('caderno-produtos-add', (_, payload, prixArg) => {
  try {
    const nom  = typeof payload === 'string' ? payload : (payload?.nom || '');
    const prix = parseFloat(typeof payload === 'string' ? prixArg : payload?.prix) || 0;
    if (!nom.trim()) return { success:false, error:'nom vide' };

    // Ajouter colonne prix si absente
    const cols = db.pragma('table_info(caderno_produtos)').map(c => c.name);
    if (!cols.includes('prix')) {
      db.prepare('ALTER TABLE caderno_produtos ADD COLUMN prix REAL DEFAULT 0').run();
    }

    // Upsert propre
    const r = db.prepare(
      'INSERT INTO caderno_produtos (nom, prix) VALUES (?,?) ON CONFLICT(nom) DO UPDATE SET prix=excluded.prix'
    ).run(nom.trim(), prix);
    return { success:true, id:r.lastInsertRowid };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Supprimer un produit caderno ──
ipcMain.handle('caderno-produtos-delete', (_, id) => {
  try {
    db.prepare('DELETE FROM caderno_produtos WHERE id=?').run(id);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Charger les entrées d'un jour ──
ipcMain.handle('caderno-entries-list', (_, { date_jour, user_id }) => {
  try {
    const user = db.prepare('SELECT role FROM users WHERE id=?').get(user_id);
    const isAdmin = user && user.role === 'admin';
    let sql = `SELECT e.*, u.nom as user_nom
               FROM caderno_entries e
               JOIN users u ON e.user_id = u.id
               WHERE e.date_jour = ?`;
    const params = [date_jour];
    if (!isAdmin) { sql += ' AND e.user_id = ?'; params.push(user_id); }
    sql += ' ORDER BY e.created_at ASC';
    return { success:true, data:db.prepare(sql).all(...params) };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Ajouter une entrée (toujours nouvelle ligne) ──
ipcMain.handle('caderno-entries-add', (_, entry) => {
  try {
    const { nom, motivo, montant, montant_raw, note, direction, est_dette, user_id, machine_id, date_jour, categorie_depense } = entry;

    const statutDette = est_dette ? 'pendente' : null;
    const r = db.prepare(
      `INSERT INTO caderno_entries
       (nom, motivo, montant, montant_raw, note, direction, est_dette, statut_dette, user_id, machine_id, date_jour, categorie_depense)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(nom, motivo, montant||0, montant_raw||'', note||'', direction, est_dette?1:0, statutDette, user_id, machine_id||'LOCAL', date_jour, categorie_depense||null);

    try {
      const desc = `Caderno: ${motivo} — ${nom}`;
      if (direction === 'entree') {
        db.prepare(
          "INSERT INTO lancamentos_contabilisticos (vente_id,descricao,conta_debito,conta_credito,valor,machine_id) VALUES (?,?,?,?,?,?)"
        ).run(null, desc, '43', '711', montant||0, machine_id||'LOCAL');
      } else {
        db.prepare(
          "INSERT INTO lancamentos_contabilisticos (vente_id,descricao,conta_debito,conta_credito,valor,machine_id) VALUES (?,?,?,?,?,?)"
        ).run(null, desc, '612', '43', montant||0, machine_id||'LOCAL');
      }
    } catch(_pgc) {}

    return { success:true, id:r.lastInsertRowid, cumul:false };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Supprimer une entrée ──
ipcMain.handle('caderno-entries-delete', (_, id) => {
  try {
    db.prepare('DELETE FROM caderno_entries WHERE id=?').run(id);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Marquer dette comme payée ──
ipcMain.handle('caderno-entries-pago', (_, id) => {
  try {
    db.prepare(
      "UPDATE caderno_entries SET statut_dette='pago', date_pago=datetime('now','utc') WHERE id=?"
    ).run(id);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Limpar histórico ──
ipcMain.handle('caderno-entries-clear', (_, { mode, date_jour, user_id }) => {
  try {
    const user = db.prepare('SELECT role FROM users WHERE id=?').get(user_id);
    const isAdmin = user && user.role === 'admin';
    let sql = '';
    const params = [];
    if (mode === 'today') {
      sql = 'DELETE FROM caderno_entries WHERE date_jour=?';
      params.push(date_jour);
    } else if (mode === 'week') {
      sql = "DELETE FROM caderno_entries WHERE date_jour >= date('now','-6 days')";
    } else if (mode === 'all') {
      sql = 'DELETE FROM caderno_entries';
    }
    if (!isAdmin) { sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' user_id=?'; params.push(user_id); }
    db.prepare(sql).run(...params);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Lister les jours disponibles ──
ipcMain.handle('caderno-days-list', (_, { user_id }) => {
  try {
    const user = db.prepare('SELECT role FROM users WHERE id=?').get(user_id);
    const isAdmin = user && user.role === 'admin';
    let sql = 'SELECT DISTINCT date_jour FROM caderno_entries';
    const params = [];
    if (!isAdmin) { sql += ' WHERE user_id=?'; params.push(user_id); }
    sql += ' ORDER BY date_jour DESC LIMIT 30';
    return { success:true, data:db.prepare(sql).all(...params) };
  } catch(e) { return { success:false, error:e.message }; }
});


// Google Drive
const driveSync = require('./database/driveSync');
ipcMain.handle('drive-auth', async () => {
  try {
    const url = await driveSync.getAuthUrl();
    shell.openExternal(url);
    return { success:true, url };
  } catch(e) { return { success:false, error:e.message }; }
});
ipcMain.handle('drive-token', async (_,code) => {
  try { await driveSync.setToken(code); return { success:true }; }
  catch(e) { return { success:false, error:e.message }; }
});
ipcMain.handle('drive-sync', async () => {
  try { await driveSync.syncDatabase(); return { success:true }; }
  catch(e) { return { success:false, error:e.message }; }
});
ipcMain.handle('drive-status', async () => ({ connected: driveSync.isConnected() }));

// ============================================================
// BACKUP LOCAL — Sauvegarder et Restaurer la BDD
// ============================================================
ipcMain.handle('backup-local', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar Backup CKBPOS',
      defaultPath: path.join('D:\\', 'ckbpos_backup_' + new Date().toISOString().slice(0,10) + '.db'),
      filters: [{ name: 'Base de dados SQLite', extensions: ['db'] }]
    });
    if (result.canceled) return { success: false, canceled: true };
    const dbPath = path.join(app.getPath('userData'), 'ckbpos.db');
    fs.copyFileSync(dbPath, result.filePath);
    return { success: true, path: result.filePath };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('backup-restore', async () => {
  try {
    // \u2705 Dialog pour choisir le fichier .db à restaurer
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Restaurar Backup CKBPOS',
      defaultPath: 'D:\\',
      filters: [{ name: 'Base de dados SQLite', extensions: ['db'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };

    const backupPath = result.filePaths[0];
    const dbPath     = path.join(app.getPath('userData'), 'ckbpos.db');

    // \u2705 Vérifier que c'est bien une BDD CKBPOS (contient la table users)
    // + forcer WAL checkpoint pour fusionner le WAL dans le fichier principal
    // (évite le crash "database disk image is malformed" avec better-sqlite3)
    let cleanedPath = backupPath;
    try {
      const BetterSqlite = require('better-sqlite3');
      const testDb = BetterSqlite(backupPath, { readonly: false });

      // Forcer checkpoint WAL + passer en journal DELETE pour que le fichier soit autonome
      try { testDb.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {}
      try { testDb.pragma('journal_mode = DELETE'); } catch(e) {}

      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      testDb.close();

      if (!tables.includes('users') || !tables.includes('products') || !tables.includes('ventes')) {
        return { success: false, error: 'Fichier invalide — Ce n\'est pas uma base de dados CKBPOS.' };
      }

      // Copier vers un fichier temp propre pour éviter tout conflit avec les fichiers -wal/-shm
      const os = require('os');
      cleanedPath = path.join(os.tmpdir(), 'ckbpos_restore_clean_' + Date.now() + '.db');
      fs.copyFileSync(backupPath, cleanedPath);

    } catch(e) {
      return { success: false, error: 'Fichier corrompido ou inválido : ' + e.message };
    }

    // \u2705 Sauvegarder l'actuelle avant d'écraser (sécurité)
    const safetyBackup = path.join(app.getPath('userData'), 'ckbpos_before_restore_' + Date.now() + '.db');
    fs.copyFileSync(dbPath, safetyBackup);

    // \u2705 Remplacer la BDD avec le fichier nettoyé et relancer l'app
    fs.copyFileSync(cleanedPath, dbPath);
    // Supprimer les fichiers WAL/SHM résiduels de l'ancienne BDD
    [dbPath + '-wal', dbPath + '-shm'].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch(e) {} });
    // Nettoyer le fichier temp
    try { fs.unlinkSync(cleanedPath); } catch(e) {}

    setTimeout(() => { app.relaunch(); app.exit(0); }, 500);
    return { success: true, restarting: true };
  } catch(e) { return { success: false, error: e.message }; }
});


// ============================================================
// EMPRESAS
// ============================================================
ipcMain.handle('empresas-list', async () => {
  try {
    const data = db.prepare("SELECT * FROM empresas WHERE actif=1 ORDER BY nom").all();
    return { success: true, data };
  } catch(e) { return { success: false, error: e.message }; }
});
ipcMain.handle('empresas-add', async (_, { nom, nif, telephone }) => {
  try {
    const r = db.prepare("INSERT INTO empresas (nom,nif,telephone) VALUES (?,?,?)").run(nom, nif, telephone||null);
    return { success: true, id: r.lastInsertRowid };
  } catch(e) { return { success: false, error: e.message }; }
});
ipcMain.handle('empresas-delete', async (_, id) => {
  try {
    db.prepare("UPDATE empresas SET actif=0 WHERE id=?").run(id);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ============================================================
// RESERVATIONS
// ============================================================
ipcMain.handle('reservation-create', async (_, data) => {
  try {
    const { userId, clientNom, clientNif, items, total, type,
            modeP, montantD, montantE, note, expiration } = data;

    // Pour type pago_retirar : créer la vente immédiatement + déduire stock
    let venteId = null;
    if (type === 'pago_retirar') {
      const { randomUUID } = require('crypto');
      const vRes = db.prepare(
        "INSERT INTO ventes (user_id,client_nom,client_nif,total,montant_recu,monnaie_rendue,mode_paiement,montant_dinheiro,montant_express,statut,facture_num,machine_id,uuid) VALUES (?,?,?,?,?,?,?,?,?,'pago_retirar',?,?,?)"
      ).run(userId, clientNom||null, clientNif||'CONSUMIDOR FINAL', total, total, 0, modeP, montantD||0, montantE||0, '', MACHINE_ID, randomUUID());
      venteId = vRes.lastInsertRowid;
      try { incrementSalesCounter(db); notifyLicenseSalesUpdated(); } catch(_lic) {}

      // Déduire stock immédiatement
      const itemsParsed = JSON.parse(items);
      for (const item of itemsParsed) {
        db.prepare(
          "INSERT INTO vente_items (vente_id,product_id,variant_id,type_vente,quantite,prix_unitaire,sous_total) VALUES (?,?,?,?,?,?,?)"
        ).run(venteId, item.productId, item.variantId||null, item.type, item.qty, item.price, item.subtotal);

        const upc = item.unites || 1;
        const unitsConsumed = item.type==='carton' ? item.qty*upc : item.type==='demi' ? item.qty*Math.ceil(upc/2) : item.qty;
        const cartonsToRemove = unitsConsumed / upc;

        if (item.variantId) {
          const vBefore = db.prepare("SELECT stock_cartons FROM product_variants WHERE id=?").get(item.variantId)?.stock_cartons || 0;
          db.prepare("UPDATE product_variants SET stock_cartons=? WHERE id=?").run(Math.max(0, vBefore-cartonsToRemove), item.variantId);
          const totalVariantStock = db.prepare("SELECT COALESCE(SUM(stock_cartons),0) as t FROM product_variants WHERE product_id=? AND actif=1").get(item.productId)?.t || 0;
          db.prepare("UPDATE products SET stock_cartons=?,updated_at=datetime('now','utc') WHERE id=?").run(totalVariantStock, item.productId);
        } else {
          const sBefore = db.prepare("SELECT stock_cartons FROM products WHERE id=?").get(item.productId)?.stock_cartons || 0;
          db.prepare("UPDATE products SET stock_cartons=?,updated_at=datetime('now','utc') WHERE id=?").run(Math.max(0, sBefore-cartonsToRemove), item.productId);
        }
      }
    }

    const rRes = db.prepare(
      "INSERT INTO reservations (user_id,client_nom,client_nif,items_json,total,type,statut,mode_paiement,montant_dinheiro,montant_express,note,expiration,vente_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','utc'))"
    ).run(userId, clientNom||null, clientNif||'CONSUMIDOR FINAL', items, total, type, 'pendente', modeP||'dinheiro', montantD||0, montantE||0, note||null, expiration||null, venteId);

    return { success: true, id: rRes.lastInsertRowid, venteId };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('reservation-list', async () => {
  try {
    const data = db.prepare(
      "SELECT r.*, u.nom as vendeur_nom FROM reservations r LEFT JOIN users u ON r.user_id=u.id WHERE r.statut='pendente' ORDER BY r.created_at DESC"
    ).all();
    return { success: true, data };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('reservation-payer', async (_, { id, userId, modeP, montantD, montantE, clientNom, clientNif }) => {
  try {
    const res = db.prepare("SELECT * FROM reservations WHERE id=?").get(id);
    if (!res) return { success: false, error: 'Réservation introuvable' };

    // Générer numéro facture
    const year = new Date().getFullYear();
    const rowSeq = db.prepare("SELECT COALESCE(MAX(id),0) as maxId FROM ventes").get();
    const seq = (rowSeq?.maxId || 0) + 1;
    const shortId = MACHINE_ID.slice(0,8).toUpperCase();
    const numeroFacture = `FR CKB${year}/${shortId}-${String(seq).padStart(4,'0')}`;

    const total = res.total;
    const totalPaid = (Number(montantD)||0) + (Number(montantE)||0);
    const change = Math.max(0, totalPaid - total);

    const { randomUUID } = require('crypto');
    const vRes = db.prepare(
      "INSERT INTO ventes (user_id,client_nom,client_nif,total,montant_recu,monnaie_rendue,mode_paiement,montant_dinheiro,montant_express,facture_num,machine_id,uuid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run(userId, clientNom||res.client_nom, clientNif||res.client_nif, total, totalPaid, change, modeP||'dinheiro', montantD||0, montantE||0, numeroFacture, MACHINE_ID, randomUUID());
    const venteId = vRes.lastInsertRowid;
    try { incrementSalesCounter(db); notifyLicenseSalesUpdated(); } catch(_lic) {}

    // Insérer items + déduire stock
    const items = JSON.parse(res.items_json);
    for (const item of items) {
      db.prepare(
        "INSERT INTO vente_items (vente_id,product_id,variant_id,type_vente,quantite,prix_unitaire,sous_total) VALUES (?,?,?,?,?,?,?)"
      ).run(venteId, item.productId, item.variantId||null, item.type, item.qty, item.price, item.subtotal);

      const upc = item.unites || 1;
      const unitsConsumed = item.type==='carton' ? item.qty*upc : item.type==='demi' ? item.qty*Math.ceil(upc/2) : item.qty;
      const cartonsToRemove = unitsConsumed / upc;

      if (item.variantId) {
        const vBefore = db.prepare("SELECT stock_cartons FROM product_variants WHERE id=?").get(item.variantId)?.stock_cartons || 0;
        db.prepare("UPDATE product_variants SET stock_cartons=? WHERE id=?").run(Math.max(0, vBefore-cartonsToRemove), item.variantId);
        const totalVariantStock = db.prepare("SELECT COALESCE(SUM(stock_cartons),0) as t FROM product_variants WHERE product_id=? AND actif=1").get(item.productId)?.t || 0;
        db.prepare("UPDATE products SET stock_cartons=?,updated_at=datetime('now','utc') WHERE id=?").run(totalVariantStock, item.productId);
      } else {
        const sBefore = db.prepare("SELECT stock_cartons FROM products WHERE id=?").get(item.productId)?.stock_cartons || 0;
        db.prepare("UPDATE products SET stock_cartons=?,updated_at=datetime('now','utc') WHERE id=?").run(Math.max(0, sBefore-cartonsToRemove), item.productId);
      }
    }

    db.prepare("UPDATE reservations SET statut='entregue', vente_id=? WHERE id=?").run(venteId, id);
    // v1.8.1 — Push instantané après paiement réservation
    setImmediate(() => triggerInstantSync());
    return { success: true, venteId, numeroFacture, change, total };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('reservation-entregar', async (_, { id }) => {
  try {
    // Type B : déjà payé, juste marquer comme livré
    const res = db.prepare("SELECT * FROM reservations WHERE id=?").get(id);
    if (!res) return { success: false, error: 'Introuvable' };

    // Générer numéro facture pour le ticket final
    const year = new Date().getFullYear();
    const rowSeq = db.prepare("SELECT COALESCE(MAX(id),0) as maxId FROM ventes").get();
    const seq = (rowSeq?.maxId || 0) + 1;
    const shortId = MACHINE_ID.slice(0,8).toUpperCase();
    const numeroFacture = `FR CKB${year}/${shortId}-${String(seq).padStart(4,'0')}`;

    // Mettre à jour la vente avec le numéro
    if (res.vente_id) {
      db.prepare("UPDATE ventes SET facture_num=? WHERE id=?").run(numeroFacture, res.vente_id);
    }
    db.prepare("UPDATE reservations SET statut='entregue' WHERE id=?").run(id);
    return { success: true, numeroFacture, venteId: res.vente_id };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('reservation-anular', async (_, { id }) => {
  try {
    const res = db.prepare("SELECT * FROM reservations WHERE id=?").get(id);
    if (!res) return { success: false, error: 'Introuvable' };

    // Type A : libérer le stock (pas encore déduit, rien à faire côté stock)
    // Type B pago_retirar : annuler la vente et restituer le stock
    if (res.type === 'pago_retirar' && res.vente_id) {
      db.prepare("UPDATE ventes SET statut='annule' WHERE id=?").run(res.vente_id);
      const items = JSON.parse(res.items_json);
      for (const item of items) {
        const upc = item.unites || 1;
        const unitsConsumed = item.type==='carton' ? item.qty*upc : item.type==='demi' ? item.qty*Math.ceil(upc/2) : item.qty;
        const cartonsToRestore = unitsConsumed / upc;
        if (item.variantId) {
          const vBefore = db.prepare("SELECT stock_cartons FROM product_variants WHERE id=?").get(item.variantId)?.stock_cartons || 0;
          db.prepare("UPDATE product_variants SET stock_cartons=? WHERE id=?").run(vBefore + cartonsToRestore, item.variantId);
          const totalVariantStock = db.prepare("SELECT COALESCE(SUM(stock_cartons),0) as t FROM product_variants WHERE product_id=? AND actif=1").get(item.productId)?.t || 0;
          db.prepare("UPDATE products SET stock_cartons=?,updated_at=datetime('now','utc') WHERE id=?").run(totalVariantStock, item.productId);
        } else {
          const sBefore = db.prepare("SELECT stock_cartons FROM products WHERE id=?").get(item.productId)?.stock_cartons || 0;
          db.prepare("UPDATE products SET stock_cartons=?,updated_at=datetime('now','utc') WHERE id=?").run(sBefore + cartonsToRestore, item.productId);
        }
      }
    }

    db.prepare("UPDATE reservations SET statut='anulada' WHERE id=?").run(id);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── Numérotation facture ─────────────────────────────────────────
ipcMain.handle('next-facture-num', async () => {
  try {
    const year = new Date().getFullYear();
    const rowSeq = db.prepare("SELECT COALESCE(MAX(id),0) as maxId FROM ventes").get();
    const seq = (rowSeq?.maxId || 0) + 1;
    const shortId = MACHINE_ID.slice(0,8).toUpperCase();
    const numeroFacture = `FR CKB${year}/${shortId}-${String(seq).padStart(4,'0')}`;
    return { success: true, numero: numeroFacture };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Backup local
ipcMain.handle('force-migration', async () => {
  try {
    const migrations = [
      "ALTER TABLE products ADD COLUMN prix_demi REAL",
      "ALTER TABLE products ADD COLUMN prix_unite REAL",
      "ALTER TABLE products ADD COLUMN prix_demi_manual INTEGER DEFAULT 0",
      "ALTER TABLE products ADD COLUMN prix_unite_manual INTEGER DEFAULT 0",
      "ALTER TABLE products ADD COLUMN stock_alerte REAL DEFAULT 2",
      "ALTER TABLE products ADD COLUMN has_variants INTEGER DEFAULT 0",
      "ALTER TABLE ventes ADD COLUMN client_id INTEGER",
      "ALTER TABLE ventes ADD COLUMN client_nom TEXT",
      "ALTER TABLE ventes ADD COLUMN statut TEXT DEFAULT 'normal'",
      "ALTER TABLE ventes ADD COLUMN mode_paiement TEXT DEFAULT 'dinheiro'",
      "ALTER TABLE ventes ADD COLUMN montant_dinheiro REAL DEFAULT 0",
      "ALTER TABLE ventes ADD COLUMN montant_express REAL DEFAULT 0",
      "ALTER TABLE vente_items ADD COLUMN statut TEXT DEFAULT 'normal'",
      "ALTER TABLE vente_items ADD COLUMN variant_id INTEGER",
      "ALTER TABLE users ADD COLUMN peut_modifier_factures INTEGER DEFAULT 0",
      "ALTER TABLE users ADD COLUMN question_secreta TEXT",
      "ALTER TABLE users ADD COLUMN resposta_secreta TEXT",
      "ALTER TABLE users ADD COLUMN tentativas_login INTEGER DEFAULT 0",
      "ALTER TABLE shifts ADD COLUMN total_dinheiro REAL DEFAULT 0",
      "ALTER TABLE shifts ADD COLUMN total_express REAL DEFAULT 0",
      "ALTER TABLE shifts ADD COLUMN argent_en_main REAL DEFAULT 0",
      "ALTER TABLE shifts ADD COLUMN argent_envoye REAL DEFAULT 0",
      "ALTER TABLE shifts ADD COLUMN note TEXT",
      "ALTER TABLE stock_mouvements ADD COLUMN variant_id INTEGER",
      "ALTER TABLE stock_mouvements ADD COLUMN type_mesure TEXT DEFAULT 'carton'",
      "ALTER TABLE stock_mouvements ADD COLUMN quantite_cartons REAL",
      "ALTER TABLE stock_mouvements ADD COLUMN motif TEXT",
      // v1.0.9
      "ALTER TABLE ventes ADD COLUMN client_nif TEXT DEFAULT 'CONSUMIDOR FINAL'",
      "ALTER TABLE ventes ADD COLUMN facture_num TEXT",
      "ALTER TABLE ventes ADD COLUMN reservation_id INTEGER",
      "ALTER TABLE users ADD COLUMN pin TEXT",
      // v1.1.2
      "ALTER TABLE ventes ADD COLUMN machine_id TEXT DEFAULT 'LOCAL'",
      // v1.1.5 — colonnes reservations manquantes sur anciennes BDD
      "ALTER TABLE reservations ADD COLUMN items_json TEXT",
      "ALTER TABLE reservations ADD COLUMN mode_paiement TEXT DEFAULT 'dinheiro'",
      "ALTER TABLE reservations ADD COLUMN montant_dinheiro REAL DEFAULT 0",
      "ALTER TABLE reservations ADD COLUMN montant_express REAL DEFAULT 0",
      "ALTER TABLE reservations ADD COLUMN expiration TEXT",
      "ALTER TABLE reservations ADD COLUMN vente_id INTEGER",
      "ALTER TABLE reservations ADD COLUMN created_at TEXT DEFAULT (datetime('now','utc'))",
      // v1.2.9 — prix pour caderno_produtos
      "ALTER TABLE caderno_produtos ADD COLUMN prix REAL DEFAULT 0",
      // v3.9.0 — colonne unites manquante sur anciennes BDD
      "ALTER TABLE products ADD COLUMN unites INTEGER DEFAULT 1",
      // v3.9.0 — machine_label dans coordinator_log
      "ALTER TABLE coordinator_log ADD COLUMN machine_label TEXT",
      // v4.9.5 — UUID pour ventes (unicité inter-machines lors du sync)
      "ALTER TABLE ventes ADD COLUMN uuid TEXT",
    ];

    let applied = 0;
    let skipped = 0;
    for (const sql of migrations) {
      try { db.exec(sql); applied++; } catch(e) { skipped++; }
    }

    // \u2705 Fix statut : corriger les réservations créées avec statut='active' (bug v1.1.6)
    // reservation-list filtre sur statut='pendente' — mettre à jour les anciens enregistrements
    try {
      const fixed = db.prepare("UPDATE reservations SET statut='pendente' WHERE statut='active'").run();
      if (fixed.changes > 0) console.log(`[migration] ${fixed.changes} réservations 'active' \u2192 'pendente'`);
    } catch(e) {}

    // v4.9.5 — Backfill UUID pour les ventes existantes (sans uuid)
    // Génère un UUID v4 pour chaque vente qui n'en a pas encore.
    // Les nouvelles ventes reçoivent leur uuid à l'insertion (voir handler db-query).
    try {
      const { randomUUID } = require('crypto');
      const withoutUuid = db.prepare("SELECT id FROM ventes WHERE uuid IS NULL").all();
      if (withoutUuid.length > 0) {
        const stmt = db.prepare("UPDATE ventes SET uuid = ? WHERE id = ?");
        for (const row of withoutUuid) {
          stmt.run(randomUUID(), row.id);
        }
        console.log(`[migration] ${withoutUuid.length} ventes sans uuid \u2192 uuid généré`);
      }
    } catch(e) {
      console.log('[migration] uuid backfill skipped:', e.message);
    }

    // Tables v1.0.9
    db.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        client_nom TEXT DEFAULT 'CONSUMIDOR FINAL',
        client_nif TEXT DEFAULT 'CONSUMIDOR FINAL',
        total REAL NOT NULL,
        type TEXT DEFAULT 'A',
        statut TEXT DEFAULT 'pendente',
        validade TEXT,
        date_reservation TEXT DEFAULT (datetime('now','utc')),
        date_paiement TEXT,
        date_entrega TEXT,
        note TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS reservation_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        variant_id INTEGER,
        type_vente TEXT NOT NULL,
        quantite REAL NOT NULL,
        prix_unitaire REAL NOT NULL,
        sous_total REAL NOT NULL,
        FOREIGN KEY(reservation_id) REFERENCES reservations(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
      );
      CREATE TABLE IF NOT EXISTS empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        nif TEXT NOT NULL,
        telephone TEXT,
        actif INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','utc'))
      );
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        machine_id TEXT,
        machine_label TEXT,
        login_at TEXT DEFAULT (datetime('now','utc'))
      );
    `);

    // Settings v1.0.9
    const newSettings = [
      ['facture_seq', '0'],
      ['printer_name', ''],
      ['printer_copies_ticket', '2'],
      ['printer_copies_shift', '1'],
    ];
    for (const [k,v] of newSettings) {
      try { db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(k,v); } catch(e) {}
    }

    return { success: true, message: `Migration complète ! ${applied} colonne(s) ajoutée(s), ${skipped} déjà existante(s).` };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-machine-id', async () => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='machine_id'").get();
    const label = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
    return {
      success: true,
      machine_id: row?.value || 'UNKNOWN',
      machine_label: label?.value || 'Caixa Principal',
      short_id: (row?.value || 'UNKNOWN').slice(0,8).toUpperCase()
    };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('set-machine-label', async (_, label) => {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('machine_label',?)").run(label);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// backup-local déclaré plus haut (ligne ~126) — doublon supprimé

// Reset app
ipcMain.handle('reset-app', async () => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'ckbpos.db');
    try { db.close(); } catch(e) {}
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    [dbPath + '-wal', dbPath + '-shm'].forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch(e) {}
    });
    store.clear();
    app.relaunch();
    app.exit(0);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ============================================================
// IMPRESSION SILENCIEUSE v1.0.9
// ============================================================
function getPrintSettings() {
  const printerName  = db.prepare("SELECT value FROM settings WHERE key='printer_name'").get()?.value  || '';
  const copiesTicket = parseInt(db.prepare("SELECT value FROM settings WHERE key='printer_copies_ticket'").get()?.value || '2');
  const copiesShift  = parseInt(db.prepare("SELECT value FROM settings WHERE key='printer_copies_shift'").get()?.value  || '1');
  const ticketSizeMm = parseInt(db.prepare("SELECT value FROM settings WHERE key='ticket_size_mm'").get()?.value || '72');
  const ticketWidthMicrons = (ticketSizeMm * 1000) + 100; // ex: 72 -> 72100
  
  // v6.0 — Auto-width for mobile/small printers (fallback 58mm)
  let effectiveWidthMicrons = ticketWidthMicrons;
  const autoResize = db.prepare("SELECT value FROM settings WHERE key='printer_auto_resize'").get()?.value === '1';
  if (autoResize) {
    // Default to 58mm if auto-resize is enabled and no specific size is set
    effectiveWidthMicrons = 58500;
  }
  
  // v5.0 — Adaptive print settings
  const printMethod    = db.prepare("SELECT value FROM settings WHERE key='printer_method'").get()?.value    || 'auto';
  const paperWidth     = db.prepare("SELECT value FROM settings WHERE key='printer_paper_width'").get()?.value  || 'auto';
  const connectionType = db.prepare("SELECT value FROM settings WHERE key='printer_connection'").get()?.value || 'auto';
  
  return { printerName, copiesTicket, copiesShift, ticketSizeMm, ticketWidthMicrons, effectiveWidthMicrons, printMethod, paperWidth, connectionType };
}

// Helper function to calculate page size based on printer capabilities
function calculatePageSize(widthMm, isTicket) {
  const mmToMicrons = (mm) => Math.round(mm * 1000);
  return {
    width: mmToMicrons(widthMm),
    height: isTicket ? mmToMicrons(300) : mmToMicrons(297), // 300mm for tickets, A4 height for others
  };
}

// \u2705 v1.2.3 — Lire les flags de personnalisation du ticket depuis settings
function getTicketFlags() {
  const defaults = {
    showQr: true, showAddress: true, showPhone: true, showNif: true,
    showFactureNum: true, showClientNom: true, showClientNif: true,
    showSeller: true, showObrigado: true, showVersion: true, showSecondaVia: true,
    showMentionLegal: true, // \u2705 Séparé de showAddress — mention légale Angola
  };
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='ticket_flags'").get();
    if (row?.value) return { ...defaults, ...JSON.parse(row.value) };
  } catch(e) {}
  return defaults;
}

function printHTML(html, copies = 1, isTicket = false, ticketData = null) {
  return new Promise(async (resolve, reject) => {
    const settings = getPrintSettings();
    const { printerName, ticketWidthMicrons, printMethod } = settings;

    console.log(`[PRINT] Starting print — Printer: ${printerName || 'default'} | Method: ${printMethod} | Ticket: ${isTicket} | Copies: ${copies}`);

    try {
      const result = await adaptivePrint({
        html,
        ticketData,
        printerName,
        settings: { ...settings, ticketSizeMm: settings.ticketSizeMm },
        methodOverride: printMethod || 'auto',
        isTicket,
        copies,
      });
      console.log(`[PRINT] Result:`, JSON.stringify(result));
      resolve(result);
    } catch (err) {
      console.error(`[PRINT] Error:`, err.message);
      reject(err);
    }
  });
}

// v1.9.1 print-ticket / print-shift-report supprimés — remplacés par les versions v3 (queue coordinator) plus bas
ipcMain.handle('print-produtos-report', async (_, data) => {
  try {
    const isTicket = data.format === 'ticket';
    const { ticketSizeMm } = getPrintSettings();
    const html = isTicket ? generateProdutosTicketHTML({ ...data, ticketSizeMm }) : generateProdutosHTML(data);
    await printHTML(html, 1, isTicket);
    return { success: true };
  } catch(e) {
    console.error('[print-produtos-report] ERREUR:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('print-historique-report', async (_, data) => {
  try {
    const isTicket = data.format === 'ticket';
    const { ticketSizeMm } = getPrintSettings();
    const html = isTicket ? generateHistoriqueTicketHTML({ ...data, ticketSizeMm }) : generateHistoriqueHTML(data);
    await printHTML(html, 1, isTicket);
    return { success: true };
  } catch(e) {
    console.error('[print-historique-report] ERREUR:', e.message);
    return { success: false, error: e.message };
  }
});

// v1.3.0 print-caderno supprimé — remplacé par la version v3 (queue coordinator) plus bas

// HTML Templates — extracted to src/main/templates.js
// In-App Console — extracted to src/main/console.js

// ============================================================
// RÉSEAU P2P LAN — v1.4.0
// WebSocket server (port 41234) + UDP broadcast discovery (port 41235)
// ✅ CKBPOS Standard — ports standard, isolés du réseau LAN CKBPOS-PRO
//    (53611/53612) pour éviter toute synchro croisée entre les deux apps.
// ============================================================

const WebSocket = require('ws');
const dgram     = require('dgram');
const os        = require('os');
const { execFile } = require('child_process');

const WS_PORT  = 41234;
const UDP_PORT = 41235;
const UDP_ALT_PORT = 41236;

// ✅ Identifiant produit — Standard = 'CKBPOS', isolé de CKBPOS-PRO
const PRODUCT_ID = 'CKBPOS';

// Peers actifs en mémoire : machine_id \u2192 { ws, machine_label, ip, lastSeen }
const peersMap = new Map();

let wssServer          = null;
let udpSocket          = null;
let heartbeatInterval  = null;
let rebroadcastInterval = null;

// ── Clé réseau — isolation par entreprise (v1.8.0) ─────────
function getNetworkKey() {
  try { return db.prepare("SELECT value FROM settings WHERE key='network_key'").get()?.value || ''; }
  catch(_e) { return ''; }
}

function networkKeyMatches(receivedKey) {
  const myKey = getNetworkKey();
  if (!myKey) return true;      // Pas de clé configurée \u2192 mode ouvert (legacy)
  if (!receivedKey) return false; // Moi j'ai une clé, l'autre non \u2192 refus
  return receivedKey === myKey;
}

// ── Utilitaires ─────────────────────────────────────────────
function getLocalIPs() {
  const ips = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

function getMachineInfo() {
  try {
    const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
    return {
      type:          'CKBPOS_INFO',
      product:       PRODUCT_ID,
      machine_id:    MACHINE_ID,
      machine_label: labelRow?.value || 'CKBPOS',
      port:          WS_PORT,
      network_key:   getNetworkKey(),
    };
  } catch(_e) {
    return { type: 'CKBPOS_INFO', product: PRODUCT_ID, machine_id: MACHINE_ID, machine_label: 'CKBPOS', port: WS_PORT, network_key: '' };
  }
}

function upsertPeer(machine_id, machine_label, ip, port) {
  try {
    db.prepare(`
      INSERT INTO network_peers (machine_id, machine_label, ip, port, last_seen, actif)
      VALUES (?, ?, ?, ?, datetime('now','utc'), 1)
      ON CONFLICT(machine_id) DO UPDATE SET
        machine_label = excluded.machine_label,
        ip            = excluded.ip,
        port          = excluded.port,
        last_seen     = datetime('now','utc'),
        actif         = 1
    `).run(machine_id, machine_label || 'CKBPOS', ip || '', port || WS_PORT);
  } catch(e) { console.error('[LAN] upsertPeer:', e.message); }
}

function getPeersForRenderer() {
  try {
    const dbPeers = db.prepare('SELECT * FROM network_peers ORDER BY last_seen DESC').all();
    return dbPeers.map(p => ({
      ...p,
      status: peersMap.has(p.machine_id) ? 'online' : 'offline',
    }));
  } catch(_e) { return []; }
}

function broadcastPeersUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('network-peers-changed', getPeersForRenderer()); } catch(_e) {}
  }
}

// ── v5.1 — Chiffrement applicatif AES-256-GCM (LAN) ──────────
const _encCrypto = require('crypto');
let _encDerivedKey = null;
let _encLastKeyHash = null;

function _getDerivedKey() {
  const networkKey = getNetworkKey();
  if (!networkKey) return null;
  const keyHash = _encCrypto.createHash('sha256').update(networkKey).digest('hex');
  if (keyHash === _encLastKeyHash && _encDerivedKey) return _encDerivedKey;
  _encDerivedKey = _encCrypto.scryptSync(networkKey, 'ckbpos-lan-v1', 32);
  _encLastKeyHash = keyHash;
  return _encDerivedKey;
}

function encryptPayload(obj) {
  const key = _getDerivedKey();
  if (!key) return JSON.stringify(obj);
  const iv = _encCrypto.randomBytes(12);
  const cipher = _encCrypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ _enc: true, iv: iv.toString('base64'), d: encrypted.toString('base64'), t: tag.toString('base64') });
}

function decryptPayload(raw) {
  try {
    const obj = JSON.parse(raw.toString());
    if (!obj._enc) return obj;
    const key = _getDerivedKey();
    if (!key) return null;
    const iv = Buffer.from(obj.iv, 'base64');
    const decipher = _encCrypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(obj.t, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(obj.d, 'base64')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch(e) { return null; }
}

function secureSend(ws, obj) {
  try { ws.send(encryptPayload(obj)); } catch(_e) {}
}

function handleMobileProductQuery(ws, msg) {
  const barcode = String(msg?.payload?.barcode || '').trim();
  if (!barcode) {
    secureSend(ws, { type: 'CKBPOS_PRODUCT_RESPONSE', payload: { barcode, product: null } });
    return;
  }

  try {
    const product = db.prepare(`
      SELECT id, nom, categorie, prix_carton, prix_demi, prix_unite,
             unites_par_carton, stock_cartons, stock_alerte, has_variants, barcode
      FROM products
      WHERE actif=1 AND barcode=?
      LIMIT 1
    `).get(barcode);

    let variants = [];
    if (product?.has_variants) {
      variants = db.prepare(`
        SELECT id, product_id, nom, prix_carton, prix_demi, prix_unite, stock_cartons
        FROM product_variants
        WHERE product_id=? AND actif=1
        ORDER BY nom
      `).all(product.id);
    }

    secureSend(ws, {
      type: 'CKBPOS_PRODUCT_RESPONSE',
      to: msg.from,
      payload: { barcode, product: product ? { ...product, variants } : null },
    });
  } catch (e) {
    console.error('[LAN] Product query mobile:', e.message);
    secureSend(ws, {
      type: 'CKBPOS_PRODUCT_RESPONSE',
      to: msg.from,
      payload: { barcode, product: null, error: e.message },
    });
  }
}

function handleMobileSaleSync(ws, msg, peerMachineId) {
  const sale = msg?.payload || {};
  const uuid = String(sale.uuid || '').trim();
  if (!uuid) {
    secureSend(ws, { type: 'CKBPOS_SALE_SYNC_ACK', payload: { uuid, success: false, error: 'UUID manquant' } });
    return;
  }

  try {
    const result = db.transaction(() => {
      const existing = db.prepare('SELECT id, facture_num FROM ventes WHERE uuid=?').get(uuid);
      if (existing) return { venteId: existing.id, factureNum: existing.facture_num, duplicate: true };

      const venteRes = db.prepare(`
        INSERT INTO ventes (
          user_id, client_nom, client_nif, total, montant_recu, monnaie_rendue,
          mode_paiement, montant_dinheiro, montant_express, facture_num,
          machine_id, uuid, statut, date_vente
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(sale.user_id) || 1,
        sale.client_nom || 'CONSUMIDOR FINAL',
        sale.client_nif || 'CONSUMIDOR FINAL',
        Number(sale.total) || 0,
        Number(sale.montant_recu) || 0,
        Number(sale.monnaie_rendue) || 0,
        sale.mode_paiement || 'dinheiro',
        Number(sale.montant_dinheiro) || 0,
        Number(sale.montant_express) || 0,
        sale.facture_num || null,
        sale.machine_id || peerMachineId || 'MOBILE',
        uuid,
        sale.statut || 'normal',
        sale.date_vente || new Date().toISOString()
      );

      const venteId = venteRes.lastInsertRowid;
      const items = Array.isArray(sale.items) ? sale.items : [];
      for (const item of items) {
        const productId = Number(item.product_id);
        if (!productId) continue;
        const typeVente = ['carton', 'demi', 'unite'].includes(item.type_vente) ? item.type_vente : 'unite';
        const qty = Number(item.quantite) || 1;
        const price = Number(item.prix_unitaire) || 0;
        const subtotal = Number(item.sous_total) || qty * price;

        db.prepare(`
          INSERT INTO vente_items (vente_id, product_id, variant_id, type_vente, quantite, prix_unitaire, sous_total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(venteId, productId, item.variant_id || null, typeVente, qty, price, subtotal);

        const product = db.prepare('SELECT unites_par_carton, stock_cartons FROM products WHERE id=?').get(productId);
        const unitsPerCarton = Number(product?.unites_par_carton) || 1;
        const cartonsToRemove = typeVente === 'carton'
          ? qty
          : typeVente === 'demi'
            ? (qty * Math.ceil(unitsPerCarton / 2)) / unitsPerCarton
            : qty / unitsPerCarton;

        if (item.variant_id) {
          const variant = db.prepare('SELECT stock_cartons FROM product_variants WHERE id=?').get(item.variant_id);
          const nextVariantStock = Math.max(0, (Number(variant?.stock_cartons) || 0) - cartonsToRemove);
          db.prepare("UPDATE product_variants SET stock_cartons=? WHERE id=?").run(nextVariantStock, item.variant_id);
          const totalVariantStock = db.prepare("SELECT COALESCE(SUM(stock_cartons),0) as t FROM product_variants WHERE product_id=? AND actif=1").get(productId)?.t || 0;
          db.prepare("UPDATE products SET stock_cartons=?,updated_at=datetime('now','utc') WHERE id=?").run(totalVariantStock, productId);
        } else if (product) {
          const nextStock = Math.max(0, (Number(product.stock_cartons) || 0) - cartonsToRemove);
          db.prepare("UPDATE products SET stock_cartons=?,updated_at=datetime('now','utc') WHERE id=?").run(nextStock, productId);
        }
      }

      return { venteId, factureNum: sale.facture_num || null, duplicate: false };
    })();

    secureSend(ws, {
      type: 'CKBPOS_SALE_SYNC_ACK',
      payload: { uuid, success: true, vente_id: result.venteId, facture_num: result.factureNum, duplicate: result.duplicate },
    });
  } catch (e) {
    console.error('[LAN] Sale sync mobile:', e.message);
    secureSend(ws, { type: 'CKBPOS_SALE_SYNC_ACK', payload: { uuid, success: false, error: e.message } });
  }
}
// ── Fin chiffrement LAN ──────────────────────────────────────

// ── Serveur WebSocket — écoute les connexions entrantes ────
function startWsServer() {
  try {
    wssServer = new WebSocket.Server({ port: WS_PORT });
    console.log('[LAN] WebSocket server port ' + WS_PORT);

    wssServer.on('connection', (ws, req) => {
      const peerIp = (req.socket.remoteAddress || '').replace('::ffff:', '');
      let peerMachineId = null;
      console.log(`[LAN-DBG] ${new Date().toISOString()} DESKTOP connection from ${peerIp}`);

      // Envoyer immédiatement nos informations
      try {
        const info = getMachineInfo();
        console.log(`[LAN-DBG] ${new Date().toISOString()} DESKTOP sending CKBPOS_INFO to ${peerIp}:`, JSON.stringify(info));
        secureSend(ws, info);
      } catch(_e) { console.error(`[LAN-DBG] ${new Date().toISOString()} DESKTOP error sending CKBPOS_INFO:`, _e); }

      ws.on('message', (raw) => {
        try {
          const msg = decryptPayload(raw);
          if (!msg) { console.log(`[LAN-DBG] ${new Date().toISOString()} DESKTOP decryptPayload returned null from ${peerIp}, raw first 200: ${String(raw).substring(0, 200)}`); return; }

          if (msg.type === 'CKBPOS_INFO') {
            const checkMachineId = msg.machine_id === MACHINE_ID;
            const checkProduct = !(msg.product && msg.product !== PRODUCT_ID);
            const checkNetworkKey = networkKeyMatches(msg.network_key) || !msg.network_key;
            console.log(`[LAN-DBG] ${new Date().toISOString()} DESKTOP received CKBPOS_INFO from ${peerIp}: machine_id="${msg.machine_id}" product="${msg.product}" label="${msg.machine_label}" network_key="${msg.network_key || ''}"`);
            console.log(`[LAN-DBG] ${new Date().toISOString()} DESKTOP checks: machine_id_self=${checkMachineId} product_ok=${checkProduct} network_key_ok=${checkNetworkKey}`);
            if (msg.machine_id === MACHINE_ID) { console.log(`[LAN-DBG] ${new Date().toISOString()} DESKTOP REJECTED: same machine_id`); ws.close(); return; }
            // \u2705 Isolation produit — rejeter toute machine d'une autre app
            // (ex: CKBPOS standard) même sur le même réseau/port.
            if (msg.product && msg.product !== PRODUCT_ID) {
              console.warn(`[LAN-DBG] ${new Date().toISOString()} DESKTOP REJECTED: product mismatch "${msg.product}" != "${PRODUCT_ID}"`);
              console.warn('[LAN] Refusé (produit différent: ' + msg.product + '): ' + (msg.machine_label || msg.machine_id) + ' @ ' + peerIp);
              ws.close(); return;
            }
            // ── v1.8.0 Clé réseau — isoler les entreprises sur le même LAN ──
            // Exception : accepter si la machine distante n'a pas encore de clé (setup en cours)
            if (!networkKeyMatches(msg.network_key) && msg.network_key) {
              console.warn(`[LAN-DBG] ${new Date().toISOString()} DESKTOP REJECTED: network_key mismatch desktop="${getNetworkKey()}" mobile="${msg.network_key}"`);
              console.warn('[LAN] Refusé (clé réseau différente): ' + (msg.machine_label || msg.machine_id) + ' @ ' + peerIp);
              ws.close(); return;
            }
            peerMachineId = msg.machine_id;
            // v1.8.1 — Connexion permanente : rejeter le doublon si connexion active
            if (peersMap.has(peerMachineId)) {
              const existing = peersMap.get(peerMachineId);
              if (existing.ws?.readyState === WebSocket.OPEN) {
                console.log(`[LAN-DBG] ${new Date().toISOString()} DESKTOP REJECTED: duplicate peer ${peerMachineId} (existing connection OPEN)`);
                ws.close(); return; // garder la connexion existante
              }
            }
            upsertPeer(peerMachineId, msg.machine_label, peerIp, msg.port);
            peersMap.set(peerMachineId, { ws, machine_label: msg.machine_label, ip: peerIp, lastSeen: Date.now() });
            broadcastPeersUpdate();
            console.log(`[LAN-DBG] ${new Date().toISOString()} DESKTOP ACCEPTED peer: ${msg.machine_label || peerMachineId} (${peerMachineId}) @ ${peerIp}`);
            console.log('[LAN] Pair connecte: ' + (msg.machine_label || peerMachineId) + ' @ ' + peerIp);
            // v1.5.0 — déclencher sync après connexion
            if (global._ckbSyncHandlers) global._ckbSyncHandlers.onPeerRegistered(peerMachineId);

          } else if (msg.type === 'PING') {
            secureSend(ws, { type: 'PONG', machine_id: MACHINE_ID });
            if (peerMachineId) {
              const p = peersMap.get(peerMachineId);
              if (p) p.lastSeen = Date.now();
              upsertPeer(peerMachineId, p?.machine_label, peerIp, WS_PORT);
            }

          } else if (msg.type === 'PONG') {
            if (peerMachineId) {
              const p = peersMap.get(peerMachineId);
              if (p) p.lastSeen = Date.now();
            }
          } else if (msg.type === 'CKBPOS_PRODUCT_QUERY') {
            handleMobileProductQuery(ws, msg);
          } else if (msg.type === 'CKBPOS_SALE_SYNC') {
            handleMobileSaleSync(ws, msg, peerMachineId);
          } else if (global._ckbSyncHandlers) {
            global._ckbSyncHandlers.handleSyncMessage(ws, msg, peerMachineId);
          }
        } catch(_e) {}
      });

      ws.on('close', () => {
        if (peerMachineId && peersMap.has(peerMachineId)) {
          peersMap.delete(peerMachineId);
          broadcastPeersUpdate();
          console.log('[LAN] Pair deconnecte: ' + peerMachineId);
          // v1.8.1 — Auto-reconnect après 5s
          setTimeout(() => {
            if (!peersMap.has(peerMachineId)) {
              const info = db.prepare('SELECT ip, port FROM network_peers WHERE machine_id=?').get(peerMachineId);
              if (info?.ip) connectToPeer(info.ip, info.port);
            }
          }, 5000);
        }
      });

      ws.on('error', (_e) => {
        if (peerMachineId) peersMap.delete(peerMachineId);
      });
    });

    wssServer.on('error', (e) => {
      console.error('[LAN] WS server error:', e.message);
      if (e.code === 'EADDRINUSE') {
        console.error('[LAN] Port ' + WS_PORT + ' deja utilise — nouvelle tentative dans 5s...');
        try { wssServer.close(); } catch(_e) {}
        wssServer = null;
        setTimeout(() => startWsServer(), 5000);
      }
    });
  } catch(e) {
    console.error('[LAN] Impossible de demarrer WS server:', e.message);
  }
}

// ── Connexion sortante vers un pair ────────────────────────
function connectToPeer(ip, port) {
  if (!ip) return;
  // Ne pas se connecter à soi-même
  if (getLocalIPs().includes(ip)) return;
  // Ne pas dupliquer une connexion existante
  for (const peer of peersMap.values()) {
    if (peer.ip === ip) return;
  }

  const url = 'ws://' + ip + ':' + (port || WS_PORT);
  try {
    const ws = new WebSocket(url, { handshakeTimeout: 3000 });
    let peerMachineId = null;

    ws.on('open', () => {
      try { secureSend(ws, getMachineInfo()); } catch(_e) {}
    });

    ws.on('message', (raw) => {
      try {
        const msg = decryptPayload(raw);
        if (!msg) return;
        if (msg.type === 'CKBPOS_INFO') {
          if (msg.machine_id === MACHINE_ID) { ws.close(); return; }
          // Eviter les doublons (connexion entrante peut deja exister)
          if (peersMap.has(msg.machine_id)) { ws.close(); return; }
          // \u2705 Isolation produit
          if (msg.product && msg.product !== PRODUCT_ID) {
            console.warn('[LAN] Refusé (produit différent: ' + msg.product + '): ' + msg.machine_id);
            ws.close(); return;
          }
          // ── v1.8.0 Clé réseau ──
          // Exception : accepter si la machine distante n'a pas encore de clé (setup en cours)
          if (!networkKeyMatches(msg.network_key) && msg.network_key) {
            console.warn('[LAN] Refusé (clé réseau différente): ' + msg.machine_id);
            ws.close(); return;
          }
          peerMachineId = msg.machine_id;
          upsertPeer(peerMachineId, msg.machine_label, ip, msg.port);
          peersMap.set(peerMachineId, { ws, machine_label: msg.machine_label, ip, lastSeen: Date.now() });
          broadcastPeersUpdate();
          // v1.5.0 — déclencher sync après connexion
          if (global._ckbSyncHandlers) global._ckbSyncHandlers.onPeerRegistered(peerMachineId);
        } else if (msg.type === 'PING') {
          secureSend(ws, { type: 'PONG', machine_id: MACHINE_ID });
        } else if (msg.type === 'PONG') {
          if (peerMachineId) {
            const p = peersMap.get(peerMachineId);
            if (p) p.lastSeen = Date.now();
          }
        } else if (msg.type === 'CKBPOS_PRODUCT_QUERY') {
          handleMobileProductQuery(ws, msg);
        } else if (msg.type === 'CKBPOS_SALE_SYNC') {
          handleMobileSaleSync(ws, msg, peerMachineId);
        } else if (global._ckbSyncHandlers) {
          global._ckbSyncHandlers.handleSyncMessage(ws, msg, peerMachineId);
        }
      } catch(_e) {}
    });

    ws.on('close', () => {
      if (peerMachineId) {
        const wasConnected = peersMap.has(peerMachineId);
        peersMap.delete(peerMachineId);
        if (wasConnected) broadcastPeersUpdate();
        // v1.8.1 — Auto-reconnect après 5s
        setTimeout(() => {
          if (!peersMap.has(peerMachineId)) connectToPeer(ip, port || WS_PORT);
        }, 5000);
      }
    });

    ws.on('error', (_e) => { /* normal si pair indisponible */ });
  } catch(_e) {}
}

// ── UDP Discovery ───────────────────────────────────────────
function startUdpDiscovery() {
  try {
    udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    udpSocket.on('message', (buf, rinfo) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg.machine_id === MACHINE_ID) return; // ignorer soi-meme

        // ── Setup mode : répondre aux scans de nouvelles machines sans clé ──
        if (msg.type === 'CKBPOS_DISCOVER' && msg.setup_mode) {
          // \u2705 Isolation produit
          if (msg.product && msg.product !== PRODUCT_ID) return;
          const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
          const reply = Buffer.from(JSON.stringify({
            type: 'CKBPOS_DISCOVER_REPLY',
            product: PRODUCT_ID,
            machine_id: MACHINE_ID,
            machine_label: labelRow?.value || 'CKBPOS',
            port: WS_PORT,
            setup_mode: true,
          }));
          // Répondre au reply_port si spécifié, sinon au port source
          const replyPort = msg.reply_port || rinfo.port;
          udpSocket.send(reply, replyPort, rinfo.address, () => {});
          // Aussi envoyer en broadcast pour maximiser les chances
          try { udpSocket.send(reply, UDP_PORT, rinfo.address, () => {}); } catch(_e) {}
          return;
        }

        // \u2705 Isolation produit — ignorer toute machine d'une autre app
        if (msg.product && msg.product !== PRODUCT_ID) return;

        // ── v1.8.0 Clé réseau — ignorer les broadcasts d'autres entreprises ──
        // Exception : accepter les machines sans clé (setup en cours, pas encore configurées)
        if (!networkKeyMatches(msg.network_key) && msg.network_key) {
          console.log('[LAN] UDP ignoré (clé réseau différente) @ ' + rinfo.address);
          return;
        }

        if (msg.type === 'CKBPOS_DISCOVER') {
          console.log('[LAN] UDP discover: ' + (msg.machine_label || msg.machine_id) + ' @ ' + rinfo.address);
          connectToPeer(rinfo.address, msg.port);
          // Repondre en unicast
          const reply = Buffer.from(JSON.stringify({ ...getMachineInfo(), type: 'CKBPOS_DISCOVER_REPLY' }));
          udpSocket.send(reply, rinfo.port, rinfo.address, () => {});

        } else if (msg.type === 'CKBPOS_DISCOVER_REPLY') {
          connectToPeer(rinfo.address, msg.port);
        }
      } catch(_e) {}
    });

    udpSocket.on('error', (e) => {
      console.error('[LAN] UDP error:', e.message);
    });

    udpSocket.bind(UDP_PORT, () => {
      try {
        udpSocket.setBroadcast(true);
        console.log('[LAN] UDP discovery socket port ' + UDP_PORT);
        sendDiscoveryBroadcast();
      } catch(e) { console.error('[LAN] setBroadcast error:', e.message); }
    });
  } catch(e) {
    console.error('[LAN] Impossible de demarrer UDP discovery:', e.message);
  }
}

function sendDiscoveryBroadcast() {
  if (!udpSocket) return;
  try {
    const msg = Buffer.from(JSON.stringify({ ...getMachineInfo(), type: 'CKBPOS_DISCOVER' }));
    udpSocket.send(msg, UDP_PORT, '255.255.255.255', (e) => {
      if (e) console.error('[LAN] Broadcast error:', e.message);
    });
  } catch(_e) {}
}

// ── IPC Handlers réseau ─────────────────────────────────────
ipcMain.handle('network-peers-list', () => {
  try { return { success: true, data: getPeersForRenderer() }; }
  catch(e) { return { success: false, error: e.message, data: [] }; }
});

// ── Nettoyage machine détectée (v4.10.0) ───────────────────
ipcMain.handle('network-peer-remove', (_, machine_id) => {
  try {
    if (!machine_id) return { success: false, error: 'machine_id manquant' };
    db.prepare('DELETE FROM network_peers WHERE machine_id=?').run(machine_id);
    peersMap.delete(machine_id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('network-peers-changed', getPeersForRenderer()); } catch(_e) {}
    }
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── v1.8.0 — Clé réseau LAN ────────────────────────────────
ipcMain.handle('get-network-key', () => {
  try { return { success: true, key: getNetworkKey() }; }
  catch(e) { return { success: false, key: '' }; }
});

ipcMain.handle('set-network-key', (_, newKey) => {
  try {
    const key = (newKey || '').trim().toUpperCase();
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('network_key',?)").run(key);
    console.log('[LAN] network_key mise à jour: ' + key);
    // v1.8.1 — Redémarrer les services réseau avec la nouvelle clé
    setTimeout(() => restartNetworkServices(), 300);
    return { success: true, restarted: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── v1.6.0 — Stats multi-machines ──────────────────────────
ipcMain.handle('machines-stats', () => {
  try {
    const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();

    // Machine locale toujours en premier
    const localMachine = {
      machine_id:    MACHINE_ID,
      machine_label: labelRow?.value || 'Esta m\u00e1quina',
      ip:            'LOCAL',
      isLocal:       true,
      status:        'online',
    };

    // Pairs connus en DB + statut live
    const rawPeers = db.prepare('SELECT * FROM network_peers ORDER BY last_seen DESC').all()
      .map(p => ({ ...p, isLocal: false, status: peersMap.has(p.machine_id) ? 'online' : 'offline' }));

    // v3.4 — Déduplication par machine_label :
    // Si deux entrées ont le même label, c'est la même machine physique
    // (réinstall, changement d'IP, etc.) — garder la plus récente / online
    const seenLabels = new Map(); // label \u2192 peer
    for (const p of rawPeers) {
      const label = (p.machine_label || p.machine_id).trim().toLowerCase();
      const existing = seenLabels.get(label);
      if (!existing) {
        seenLabels.set(label, p);
      } else {
        // Garder online > offline, sinon la plus récente
        const keepNew = (p.status === 'online' && existing.status !== 'online') ||
                        (p.status === existing.status && p.last_seen > existing.last_seen);
        if (keepNew) seenLabels.set(label, p);
      }
    }
    // Exclure aussi les pairs qui ont le même label que la machine locale
    const localLabel = (localMachine.machine_label || '').trim().toLowerCase();
    seenLabels.delete(localLabel);

    const peers = [...seenLabels.values()];
    const all = [localMachine, ...peers];

    const result = all.map(m => {
      const day = db.prepare(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as tot FROM ventes WHERE date(date_vente)=date('now') AND machine_id=?"
      ).get(m.machine_id) || { cnt: 0, tot: 0 };

      const week = db.prepare(
        "SELECT COALESCE(SUM(total),0) as tot FROM ventes WHERE date_vente>=date('now','-6 days') AND machine_id=?"
      ).get(m.machine_id) || { tot: 0 };

      const month = db.prepare(
        "SELECT COALESCE(SUM(total),0) as tot FROM ventes WHERE strftime('%Y-%m',date_vente)=strftime('%Y-%m','now') AND machine_id=?"
      ).get(m.machine_id) || { tot: 0 };

      const topProd = db.prepare(`
        SELECT p.nom, SUM(vi.sous_total) as rev
        FROM vente_items vi
        JOIN ventes v  ON vi.vente_id  = v.id
        JOIN products p ON vi.product_id = p.id
        WHERE date(v.date_vente)=date('now') AND v.machine_id=?
        GROUP BY p.id ORDER BY rev DESC LIMIT 1
      `).get(m.machine_id);

      return {
        ...m,
        today_total:  day.tot,
        today_count:  day.cnt,
        week_total:   week.tot,
        month_total:  month.tot,
        top_product:  topProd?.nom || null,
      };
    });

    return { success: true, data: result };
  } catch(e) { return { success: false, error: e.message, data: [] }; }
});

ipcMain.handle('network-status', () => {
  try {
    return {
      success:    true,
      wsPort:     WS_PORT,
      machineId:  MACHINE_ID,
      localIPs:   getLocalIPs(),
      peersCount: peersMap.size,
    };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── v1.8.1 — Redémarrage services réseau (clé réseau changée) ──
function restartNetworkServices() {
  console.log('[LAN] Redémarrage services réseau...');
  clearInterval(heartbeatInterval);
  clearInterval(rebroadcastInterval);
  for (const peer of peersMap.values()) { try { peer.ws?.close(); } catch(_e) {} }
  peersMap.clear();
  try { wssServer?.close(); wssServer = null; } catch(_e) {}
  try { udpSocket?.close(); udpSocket = null; } catch(_e) {}
  broadcastPeersUpdate();
  setTimeout(startNetworkServices, 1200);
}

// ── v1.8.1 — Push instantané LAN + Cloud après vente ────────
function triggerInstantSync() {
  // LAN : envoyer SYNC_REQUEST à tous les pairs connectés
  for (const [id, peer] of peersMap.entries()) {
    if (peer.ws?.readyState === WebSocket.OPEN) sendSyncRequest(id, peer.ws);
  }
  // Cloud : push immédiat
  if (_supabase) pushToCloud().catch(() => {});
}

// ── Démarrage des services réseau ───────────────────────────
function startNetworkServices() {
  startWsServer();
  setTimeout(startUdpDiscovery, 600); // délai léger pour que le serveur WS soit prêt

  // Heartbeat — PING tous les pairs connectés toutes les 5s
  heartbeatInterval = setInterval(() => {
    const ping = encryptPayload({ type: 'PING', machine_id: MACHINE_ID });
    const now  = Date.now();
    for (const [id, peer] of peersMap.entries()) {
      try {
        if (peer.ws?.readyState === WebSocket.OPEN) {
          peer.ws.send(ping);
          // Timeout : si pas de réponse depuis 15s \u2192 déconnecter
          if (now - peer.lastSeen > 15000) {
            peer.ws.terminate();
            peersMap.delete(id);
            broadcastPeersUpdate();
          }
        } else {
          peersMap.delete(id);
          broadcastPeersUpdate();
        }
      } catch(_e) { peersMap.delete(id); }
    }
  }, 5000);

  // Re-broadcast UDP toutes les 20s pour découvrir les nouveaux arrivants
  rebroadcastInterval = setInterval(sendDiscoveryBroadcast, 20000);

  // ADB auto-reverse USB (détection périodique de device + port forwarding)
  startAdbAutoReverse();
}

// ── ADB auto-reverse USB ───────────────────────────────────
let adbReverseInterval = null;

function getAdbPath() {
  // 1. Bundled (electron-builder extraResources)
  try {
    const bundled = path.join(process.resourcesPath || '', 'platform-tools', 'adb.exe');
    const fs = require('fs');
    if (fs.existsSync(bundled)) return bundled;
  } catch(_e) {}
  // 2. Dev mode (resources/platform-tools à la racine du projet)
  try {
    const devPath = path.join(__dirname, 'resources', 'platform-tools', 'adb.exe');
    const fs = require('fs');
    if (fs.existsSync(devPath)) return devPath;
  } catch(_e) {}
  // 3. System PATH (fallback)
  return 'adb';
}

function adbReverse() {
  const adb = getAdbPath();
  execFile(adb, ['reverse', 'tcp:41234', 'tcp:41234'], { timeout: 8000 }, (err, stdout, stderr) => {
    if (err) {
      // Pas de device connecté = pas une erreur critique
      if (err.killed || (stderr && stderr.includes('no devices'))) return;
      console.warn('[ADB-DBG] reverse tcp:41234 failed:', err.message);
    } else {
      console.log('[ADB-DBG] reverse tcp:41234 -> OK');
    }
  });
}

function startAdbAutoReverse() {
  console.log('[ADB-DBG] Starting auto-reverse (every 10s)');
  adbReverse(); // premiers essai immédiat
  adbReverseInterval = setInterval(adbReverse, 10000);
}
app.on('before-quit', () => {
  clearInterval(heartbeatInterval);
  clearInterval(rebroadcastInterval);
  clearInterval(adbReverseInterval);
  for (const peer of peersMap.values()) {
    try { peer.ws?.close(); } catch(_e) {}
  }
  peersMap.clear();
  try { wssServer?.close(); }  catch(_e) {}
  try { udpSocket?.close(); }  catch(_e) {}
});

// ============================================================
// SYNC SQLITE DELTA LAN — v1.5.0
// Protocole : SYNC_REQUEST \u2192 SYNC_DELTA \u2192 SYNC_ACK
// Résolution conflits : last-write-wins (INSERT OR REPLACE)
// ============================================================

const SYNC_TABLES = new Set(['ventes','vente_items','products','stock_mouvements','caderno_entries','caderno_motivos','caderno_trabalhadores','caderno_produtos','users','settings','reservations','reservation_items','historique_modifications']);
const SYNC_LIMIT  = 1000; // entrées max par delta incrémental

// ── Diagnostic démarrage : vérifier que MACHINE_ID correspond aux entrées sync_log ──
setTimeout(() => {
  try {
    const syncCount = db.prepare('SELECT COUNT(*) as c FROM sync_log WHERE machine_id=?').get(MACHINE_ID)?.c || 0;
    const totalCount = db.prepare('SELECT COUNT(*) as c FROM sync_log').get()?.c || 0;
    console.log('[SYNC] MACHINE_ID:', MACHINE_ID, '| sync_log propres:', syncCount, '/ total:', totalCount);
    if (totalCount > 0 && syncCount === 0) {
      console.warn('[SYNC] \u26A0 ATTENTION: aucune entrée sync_log pour ce MACHINE_ID — machine_id mismatch possible!');
    }
  } catch(_e) {}
}, 3000);

// ── Statut sync courant ─────────────────────────────────────
function updateSyncStatus() {
  try {
    const pending = db.prepare(
      "SELECT COUNT(*) as c FROM sync_log WHERE machine_id=? AND synced_to='[]'"
    ).get(MACHINE_ID)?.c || 0;

    const online = peersMap.size;
    let status;
    if      (online === 0 && pending > 0) status = 'offline';
    else if (online > 0  && pending > 0) status = 'pending';
    else if (online > 0  && pending === 0) status = 'synced';
    else                                   status = 'idle';

    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('sync-status-changed', { status, pending, online }); } catch(_e) {}
    }
  } catch(_e) {}
}

// ── Construire et envoyer SYNC_REQUEST ─────────────────────
function sendSyncRequest(peerMachineId, ws) {
  try {
    if (ws?.readyState !== WebSocket.OPEN) return;
    const state    = db.prepare('SELECT last_seq FROM sync_state WHERE machine_id=?').get(peerMachineId);
    const last_seq = state?.last_seq || 0;
    secureSend(ws, { type: 'SYNC_REQUEST', machine_id: MACHINE_ID, last_seq });
    console.log('[SYNC] SYNC_REQUEST \u2192 ' + peerMachineId + ' (seq ' + last_seq + ')');
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('sync-status-changed', { status: 'syncing', pending: -1, online: peersMap.size }); } catch(_e) {}
    }
  } catch(e) { console.error('[SYNC] sendSyncRequest:', e.message); }
}

// ── Debounce counter-SYNC_REQUEST (sync bidirectionnel) ────
// Quand B reçoit SYNC_REQUEST de A, B répond avec SYNC_DELTA
// ET envoie son propre SYNC_REQUEST à A (debounce 5s par pair)
const _counterSyncTimers = new Map();
function scheduleCounterSync(peerMachineId) {
  if (_counterSyncTimers.has(peerMachineId)) return; // déjà planifié
  const timer = setTimeout(() => {
    _counterSyncTimers.delete(peerMachineId);
    const peer = peersMap.get(peerMachineId);
    if (peer?.ws?.readyState === WebSocket.OPEN) {
      sendSyncRequest(peerMachineId, peer.ws);
      console.log('[SYNC] Counter-SYNC_REQUEST \u2192 ' + peerMachineId + ' (sync bidir)');
    }
  }, 5000);
  _counterSyncTimers.set(peerMachineId, timer);
}

// ── Répondre à SYNC_REQUEST \u2192 envoyer SYNC_DELTA ───────────
function handleSyncRequest(ws, msg) {
  try {
    const { machine_id, last_seq } = msg;
    // Sync initial (seq=0) : envoyer TOUT sans limite ; sync incrémental : limite SYNC_LIMIT
    const isInitial = !last_seq || last_seq === 0;
    const entries = isInitial
      ? db.prepare('SELECT * FROM sync_log WHERE machine_id=? ORDER BY id').all(MACHINE_ID)
      : db.prepare('SELECT * FROM sync_log WHERE machine_id=? AND id>? ORDER BY id LIMIT ?').all(MACHINE_ID, last_seq, SYNC_LIMIT);

    if (entries.length === 0) {
      secureSend(ws, { type: 'SYNC_DELTA', machine_id: MACHINE_ID, last_id: last_seq || 0, entries: [] });
      // Memoiser le seq même si delta vide
      try {
        db.prepare("INSERT OR REPLACE INTO sync_state (machine_id,last_sync_at,last_seq) VALUES (?,datetime('now','utc'),?)")
          .run(machine_id, last_seq || 0);
      } catch(_e) {}
      // v1.9.1 — sync bidir : même si delta vide, contre-sync pour envoyer NOS données
      scheduleCounterSync(machine_id);
      return;
    }

    // Dédupliquer : garder la dernière opération par (table, record_id)
    const deduped = new Map();
    for (const e of entries) deduped.set(e.table_name + ':' + e.record_id, e);

    // Enrichir avec les données actuelles de la ligne
    const enriched = [];
    for (const e of deduped.values()) {
      if (!SYNC_TABLES.has(e.table_name)) continue;
      if (e.operation !== 'DELETE') {
        try {
          let row;
          // settings : PK = key TEXT, record_id = rowid
          if (e.table_name === 'settings') {
            row = db.prepare('SELECT key, value, rowid FROM settings WHERE rowid=?').get(e.record_id);
          } else {
            row = db.prepare('SELECT * FROM "' + e.table_name + '" WHERE id=?').get(e.record_id);
          }
          enriched.push({ id: e.id, table_name: e.table_name, record_id: e.record_id, operation: row ? e.operation : 'DELETE', row: row || null });
        } catch(_e) {}
      } else {
        enriched.push({ id: e.id, table_name: e.table_name, record_id: e.record_id, operation: 'DELETE', row: null });
      }
    }

    const lastId = entries[entries.length - 1].id;
    secureSend(ws, { type: 'SYNC_DELTA', machine_id: MACHINE_ID, last_id: lastId, entries: enriched });
    console.log('[SYNC] SYNC_DELTA \u2192 ' + machine_id + ' : ' + enriched.length + ' entrees (seq ' + lastId + ')');
    // Memoiser le dernier seq envoyé à ce pair (évite de re-sent le même delta)
    try {
      db.prepare("INSERT OR REPLACE INTO sync_state (machine_id,last_sync_at,last_seq) VALUES (?,datetime('now','utc'),?)")
        .run(machine_id, lastId);
    } catch(_e) {}
    // v1.9.1 — sync bidir : après avoir répondu à A, demander les données de A
    scheduleCounterSync(machine_id);
  } catch(e) { console.error('[SYNC] handleSyncRequest:', e.message); }
}

// ── Appliquer un SYNC_DELTA reçu ───────────────────────────
function handleSyncDelta(ws, msg) {
  // Déclarer avant le try pour que le catch puisse envoyer l'ACK même en cas d'erreur
  const { machine_id, entries, last_id } = msg;
  const ackSeq = last_id || 0;
  try {

    if (!entries || entries.length === 0) {
      // Mettre à jour sync_state même si delta vide (évite boucle seq=0 infinie)
      try {
        db.prepare("INSERT OR REPLACE INTO sync_state (machine_id,last_sync_at,last_seq) VALUES (?,datetime('now','utc'),?)")
          .run(machine_id, ackSeq);
      } catch(_e) {}
      try { secureSend(ws, { type: 'SYNC_ACK', machine_id: MACHINE_ID, last_seq: ackSeq }); } catch(_e) {}
      return;
    }

    console.log('[SYNC] SYNC_DELTA recu de ' + machine_id + ' : ' + entries.length + ' entrees');

    // Désactiver les triggers pendant l'apply (éviter l'écho)
    db.prepare("UPDATE settings SET value='1' WHERE key='sync_applying'").run();

    let applied = 0, skipped = 0;
    try {
      // Cache des colonnes connues par table (pour tolérance aux différences de schéma)
      const _colCache = new Map();
      const knownCols = (tbl) => {
        if (!_colCache.has(tbl)) {
          try { _colCache.set(tbl, new Set(db.prepare('PRAGMA table_info("'+tbl+'")').all().map(c=>c.name))); }
          catch(_) { _colCache.set(tbl, new Set()); }
        }
        return _colCache.get(tbl);
      };

      db.transaction(() => {
        for (const e of entries) {
          if (!SYNC_TABLES.has(e.table_name)) { skipped++; continue; }
          try {
            if (e.operation === 'DELETE') {
              db.prepare('DELETE FROM "' + e.table_name + '" WHERE id=?').run(e.record_id);
            } else if (e.row && typeof e.row === 'object') {
              // ── Cas spécial : table settings (PK = key TEXT, pas id) ──
              if (e.table_name === 'settings') {
                const LOCAL_KEYS = new Set(['machine_id','machine_label','network_key','supabase_url','supabase_key','cloud_last_seq','sync_applying','printer_mode','printer_machine_id','coordinator_id','coordinator_label','setup_done','remember_session','fundo_caixa_hoje','fundo_caixa_date']);
                if (LOCAL_KEYS.has(e.row.key)) { skipped++; continue; }
                db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(e.row.key, e.row.value);
              } else if (e.table_name === 'users') {
                const row = e.row;
                const known = knownCols('users');
                const rowKeys = Object.keys(row).filter(k => known.has(k));
                if (rowKeys.length === 0) { skipped++; continue; }
                const existing = db.prepare('SELECT id FROM users WHERE email=?').get(row.email);
                if (existing) {
                  const skip = new Set(['id','created_at']);
                  const sets = rowKeys.filter(k=>!skip.has(k)).map(k=>'"'+k+'"=?').join(',');
                  const vals = rowKeys.filter(k=>!skip.has(k)).map(k=>row[k]);
                  if (sets) db.prepare('UPDATE users SET '+sets+' WHERE email=?').run(...vals, row.email);
                } else {
                  const skip = new Set(['id']);
                  const cols = rowKeys.filter(k=>!skip.has(k)).map(c=>'"'+c+'"').join(',');
                  const phs  = rowKeys.filter(k=>!skip.has(k)).map(()=>'?').join(',');
                  const vals = rowKeys.filter(k=>!skip.has(k)).map(k=>row[k]);
                  try { db.prepare('INSERT INTO users ('+cols+') VALUES ('+phs+')').run(...vals); }
                  catch(_eu) {}
                }
              } else if (e.table_name === 'ventes' && e.row.uuid) {
                // ── v4.9.5 — Cas spécial : table ventes (déduplication par UUID) ──
                // La table ventes a un AUTOINCREMENT local : l'id distant ne correspond
                // jamais à l'id local. On déduplique par uuid pour éviter qu'une vente
                // distante (même id autoincrement, uuid différent) n'écrase une vente locale.
                const existing = db.prepare('SELECT id FROM ventes WHERE uuid=?').get(e.row.uuid);
                const known = knownCols('ventes');
                const rowKeys = Object.keys(e.row).filter(k => known.has(k));
                if (rowKeys.length === 0) { skipped++; continue; }
                if (existing) {
                  const skip = new Set(['id','uuid']);
                  const sets = rowKeys.filter(k=>!skip.has(k)).map(k=>'"'+k+'"=?').join(',');
                  const vals = rowKeys.filter(k=>!skip.has(k)).map(k=>e.row[k]);
                  if (sets) db.prepare('UPDATE ventes SET '+sets+' WHERE uuid=?').run(...vals, e.row.uuid);
                } else {
                  const skip = new Set(['id']);
                  const cols = rowKeys.filter(k=>!skip.has(k)).map(c=>'"'+c+'"').join(',');
                  const phs  = rowKeys.filter(k=>!skip.has(k)).map(()=>'?').join(',');
                  const vals = rowKeys.filter(k=>!skip.has(k)).map(k=>e.row[k]);
                  try { db.prepare('INSERT INTO ventes ('+cols+') VALUES ('+phs+')').run(...vals); }
                  catch(_ev) {}
                }
              } else {
                // ── Fix robustesse schéma : filtrer les colonnes inconnues ──
                const known = knownCols(e.table_name);
                const rowKeys = Object.keys(e.row).filter(k => known.has(k));
                if (rowKeys.length === 0) { skipped++; continue; }
                const cols = rowKeys.map(c => '"' + c + '"').join(',');
                const phs  = rowKeys.map(() => '?').join(',');
                const vals = rowKeys.map(k => e.row[k]);
                db.prepare('INSERT OR REPLACE INTO "' + e.table_name + '" (' + cols + ') VALUES (' + phs + ')').run(...vals);
              }
            }
            applied++;
          } catch(_e2) { skipped++; }
        }
      })();
    } finally {
      db.prepare("UPDATE settings SET value='0' WHERE key='sync_applying'").run();
    }

    console.log('[SYNC] Applique: ' + applied + ' ok, ' + skipped + ' skip');

    // Mémoriser le dernier seq de ce pair
    db.prepare("INSERT OR REPLACE INTO sync_state (machine_id,last_sync_at,last_seq) VALUES (?,datetime('now','utc'),?)")
      .run(machine_id, ackSeq);

    // Envoyer ACK
    secureSend(ws, { type: 'SYNC_ACK', machine_id: MACHINE_ID, last_seq: ackSeq });

    // Notifier le renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      // v3.7.0 — inclure le label de la machine source pour le toast
      const fromPeer = db.prepare('SELECT * FROM network_peers WHERE machine_id=?').get(machine_id);
      const fromLabel = fromPeer?.machine_label || machine_id?.slice(0,8) || '?';
      try { mainWindow.webContents.send('sync-status-changed', { status: applied > 0 ? 'synced' : 'idle', pending: 0, online: peersMap.size, applied, fromLabel }); } catch(_e) {}
    }
    updateSyncStatus();
  } catch(e) {
    console.error('[SYNC] handleSyncDelta:', e.message);
    try { db.prepare("UPDATE settings SET value='0' WHERE key='sync_applying'").run(); } catch(_e2) {}
    // Envoyer ACK même en cas d'erreur pour éviter la boucle infinie seq=0
    try { secureSend(ws, { type: 'SYNC_ACK', machine_id: MACHINE_ID, last_seq: ackSeq }); } catch(_e3) {}
  }
}

// ── Traiter un SYNC_ACK reçu ───────────────────────────────
function handleSyncAck(msg) {
  try {
    const { machine_id, last_seq } = msg;
    if (!machine_id) return;

    // Marquer nos entrées comme reçues par ce pair
    const rows = db.prepare('SELECT id, synced_to FROM sync_log WHERE machine_id=? AND id<=?').all(MACHINE_ID, last_seq || 0);
    const upd  = db.prepare('UPDATE sync_log SET synced_to=? WHERE id=?');
    for (const r of rows) {
      const arr = JSON.parse(r.synced_to || '[]');
      if (!arr.includes(machine_id)) { arr.push(machine_id); upd.run(JSON.stringify(arr), r.id); }
    }
    console.log('[SYNC] ACK de ' + machine_id + ' — seq ' + last_seq);
    updateSyncStatus();
  } catch(e) { console.error('[SYNC] handleSyncAck:', e.message); }
}

// ── IPC Handlers sync ───────────────────────────────────────
ipcMain.handle('sync-status', () => {
  try {
    const pending = db.prepare("SELECT COUNT(*) as c FROM sync_log WHERE machine_id=? AND synced_to='[]'").get(MACHINE_ID)?.c || 0;
    return { success: true, status: peersMap.size > 0 ? (pending > 0 ? 'pending' : 'synced') : (pending > 0 ? 'offline' : 'idle'), pending, online: peersMap.size };
  } catch(e) { return { success: false, status: 'idle', pending: 0 }; }
});

ipcMain.handle('sync-force', () => {
  try {
    for (const [id, peer] of peersMap.entries()) {
      if (peer.ws?.readyState === WebSocket.OPEN) sendSyncRequest(id, peer.ws);
    }
    return { success: true };
  } catch(e) { return { success: false }; }
});

// ── Intégration dans les handlers WS existants ─────────────
// Patch appliqué aux deux handlers (serveur + client) via une fonction centrale
function handleSyncMessage(ws, msg, peerMachineId) {
  if      (msg.type === 'SYNC_REQUEST')   handleSyncRequest(ws, msg);
  else if (msg.type === 'SYNC_DELTA')     handleSyncDelta(ws, msg);
  else if (msg.type === 'SYNC_ACK')       handleSyncAck(msg);
  else if (msg.type === 'PRINT_REQUEST')  handlePrintRequest(ws, msg);
  else if (msg.type === 'PRINT_RESPONSE') handlePrintResponse(msg);
}
// Note : sendSyncRequest() est appelé dans les handlers WS existants
// après l'échange CKBPOS_INFO, via le listener 'peer-registered' ci-dessous.
// Electron émet cet événement interne depuis broadcastPeersUpdate — voir patch ci-dessous.

// ── Patch broadcastPeersUpdate pour déclencher sync au connect ─
const _origBroadcast = broadcastPeersUpdate;
// Quand un pair se connecte, envoyer SYNC_REQUEST automatiquement
// On surveille les nouveaux pairs via peersMap — implémenté via peerRegistered()
function onPeerRegistered(peerMachineId) {
  setTimeout(() => {
    const peer = peersMap.get(peerMachineId);
    if (peer?.ws?.readyState === WebSocket.OPEN) {
      sendSyncRequest(peerMachineId, peer.ws);
    }
  }, 300); // légère pause pour laisser CKBPOS_INFO s'établir
}

// ── Périodique : sync toutes les 30s + status check ────────
setInterval(() => {
  for (const [id, peer] of peersMap.entries()) {
    if (peer.ws?.readyState === WebSocket.OPEN) sendSyncRequest(id, peer.ws);
  }
  updateSyncStatus();
}, 30000);

// ── Exposer handleSyncMessage aux handlers WS du bloc LAN ──
// Les blocs WS existants appellent handleSyncMessage() dans leur clause else
// Ceci est fait en monkey-patching le prototype via un registre global simple
global._ckbSyncHandlers = { handleSyncMessage, onPeerRegistered };

// ============================================================
// COORDINATEUR — v3.0
// Élection : machine_label='Caixa Principal' en priorité,
// fallback : machine_id alphanumérique le plus petit.
// Source de vérité pour : Stock reservations + Print queue
// ============================================================

let _isCoordinator      = false;
let _coordinatorId      = '';
let _coordinatorLabel   = '';
let _coordCheckTimer    = null;
let _coordAnnounceTimer = null;
const COORD_TTL_MS      = 12000;
let _lastCoordSeen      = 0;

function shouldBeCoordinator() {
  const label = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get()?.value || '';
  if (label === 'Caixa Principal') return true;
  const allIds = [MACHINE_ID, ...peersMap.keys()].sort();
  return allIds[0] === MACHINE_ID;
}

function becomeCoordinator() {
  if (_isCoordinator) return;
  _isCoordinator  = true;
  _coordinatorId  = MACHINE_ID;
  const label = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get()?.value || 'CKBPOS';
  _coordinatorLabel = label;
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('coordinator_id',?)").run(MACHINE_ID);
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('coordinator_label',?)").run(label);
  try { db.prepare("INSERT INTO coordinator_log (machine_id,machine_label,event) VALUES (?,?,'ELECTED')").run(MACHINE_ID, label); } catch(_e) {}
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
  const msg = encryptPayload({ type: 'COORD_ANNOUNCE', machine_id: MACHINE_ID, machine_label: _coordinatorLabel, ts: Date.now() });
  for (const peer of peersMap.values()) {
    if (peer.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(msg); } catch(_e) {}
  }
}

function handleCoordAnnounce(msg) {
  _lastCoordSeen    = Date.now();
  _coordinatorId    = msg.machine_id;
  _coordinatorLabel = msg.machine_label || '';
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('coordinator_id',?)").run(msg.machine_id);
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('coordinator_label',?)").run(_coordinatorLabel);
  } catch(_e) {}
  if (_isCoordinator && msg.machine_id !== MACHINE_ID) {
    const theirLabel = msg.machine_label || '';
    const myLabel    = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get()?.value || '';
    const theyWin = (theirLabel === 'Caixa Principal' && myLabel !== 'Caixa Principal') ||
                    (myLabel !== 'Caixa Principal' && msg.machine_id < MACHINE_ID);
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('coord-status-changed', { isCoordinator: _isCoordinator, coordinatorId: _coordinatorId, coordinatorLabel: _coordinatorLabel, degraded: _degradedMode }); } catch(_e) {}
  }
}

ipcMain.handle('coord-status', () => ({ success: true, isCoordinator: _isCoordinator, coordinatorId: _coordinatorId, coordinatorLabel: _coordinatorLabel, degraded: _degradedMode || false }));

// ── Patch onPeerRegistered pour annoncer après connexion ────
const _origOnPeerReg = onPeerRegistered;
function onPeerRegisteredV3(peerMachineId) {
  _origOnPeerReg(peerMachineId);
  setTimeout(() => { if (_isCoordinator) broadcastCoordAnnounce(); else runCoordElection(); }, 600);
}

_coordCheckTimer    = setInterval(runCoordElection, 10000);
_coordAnnounceTimer = setInterval(() => { if (_isCoordinator) broadcastCoordAnnounce(); }, 5000);

setTimeout(() => { if (!_coordinatorId) { if (shouldBeCoordinator()) becomeCoordinator(); else runCoordElection(); } }, 3000);

// ── Handler v3 étendu ───────────────────────────────────────
function handleSyncMessageV3(ws, msg, peerMachineId) {
  if      (msg.type === 'COORD_ANNOUNCE') handleCoordAnnounce(msg);
  else if (msg.type === 'STOCK_RESERVE')  handleStockReserve(ws, msg);
  else if (msg.type === 'STOCK_RELEASE')  handleStockRelease(msg);
  else if (msg.type === 'STOCK_RESERVED') handleStockReserved(msg);
  else if (msg.type === 'PRINT_ENQUEUE')  handlePrintEnqueue(ws, msg);
  else if (msg.type === 'PRINT_QUEUED')   handlePrintQueued(msg);
  else if (msg.type === 'PRINT_DONE')     handlePrintDoneReceived(msg);
  else                                    handleSyncMessage(ws, msg, peerMachineId);
}
global._ckbSyncHandlers = { handleSyncMessage: handleSyncMessageV3, onPeerRegistered: onPeerRegisteredV3 };

// ============================================================
// STOCK LOCK — v3.0
// ============================================================

const RESERVATION_TTL_S   = 30;
const _stockReserveCallbacks = new Map();

function handleStockReserve(ws, msg) {
  if (!_isCoordinator) {
    try { secureSend(ws, { type: 'STOCK_RESERVED', reservation_id: msg.reservation_id, ok: false, reason: 'not_coordinator' }); } catch(_e) {}
    return;
  }
  try {
    const { reservation_id, product_id, variant_id, qty, machine_id } = msg;
    let stockReel = 0;
    if (variant_id) {
      stockReel = db.prepare('SELECT stock_cartons FROM product_variants WHERE id=?').get(variant_id)?.stock_cartons || 0;
    } else {
      stockReel = db.prepare('SELECT stock_cartons FROM products WHERE id=?').get(product_id)?.stock_cartons || 0;
    }
    const reservedQty = db.prepare(
      "SELECT COALESCE(SUM(qty_reserved),0) as tot FROM stock_reservations WHERE product_id=? AND status='active' AND expires_at > datetime('now','utc')"
    ).get(product_id)?.tot || 0;
    const available = stockReel - reservedQty;
    if (available < qty) {
      secureSend(ws, { type: 'STOCK_RESERVED', reservation_id, ok: false, reason: 'insufficient_stock', available });
      console.log('[COORD] STOCK refusé prod=' + product_id + ' dispo=' + available + ' demandé=' + qty);
      return;
    }
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_S * 1000).toISOString().replace('T',' ').slice(0,19);
    db.prepare('INSERT INTO stock_reservations (reservation_id,product_id,variant_id,qty_reserved,machine_id,expires_at) VALUES (?,?,?,?,?,?)')
      .run(reservation_id, product_id, variant_id || null, qty, machine_id, expiresAt);
    secureSend(ws, { type: 'STOCK_RESERVED', reservation_id, ok: true, available: available - qty });
    console.log('[COORD] STOCK réservé ' + reservation_id.slice(0,8) + ' prod=' + product_id + ' qty=' + qty);
  } catch(e) {
    console.error('[COORD] handleStockReserve:', e.message);
    try { secureSend(ws, { type: 'STOCK_RESERVED', reservation_id: msg.reservation_id, ok: false, reason: 'error' }); } catch(_e) {}
  }
}

function handleStockRelease(msg) {
  if (!_isCoordinator) return;
  try { db.prepare('UPDATE stock_reservations SET status=? WHERE reservation_id=?').run(msg.consumed ? 'consumed' : 'released', msg.reservation_id); }
  catch(e) { console.error('[COORD] handleStockRelease:', e.message); }
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
        catch(_e) { reject(new Error('erro interno')); }
      }};
      handleStockReserve(fakeWs, { reservation_id, product_id, variant_id, qty, machine_id: MACHINE_ID });
      return;
    }
    const coordPeer = peersMap.get(_coordinatorId);
    if (!coordPeer || coordPeer.ws?.readyState !== WebSocket.OPEN) {
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
    coordPeer.secureSend(ws, { type: 'STOCK_RESERVE', reservation_id, product_id, variant_id, qty, machine_id: MACHINE_ID });
  });
}

function releaseStockReservation(reservation_id, consumed = true) {
  if (!reservation_id) return;
  if (_isCoordinator) {
    try { db.prepare('UPDATE stock_reservations SET status=? WHERE reservation_id=?').run(consumed ? 'consumed' : 'released', reservation_id); } catch(_e) {}
    return;
  }
  const coordPeer = peersMap.get(_coordinatorId);
  if (coordPeer?.ws?.readyState === WebSocket.OPEN) {
    try { coordPeer.secureSend(ws, { type: 'STOCK_RELEASE', reservation_id, consumed }); } catch(_e) {}
  }
}

setInterval(() => {
  try { db.prepare("UPDATE stock_reservations SET status='expired' WHERE status='active' AND expires_at < datetime('now','utc')").run(); } catch(_e) {}
}, 30000);

ipcMain.handle('stock-reserve', async (_, { product_id, variant_id, qty }) => {
  try { return { success: true, ...(await requestStockReservation(product_id, variant_id || null, qty)) }; }
  catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('stock-release', (_, { reservation_id, consumed }) => {
  releaseStockReservation(reservation_id, consumed !== false);
  return { success: true };
});

// ============================================================
// PRINT QUEUE — v3.0
// ============================================================

let _printQueueRunning  = false;
let _printQueueInterval = null;
const _printQueuedCallbacks = new Map();
const _printDoneCallbacks   = new Map();

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
    const job = db.prepare("SELECT * FROM print_queue WHERE status='queued' ORDER BY priority ASC, id ASC LIMIT 1").get();
    if (!job) { _printQueueRunning = false; return; }
    db.prepare("UPDATE print_queue SET status='printing' WHERE id=?").run(job.id);
    console.log('[PRINT] Job ' + job.job_id.slice(0,8) + ' type=' + job.print_type);
    try {
      const data = JSON.parse(job.data_json);
      const { ticketSizeMm, copiesTicket, copiesShift } = getPrintSettings();

      // Vérifier si impression doit être routée vers machine distante
      const printerMode = db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
      const targetId    = db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
      const useRemote   = printerMode === 'shared' && targetId && targetId !== MACHINE_ID;

      if (useRemote) {
        const peer = peersMap.get(targetId);
        if (peer?.ws?.readyState === WebSocket.OPEN) {
          console.log('[PRINT] Router job vers machine distante: ' + targetId);
          await sendPrintRequest(targetId, job.print_type, data);
          db.prepare("UPDATE print_queue SET status='done', done_at=datetime('now','utc') WHERE id=?").run(job.id);
          notifyPrintDone(job.job_id, job.machine_source, true, null);
          _printQueueRunning = false;
          return;
        } else {
          console.warn('[PRINT] Machine distante hors ligne (' + targetId + ') — fallback local');
        }
      }

      // Impression locale
      if (job.print_type === 'ticket') {
        let qrDataUrl = '';
        if (QRCode) try { const t = [data.numeroFacture||'N/A',`${data.total} ${data.currency}`,data.date,data.seller].join('|'); qrDataUrl = await QRCode.toDataURL(t,{width:128,margin:2,errorCorrectionLevel:'L',color:{dark:'#000000',light:'#ffffff'}}); } catch(_e) {}
        await printHTML(generateTicketHTML({ ...data, qrDataUrl, flags: getTicketFlags(), ticketSizeMm }), data.copies || copiesTicket || 2, true);
      } else if (job.print_type === 'shift') {
        await printHTML(generateShiftHTML({ ...data, ticketSizeMm }), data.copies || copiesShift || 1, true);
      } else if (job.print_type === 'caderno') {
        await printHTML(generateCadernoTicketHTML({ ...data, ticketSizeMm }), 1, true);
      }
      db.prepare("UPDATE print_queue SET status='done', done_at=datetime('now','utc') WHERE id=?").run(job.id);
      notifyPrintDone(job.job_id, job.machine_source, true, null);
    } catch(printErr) {
      console.error('[PRINT] Job échoué:', printErr.message);
      db.prepare("UPDATE print_queue SET status='failed', error=? WHERE id=?").run(printErr.message, job.id);
      notifyPrintDone(job.job_id, job.machine_source, false, printErr.message);
    }
  } catch(e) { console.error('[PRINT] processPrintQueue:', e.message); }
  _printQueueRunning = false;
}

function notifyPrintDone(job_id, sourceMachineId, success, error) {
  if (sourceMachineId === MACHINE_ID) {
    const cb = _printDoneCallbacks.get(job_id);
    if (cb) { clearTimeout(cb.timer); _printDoneCallbacks.delete(job_id); cb.resolve({ success, error }); }
    return;
  }
  const peer = peersMap.get(sourceMachineId);
  if (peer?.ws?.readyState === WebSocket.OPEN) try { peer.secureSend(ws, { type: 'PRINT_DONE', job_id, success, error: error || null }); } catch(_e) {}
}

function handlePrintEnqueue(ws, msg) {
  if (!_isCoordinator) {
    try { secureSend(ws, { type: 'PRINT_QUEUED', job_id: msg.job_id, position: -1, error: 'not_coordinator' }); } catch(_e) {}
    return;
  }
  try {
    const { job_id, print_type, data, priority, machine_source } = msg;
    db.prepare('INSERT OR IGNORE INTO print_queue (job_id,print_type,data_json,priority,machine_source) VALUES (?,?,?,?,?)')
      .run(job_id, print_type, JSON.stringify(data), priority || 5, machine_source || MACHINE_ID);
    const position = db.prepare("SELECT COUNT(*) as c FROM print_queue WHERE status='queued' AND id<=(SELECT id FROM print_queue WHERE job_id=?)").get(job_id)?.c || 1;
    secureSend(ws, { type: 'PRINT_QUEUED', job_id, position });
    console.log('[PRINT] Enqueued job=' + job_id.slice(0,8) + ' pos=' + position);
  } catch(e) {
    console.error('[PRINT] handlePrintEnqueue:', e.message);
    try { secureSend(ws, { type: 'PRINT_QUEUED', job_id: msg.job_id, position: -1, error: e.message }); } catch(_e) {}
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
        db.prepare('INSERT OR IGNORE INTO print_queue (job_id,print_type,data_json,priority,machine_source) VALUES (?,?,?,?,?)')
          .run(job_id, print_type, JSON.stringify(data), priority || 5, MACHINE_ID);
        resolve({ success: true, job_id, position: 1, queued: true });
      } catch(e) { resolve({ success: false, error: e.message }); }
      return;
    }
    const coordPeer = peersMap.get(_coordinatorId);
    if (!coordPeer || coordPeer.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[PRINT] Coordinador offline — modo degradado');
      resolve({ success: false, degraded: true, job_id });
      return;
    }
    const timer = setTimeout(() => {
      _printQueuedCallbacks.delete(job_id);
      resolve({ success: false, degraded: true, job_id, error: 'timeout' });
    }, 3000);
    _printQueuedCallbacks.set(job_id, { resolve, timer });
    coordPeer.secureSend(ws, { type: 'PRINT_ENQUEUE', job_id, print_type, data, priority: priority || 5, machine_source: MACHINE_ID });
  });
}

ipcMain.handle('print-queue-status', () => {
  try {
    const queued   = db.prepare("SELECT COUNT(*) as c FROM print_queue WHERE status='queued'").get()?.c || 0;
    const printing = db.prepare("SELECT COUNT(*) as c FROM print_queue WHERE status='printing'").get()?.c || 0;
    return { success: true, queued, printing, isCoordinator: _isCoordinator, coordinatorId: _coordinatorId, coordinatorLabel: _coordinatorLabel };
  } catch(e) { return { success: false }; }
});

// ── Remplacer les IPC impression par versions v3 ────────────
ipcMain.removeHandler('print-ticket');
ipcMain.handle('print-ticket', async (_, data) => {
  try {
    const printerMode = db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
    const targetId    = db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
    if (printerMode === 'shared' && targetId) {
      const useQueue = targetId === _coordinatorId || _isCoordinator;
      if (useQueue) {
        const r = await enqueuePrintJob('ticket', data, 5);
        if (!r.degraded) return { success: true, queued: true, job_id: r.job_id };
      } else {
        const peer = peersMap.get(targetId);
        if (peer?.ws?.readyState === WebSocket.OPEN) {
          try { await sendPrintRequest(targetId, 'ticket', data); return { success: true, remote: true }; }
          catch(e) { console.error('[PRINT] Fallback local:', e.message); }
        }
      }
    }
    let qrDataUrl = '';
    if (QRCode) try { const t = [data.numeroFacture||'N/A',`${data.total} ${data.currency}`,data.date,data.seller].join('|'); qrDataUrl = await QRCode.toDataURL(t,{width:128,margin:2,errorCorrectionLevel:'L',color:{dark:'#000000',light:'#ffffff'}}); } catch(e) {}
    const { copiesTicket, ticketSizeMm } = getPrintSettings();
    const result = await printHTML(generateTicketHTML({ ...data, qrDataUrl, flags: getTicketFlags(), ticketSizeMm }), data.copies || copiesTicket || 2, true);
    return { success: true, ...(result || {}) };
  } catch(e) { console.error('[print-ticket]', e.message); return { success: true, error: e.message }; }
});

ipcMain.removeHandler('print-shift-report');
ipcMain.handle('print-shift-report', async (_, data) => {
  try {
    const printerMode = db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
    const targetId    = db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
    if (printerMode === 'shared' && targetId) {
      const useQueue = targetId === _coordinatorId || _isCoordinator;
      if (useQueue) {
        const r = await enqueuePrintJob('shift', data, 3);
        if (!r.degraded) return { success: true, queued: true };
      } else {
        const peer = peersMap.get(targetId);
        if (peer?.ws?.readyState === WebSocket.OPEN) {
          try { await sendPrintRequest(targetId, 'shift', data); return { success: true, remote: true }; } catch(e) {}
        }
      }
    }
    const { copiesShift, ticketSizeMm } = getPrintSettings();
    let cadernoResume = null;
    try {
      const today = new Date().toISOString().slice(0,10);
      const rows = db.prepare('SELECT direction,montant,est_dette,statut_dette FROM caderno_entries WHERE date_jour=?').all(today);
      if (rows.length) {
        const totalPlus  = rows.filter(e=>e.direction==='entree').reduce((s,e)=>s+e.montant,0);
        const totalMoins = rows.filter(e=>e.direction!=='entree').reduce((s,e)=>s+e.montant,0);
        const dettes     = rows.filter(e=>e.est_dette&&e.statut_dette!=='pago').reduce((s,e)=>s+e.montant,0);
        cadernoResume = { totalPlus, totalMoins, dettes, net: totalPlus-totalMoins };
      }
    } catch(err) { console.error('[shift caderno]', err.message); }
    await printHTML(generateShiftHTML({ ...data, cadernoResume, ticketSizeMm }), data.copies || copiesShift || 1, true);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.removeHandler('print-caderno');
ipcMain.handle('print-caderno', async (_, data) => {
  try {
    const printerMode = db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
    const targetId    = db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
    if (printerMode === 'shared' && targetId) {
      const useQueue = targetId === _coordinatorId || _isCoordinator;
      if (useQueue) {
        const r = await enqueuePrintJob('caderno', data, 7);
        if (!r.degraded) return { success: true, queued: true };
      } else {
        const peer = peersMap.get(targetId);
        if (peer?.ws?.readyState === WebSocket.OPEN) {
          try { await sendPrintRequest(targetId, 'caderno', data); return { success: true, remote: true }; } catch(e) {}
        }
      }
    }
    const { ticketSizeMm } = getPrintSettings();
    await printHTML(generateCadernoTicketHTML({ ...data, ticketSizeMm }), 1, true);
    return { success: true };
  } catch(e) { console.error('[print-caderno]', e.message); return { success: true, error: e.message }; }
});

// ============================================================
// RAPPORT COMPTABLE — Impression du compte de résultat
// ============================================================
ipcMain.handle('print-rapport-comptable', async (_, data) => {
  try {
    const { ca, cmv, depenses, cadernoPlus, cadernoMoins, capitalInitial, currency, shopName, shopAddress, shopPhone, shopNif, printedAt, period } = data;
    const beneficeBrut = (ca || 0) - (cmv || 0);
    const resultatNet = beneficeBrut - (depenses || 0);
    const soldeFinal = (capitalInitial || 0) + (ca || 0) + (cadernoPlus || 0) - (cmv || 0) - (depenses || 0);
    const cur = currency || 'Kz';

    const depensesData = data.depensesParCategorie || [];
    const depRows = depensesData.map(d => `
      <tr>
        <td style="padding:4px 8px;">${d.motivo}</td>
        <td style="padding:4px 8px;text-align:right;font-weight:700;">${fmtNum(d.total)} ${cur}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @page { size: A4; margin: 15mm 12mm; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#000; background:#fff; }
      .header { border-bottom:3px solid #000; padding-bottom:8px; margin-bottom:12px; }
      .title { font-size:18px; font-weight:900; text-transform:uppercase; }
      .subtitle { font-size:12px; color:#444; margin-top:2px; }
      .section { margin-bottom:14px; }
      .section-title { font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:1px solid #ccc; padding-bottom:4px; margin-bottom:8px; }
      .row { display:flex; justify-content:space-between; padding:4px 0; font-size:11px; }
      .row.bold { font-weight:700; font-size:12px; }
      .row.total { border-top:2px solid #000; padding-top:6px; margin-top:4px; font-weight:900; font-size:13px; }
      .row.positive { color:#16a34a; }
      .row.negative { color:#dc2626; }
      table { width:100%; border-collapse:collapse; font-size:11px; }
      th { text-align:left; padding:4px 8px; border-bottom:2px solid #000; font-size:10px; text-transform:uppercase; }
      td { padding:4px 8px; border-bottom:1px solid #eee; }
      .footer { margin-top:16px; font-size:9px; color:#888; border-top:1px solid #ccc; padding-top:6px; text-align:center; }
    </style></head><body>
    <div class="header">
      <div class="title">${shopName || 'CKBPOS'}</div>
      <div class="subtitle">Rapport Comptable — ${period || 'Période'}</div>
      ${shopNif ? `<div style="font-size:10px;color:#666;">NIF: ${shopNif}</div>` : ''}
    </div>
    <div style="font-size:10px;color:#666;margin-bottom:12px;">Imprimé le: ${printedAt || '-'}</div>

    <div class="section">
      <div class="section-title">Compte de Résultat</div>
      <div class="row"><span>Chiffre d'affaires (CA)</span><span style="font-weight:700;">${fmtNum(ca || 0)} ${cur}</span></div>
      <div class="row"><span style="color:#666;">- Coût des marchandises vendues (CMV)</span><span style="color:#dc2626;">-${fmtNum(cmv || 0)} ${cur}</span></div>
      <div class="row bold"><span>= Résultat Brut</span><span class="${beneficeBrut >= 0 ? 'positive' : 'negative'}" style="font-weight:900;">${beneficeBrut >= 0 ? '+' : ''}${fmtNum(beneficeBrut)} ${cur}</span></div>
      <div class="row"><span style="color:#666;">- Dépenses de fonctionnement</span><span style="color:#dc2626;">-${fmtNum(depenses || 0)} ${cur}</span></div>
      <div class="row total"><span>= RÉSULTAT NET</span><span class="${resultatNet >= 0 ? 'positive' : 'negative'}" style="font-size:14px;">${resultatNet >= 0 ? '+' : ''}${fmtNum(resultatNet)} ${cur}</span></div>
    </div>

    ${depensesData.length > 0 ? `
    <div class="section">
      <div class="section-title">Dépenses par catégorie</div>
      <table>
        <thead><tr><th>Catégorie</th><th style="text-align:right;">Montant</th></tr></thead>
        <tbody>${depRows}</tbody>
        <tfoot><tr><td style="font-weight:900;">TOTAL</td><td style="text-align:right;font-weight:900;">${fmtNum(depenses || 0)} ${cur}</td></tr></tfoot>
      </table>
    </div>` : ''}

    <div class="section">
      <div class="section-title">Flux de Trésorerie</div>
      <div class="row"><span>Capital initial</span><span style="font-weight:700;">${fmtNum(capitalInitial || 0)} ${cur}</span></div>
      <div class="row"><span style="color:#16a34a;">+ Ventes</span><span style="color:#16a34a;">+${fmtNum(ca || 0)} ${cur}</span></div>
      <div class="row"><span style="color:#16a34a;">+ Entrées caderno</span><span style="color:#16a34a;">+${fmtNum(cadernoPlus || 0)} ${cur}</span></div>
      <div class="row"><span style="color:#dc2626;">- Dépenses</span><span style="color:#dc2626;">-${fmtNum(depenses || 0)} ${cur}</span></div>
      <div class="row total"><span>SOLDE FINAL</span><span class="${soldeFinal >= 0 ? 'positive' : 'negative'}" style="font-size:14px;">${fmtNum(soldeFinal)} ${cur}</span></div>
    </div>

    <div class="footer">CKBPOS — Rapport généré le ${printedAt || '-'}</div>
    </body></html>`;

    const { ticketSizeMm } = getPrintSettings();
    await printHTML(html, 1, false);
    return { success: true };
  } catch(e) { console.error('[print-rapport-comptable]', e.message); return { success: false, error: e.message }; }
});

// ============================================================
// MODE DÉGRADÉ — v3.1
// Monitoring coordinateur absent + récupération automatique
// ============================================================

let _degradedMode = false;

function checkDegradedMode() {
  const coordAbsent = !_coordinatorId || (!_isCoordinator && Date.now() - _lastCoordSeen > COORD_TTL_MS);
  if (coordAbsent && !_degradedMode) {
    _degradedMode = true;
    console.warn('[COORD] MODE DÉGRADÉ activé');
    notifyCoordStatus();
  } else if (!coordAbsent && _degradedMode) {
    _degradedMode = false;
    console.log('[COORD] Mode dégradé levé');
    if (_isCoordinator) {
      try { db.prepare("UPDATE stock_reservations SET status='expired' WHERE status='active' AND expires_at < datetime('now','utc')").run(); } catch(_e) {}
    }
    notifyCoordStatus();
  }
}

setInterval(checkDegradedMode, 5000);

// ============================================================
// DASHBOARD COORDINATEUR — v3.2
// ============================================================

// ── v3.7.0 Historique connexions ────────────────────────────────
ipcMain.handle('get-user-sessions', (_, userId) => {
  try {
    const rows = db.prepare('SELECT * FROM user_sessions WHERE user_id=? ORDER BY id DESC LIMIT 10').all(userId);
    return { success: true, data: rows };
  } catch(e) { return { success: false, data: [] }; }
});

// ── v3.6.0 Fundo de caixa IPC ────────────────────────────────
ipcMain.handle('get-fundo-caixa', () => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='fundo_caixa_hoje'").get();
    const dateRow = db.prepare("SELECT value FROM settings WHERE key='fundo_caixa_date'").get();
    return { success: true, montant: Number(row?.value || 0), date: dateRow?.value || null };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('coord-dashboard', () => {
  try {
    const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
    const localMachine = { machine_id: MACHINE_ID, machine_label: labelRow?.value || 'Esta máquina', isLocal: true, isCoordinator: _isCoordinator, status: 'online' };
    const peers = db.prepare('SELECT * FROM network_peers ORDER BY last_seen DESC').all().map(p => ({
      ...p, isLocal: false, isCoordinator: p.machine_id === _coordinatorId, status: peersMap.has(p.machine_id) ? 'online' : 'offline',
    }));
    const printQueue = db.prepare("SELECT job_id,print_type,status,priority,machine_source,created_at,done_at,error FROM print_queue ORDER BY id DESC LIMIT 20").all();
    const reservations = (() => { try { return db.prepare("SELECT r.*,p.nom as product_nom FROM stock_reservations r LEFT JOIN products p ON r.product_id=p.id WHERE r.status='active' AND r.expires_at > datetime('now','utc') ORDER BY r.created_at DESC").all(); } catch(e) { return []; } })();
    const coordLog = (() => { try { return db.prepare("SELECT * FROM coordinator_log ORDER BY id DESC LIMIT 10").all(); } catch(e) { return []; } })();
    const stockAlerte = (() => { try { return db.prepare(`
      SELECT p.id,p.nom,p.stock_cartons,COALESCE(p.unites,1) as unites,
        COALESCE((SELECT SUM(r.qty_reserved) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='active' AND r.expires_at>datetime('now','utc')),0) as qty_reserved
      FROM products p WHERE p.actif=1 AND p.stock_cartons<=COALESCE(p.stock_alerte,2) ORDER BY p.stock_cartons ASC LIMIT 20
    `).all(); } catch(e) { return []; } })();
    const peersFiltered = peers.filter(p => p.machine_id !== MACHINE_ID); // éviter doublon avec localMachine
    return { success: true, isCoordinator: _isCoordinator, coordinatorId: _coordinatorId, coordinatorLabel: _coordinatorLabel, degradedMode: _degradedMode, machines: [localMachine, ...peersFiltered], printQueue, reservations, coordLog, stockAlerte };
  } catch(e) { console.error('[COORD] coord-dashboard:', e.message); return { success: false, error: e.message }; }
});

// ── v3.9.0 Actions rapides coordinateur ─────────────────────────────
ipcMain.handle('coord-force-sync', () => {
  try {
    triggerInstantSync();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('coord-rescan', () => {
  try {
    sendDiscoveryBroadcast();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('coord-clear-queue', () => {
  try {
    db.prepare("DELETE FROM print_queue WHERE status IN ('done','failed')").run();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── v4.0.0 Métriques système + graphiques ───────────────────
ipcMain.handle('coord-metrics', () => {
  try {
    // CPU
    const cpus = os.cpus();
    let cpuUsage = 0;
    if (cpus && cpus.length > 0) {
      const cpu = cpus[0];
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      cpuUsage = Math.round(((total - cpu.times.idle) / total) * 100);
    }
    // RAM
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const ramPct   = Math.round((usedMem / totalMem) * 100);

    // Ventes 7 derniers jours (date_vente = champ réel de la table ventes)
    const ventes7j = (() => { try {
      return db.prepare(`
        SELECT date(date_vente,'localtime') as jour,
               COUNT(*) as nb_ventes,
               COALESCE(SUM(total),0) as total_aoa
        FROM ventes
        WHERE statut != 'annule'
          AND date_vente >= datetime('now','-7 days')
        GROUP BY jour ORDER BY jour ASC
      `).all();
    } catch(e) { return []; } })();

    // Activité sync 7 derniers jours
    const sync7j = (() => { try {
      return db.prepare(`
        SELECT date(created_at,'localtime') as jour,
               COUNT(*) as nb_ops
        FROM sync_log
        WHERE created_at >= datetime('now','-7 days')
        GROUP BY jour ORDER BY jour ASC
      `).all();
    } catch(e) { return []; } })();

    // Top 5 produits vendus (7j)
    const topProduits = (() => { try {
      return db.prepare(`
        SELECT p.nom, COALESCE(SUM(vi.quantite),0) as qte
        FROM vente_items vi
        JOIN products p ON vi.product_id=p.id
        JOIN ventes v ON vi.vente_id=v.id
        WHERE v.statut != 'annule'
          AND v.date_vente >= datetime('now','-7 days')
        GROUP BY vi.product_id ORDER BY qte DESC LIMIT 5
      `).all();
    } catch(e) { return []; } })();

    // Uptime
    const uptimeSec = os.uptime();

    return { success: true, cpu: cpuUsage, ram: { pct: ramPct, used: usedMem, total: totalMem }, uptime: uptimeSec, ventes7j, sync7j, topProduits };
  } catch(e) { return { success: false, error: e.message }; }
});

app.on('before-quit', () => {
  clearInterval(_coordCheckTimer);
  clearInterval(_coordAnnounceTimer);
  stopPrintQueueWorker();
});

// ── Handler WS : recevoir une demande d'impression ──────────
async function handlePrintRequest(ws, msg) {
  const { machine_id: sourceMachineId, print_type, data, request_id } = msg;
  console.log('[PRINT] PRINT_REQUEST recu de ' + sourceMachineId + ' — type: ' + print_type);
  let result = { success: false, error: 'Type inconnu' };
  try {
    if (print_type === 'ticket') {
      let qrDataUrl = '';
      if (QRCode && data) {
        try {
          const qrText = [data.numeroFacture||'N/A', `${data.total} ${data.currency}`, data.date, data.seller].join('|');
          qrDataUrl = await QRCode.toDataURL(qrText, { width:128, margin:2, errorCorrectionLevel:'L', color:{dark:'#000000',light:'#ffffff'} });
        } catch(_e) {}
      }
      const { copiesTicket, ticketSizeMm } = getPrintSettings();
      const copies = data?.copies || copiesTicket || 2;
      const flags = getTicketFlags();
      result = await printHTML(generateTicketHTML({ ...(data||{}), qrDataUrl, flags, ticketSizeMm }), copies, true);
    } else if (print_type === 'factura-fiscal') {
      const shopRows = db.prepare("SELECT key,value FROM settings WHERE key IN ('shop_name','shop_address','shop_phone','shop_nif')").all();
      const shop = {}; shopRows.forEach(r => { shop[r.key] = r.value; });
      const cfg = db.prepare("SELECT * FROM fiscal_config WHERE id=1").get() || {};
      let qrDataUrl = '';
      if (QRCode && data) {
        try {
          const qrText = [data.numeroFacture||'N/A', `${data.total} ${data.currency}`, data.date, data.seller].join('|');
          qrDataUrl = await QRCode.toDataURL(qrText, { width:128, margin:2, errorCorrectionLevel:'L', color:{dark:'#000000',light:'#ffffff'} });
        } catch(_e) {}
      }
      const { copiesTicket, ticketSizeMm } = getPrintSettings();
      const copies = data?.copies || copiesTicket || 2;
      const flags = getTicketFlags();
      const enriched = {
        ...(data||{}),
        shopName:    data?.shopName    || shop.shop_name    || '',
        shopAddress: data?.shopAddress || shop.shop_address || '',
        shopPhone:   data?.shopPhone   || shop.shop_phone   || '',
        shopNif:     data?.shopNif     || shop.shop_nif     || '',
        regimeIva:   data?.regimeIva   || cfg.regime_iva    || 'geral',
        taxaIva:     data?.taxaIva     ?? cfg.taxa_iva      ?? 14,
        qrDataUrl, flags, ticketSizeMm,
      };
      result = await printHTML(generateFacturaFiscalTicketHTML(enriched), copies, true);
    } else if (print_type === 'shift') {
      const { copiesShift, ticketSizeMm } = getPrintSettings();
      const copies = data?.copies || copiesShift || 1;
      await printHTML(generateShiftHTML({ ...(data||{}), ticketSizeMm }), copies, true);
      result = { success: true };
    } else if (print_type === 'caderno') {
      const { ticketSizeMm } = getPrintSettings();
      await printHTML(generateCadernoTicketHTML({ ...(data||{}), ticketSizeMm }), 1, true);
      result = { success: true };
    }
  } catch(e) {
    result = { success: false, error: e.message };
    console.error('[PRINT] handlePrintRequest erreur:', e.message);
  }
  // Répondre à la machine source
  try {
    secureSend(ws, { type: 'PRINT_RESPONSE', machine_id: MACHINE_ID, request_id, success: result.success, error: result.error || null });
  } catch(_e) {}
}

// ── Handler WS : recevoir la réponse d'impression ───────────
const _printResponseCallbacks = new Map(); // request_id \u2192 { resolve, reject, timer }
function handlePrintResponse(msg) {
  const { request_id, success, error } = msg;
  const cb = _printResponseCallbacks.get(request_id);
  if (!cb) return;
  clearTimeout(cb.timer);
  _printResponseCallbacks.delete(request_id);
  if (success) cb.resolve({ success: true });
  else cb.reject(new Error(error || 'Impression distante echouée'));
}

// ── Envoyer un job d'impression à une machine distante ──────
function sendPrintRequest(targetMachineId, print_type, data) {
  return new Promise((resolve, reject) => {
    const peer = peersMap.get(targetMachineId);
    if (!peer || peer.ws?.readyState !== WebSocket.OPEN) {
      return reject(new Error('Machine cible hors ligne: ' + targetMachineId));
    }
    const request_id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      _printResponseCallbacks.delete(request_id);
      reject(new Error('Timeout impression distante (10s)'));
    }, 10000);
    _printResponseCallbacks.set(request_id, { resolve, reject, timer });
    peer.secureSend(ws, { type: 'PRINT_REQUEST', machine_id: MACHINE_ID, print_type, data, request_id });
    console.log('[PRINT] PRINT_REQUEST \u2192 ' + targetMachineId + ' (type: ' + print_type + ', req: ' + request_id + ')');
  });
}

// ── IPC : lister les machines avec statut imprimante ────────
ipcMain.handle('get-printer-machines', () => {
  try {
    const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
    const local = {
      machine_id:    MACHINE_ID,
      machine_label: labelRow?.value || 'Esta máquina',
      ip:            'LOCAL',
      isLocal:       true,
      status:        'online',
    };
    const peers = db.prepare('SELECT * FROM network_peers ORDER BY last_seen DESC').all()
      .map(p => ({ ...p, isLocal: false, status: peersMap.has(p.machine_id) ? 'online' : 'offline' }));
    return { success: true, data: [local, ...peers] };
  } catch(e) { return { success: false, error: e.message, data: [] }; }
});

// ── IPC : configurer le mode d'impression ───────────────────
ipcMain.handle('set-printer-mode', (_, { mode, targetMachineId }) => {
  try {
    const m = mode === 'shared' ? 'shared' : 'local';
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('printer_mode',?)").run(m);
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('printer_machine_id',?)").run(targetMachineId || '');
    console.log('[PRINT] Mode impression: ' + m + (targetMachineId ? ' \u2192 ' + targetMachineId : ''));
    // Notifier le renderer pour mettre à jour le titlebar
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('printer-mode-changed', { mode: m, targetMachineId: targetMachineId || '' }); } catch(_e) {}
    }
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── IPC : obtenir le mode d'impression actuel ───────────────
ipcMain.handle('get-printer-mode', () => {
  try {
    const mode = db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
    const targetId = db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
    let targetLabel = '';
    if (targetId) {
      const peer = db.prepare('SELECT machine_label FROM network_peers WHERE machine_id=?').get(targetId);
      targetLabel = peer?.machine_label || targetId.slice(0,8);
    }
    return { success: true, mode, targetMachineId: targetId, targetLabel };
  } catch(e) { return { success: false, mode: 'local', targetMachineId: '', targetLabel: '' }; }
});

// ============================================================
// SUPABASE CLOUD BRIDGE — v1.7.0
// Sync bidirectionnel cloud via Supabase (REST + Realtime)
// Config : settings \u2192 supabase_url + supabase_key
// Table Supabase requise : cloud_sync_log (voir SQL ci-dessous)
// ============================================================

let _supabase     = null; // client Supabase actif
let _supaChannel  = null; // canal Realtime
let _cloudStatus  = { status: 'disconnected', lastSync: null, error: null };
let _cloudPushBusy = false;
let _cloudPullBusy = false;

// ── Envoi du statut cloud au renderer ──────────────────────
function sendCloudStatus(patch) {
  _cloudStatus = { ..._cloudStatus, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('cloud-sync-status', _cloudStatus); } catch(_e) {}
  }
}

// ── Initialiser le client Supabase ─────────────────────────
function initSupabase() {
  try {
    const urlRow = db.prepare("SELECT value FROM settings WHERE key='supabase_url'").get();
    const keyRow = db.prepare("SELECT value FROM settings WHERE key='supabase_key'").get();
    const url = urlRow?.value?.trim();
    const key = keyRow?.value?.trim();

    if (!url || !key || url === '' || key === '') {
      sendCloudStatus({ status: 'not_configured', error: null });
      return null;
    }

    // Charger le module dynamiquement (asarUnpack requis)
    let createClient;
    try { ({ createClient } = require('@supabase/supabase-js')); }
    catch(_e) {
      console.error('[CLOUD] @supabase/supabase-js non installé — npm install @supabase/supabase-js');
      sendCloudStatus({ status: 'error', error: 'Module non installé' });
      return null;
    }

    // Node.js < 22 n'a pas de WebSocket natif — passer le package ws explicitement
    const wsLib = require('ws');
    // Electron v29+ : utiliser net.fetch (stack Chromium) au lieu du fetch Node.js
    // Le fetch natif Node.js échoue souvent (proxy, SSL, réseau différent du renderer)
    const { net } = require('electron');
    const electronFetch = net.fetch.bind(net);

    _supabase = createClient(url, key, {
      auth:     { persistSession: false, autoRefreshToken: false },
      realtime: {
        params:    { eventsPerSecond: 2 },
        transport: wsLib,
      },
      global: {
        WebSocket: wsLib,
        fetch:     electronFetch, // Stack Chromium — proxy + SSL corrects
      },
    });

    console.log('[CLOUD] Client Supabase initialisé');
    sendCloudStatus({ status: 'connecting', error: null });
    return _supabase;
  } catch(e) {
    console.error('[CLOUD] initSupabase:', e.message);
    sendCloudStatus({ status: 'error', error: e.message });
    return null;
  }
}

// ── Tester la connexion Supabase ───────────────────────────
async function testSupabaseConnection() {
  if (!_supabase) { initSupabase(); }
  if (!_supabase) return false;
  try {
    const { error } = await _supabase.from('cloud_sync_log').select('id').limit(1);
    if (error) throw error;
    sendCloudStatus({ status: 'connected', error: null });
    console.log('[CLOUD] Connexion Supabase OK');
    return true;
  } catch(e) {
    console.error('[CLOUD] test connexion:', e.message);
    sendCloudStatus({ status: 'error', error: e.message });
    return false;
  }
}

// ── Pousser les nouvelles entrées sync_log vers Supabase ───
async function pushToCloud() {
  if (!_supabase || _cloudPushBusy) return;
  _cloudPushBusy = true;
  try {
    // Récupérer les entrées non encore poussées vers le cloud
    const pending = db.prepare(
      "SELECT * FROM sync_log WHERE machine_id=? AND (synced_to NOT LIKE '%\"cloud\"%' OR synced_to='[]') ORDER BY id LIMIT 100"
    ).all(MACHINE_ID);

    if (pending.length === 0) { _cloudPushBusy = false; return; }

    sendCloudStatus({ status: 'syncing' });

    // Enrichir avec les données de ligne actuelles
    const rows = pending.map(e => {
      if (!SYNC_TABLES.has(e.table_name)) return null;
      let row_data = null;
      if (e.operation !== 'DELETE') {
        try {
          if (e.table_name === 'settings') {
            row_data = db.prepare('SELECT key, value, rowid FROM settings WHERE rowid=?').get(e.record_id) || null;
          } else {
            row_data = db.prepare('SELECT * FROM "' + e.table_name + '" WHERE id=?').get(e.record_id) || null;
          }
        } catch(_e) {}
      }
      return {
        source_machine_id: MACHINE_ID,
        source_seq:        e.id,
        table_name:        e.table_name,
        record_id:         e.record_id,
        operation:         row_data ? e.operation : 'DELETE',
        row_data:          row_data,
        created_at:        e.created_at,
      };
    }).filter(Boolean);

    if (rows.length === 0) { _cloudPushBusy = false; return; }

    const { error } = await _supabase.from('cloud_sync_log').insert(rows);
    if (error) throw error;

    // Marquer comme poussé vers le cloud
    const ids = pending.map(e => e.id);
    const upd = db.prepare('UPDATE sync_log SET synced_to=? WHERE id=?');
    for (const e of pending) {
      const arr = JSON.parse(e.synced_to || '[]');
      if (!arr.includes('cloud')) { arr.push('cloud'); upd.run(JSON.stringify(arr), e.id); }
    }

    _cloudStatus.lastSync = new Date().toISOString();
    sendCloudStatus({ status: 'synced', error: null, lastSync: _cloudStatus.lastSync });
    console.log('[CLOUD] Push: ' + rows.length + ' entrees envoyees');
  } catch(e) {
    console.error('[CLOUD] pushToCloud:', e.message);
    sendCloudStatus({ status: 'error', error: e.message });
  }
  _cloudPushBusy = false;
}

// ── Appliquer une ligne reçue du cloud ─────────────────────
function applyCloudRow(entry) {
  try {
    if (!SYNC_TABLES.has(entry.table_name)) return;
    db.prepare("UPDATE settings SET value='1' WHERE key='sync_applying'").run();
    try {
      if (entry.operation === 'DELETE') {
        db.prepare('DELETE FROM "' + entry.table_name + '" WHERE id=?').run(entry.record_id);
      } else if (entry.row_data && typeof entry.row_data === 'object') {
        // ── Cas spécial : table settings ──
        if (entry.table_name === 'settings') {
          const LOCAL_KEYS = new Set(['machine_id','machine_label','network_key','supabase_url','supabase_key','cloud_last_seq','sync_applying','printer_mode','printer_machine_id','coordinator_id','coordinator_label','setup_done','remember_session','fundo_caixa_hoje','fundo_caixa_date']);
          if (LOCAL_KEYS.has(entry.row_data.key)) return;
          db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(entry.row_data.key, entry.row_data.value);
        } else if (entry.table_name === 'users') {
          const row = entry.row_data;
          const existing = db.prepare('SELECT id FROM users WHERE email=?').get(row.email);
          if (existing) {
            const skip = new Set(['id','created_at']);
            const sets = Object.keys(row).filter(k=>!skip.has(k)).map(k=>'"'+k+'"=?').join(',');
            const vals = Object.keys(row).filter(k=>!skip.has(k)).map(k=>row[k]);
            db.prepare('UPDATE users SET '+sets+' WHERE email=?').run(...vals, row.email);
          } else {
            const skip = new Set(['id']);
            const cols = Object.keys(row).filter(k=>!skip.has(k)).map(c=>'"'+c+'"').join(',');
            const phs  = Object.keys(row).filter(k=>!skip.has(k)).map(()=>'?').join(',');
            const vals = Object.keys(row).filter(k=>!skip.has(k)).map(k=>row[k]);
            try { db.prepare('INSERT INTO users ('+cols+') VALUES ('+phs+')').run(...vals); } catch(_eu) {}
          }
        } else if (entry.table_name === 'ventes' && entry.row_data.uuid) {
          // v4.9.5 — ventes : déduplication par uuid (ne pas écraser par id distant)
          const row = entry.row_data;
          const existing = db.prepare('SELECT id FROM ventes WHERE uuid=?').get(row.uuid);
          if (existing) {
            const skip = new Set(['id','uuid']);
            const sets = Object.keys(row).filter(k=>!skip.has(k)).map(k=>'"'+k+'"=?').join(',');
            const vals = Object.keys(row).filter(k=>!skip.has(k)).map(k=>row[k]);
            if (sets) db.prepare('UPDATE ventes SET '+sets+' WHERE uuid=?').run(...vals, row.uuid);
          } else {
            const skip = new Set(['id']);
            const cols = Object.keys(row).filter(k=>!skip.has(k)).map(c=>'"'+c+'"').join(',');
            const phs  = Object.keys(row).filter(k=>!skip.has(k)).map(()=>'?').join(',');
            const vals = Object.keys(row).filter(k=>!skip.has(k)).map(k=>row[k]);
            try { db.prepare('INSERT INTO ventes ('+cols+') VALUES ('+phs+')').run(...vals); } catch(_ev) {}
          }
        } else {
          const cols = Object.keys(entry.row_data).map(c => '"' + c + '"').join(',');
          const phs  = Object.keys(entry.row_data).map(() => '?').join(',');
          db.prepare('INSERT OR REPLACE INTO "' + entry.table_name + '" (' + cols + ') VALUES (' + phs + ')').run(...Object.values(entry.row_data));
        }
      }
    } finally {
      db.prepare("UPDATE settings SET value='0' WHERE key='sync_applying'").run();
    }
  } catch(e) { console.error('[CLOUD] applyCloudRow:', e.message); }
}

// ── Abonnement Realtime Supabase ───────────────────────────
function subscribeRealtime() {
  if (!_supabase || _supaChannel) return;
  try {
    _supaChannel = _supabase
      .channel('cloud_sync_log_changes')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cloud_sync_log' },
        (payload) => {
          const entry = payload.new;
          if (!entry || entry.source_machine_id === MACHINE_ID) return; // ignorer nos propres entrées
          console.log('[CLOUD] Realtime: ' + entry.operation + ' sur ' + entry.table_name + ' #' + entry.record_id);
          applyCloudRow(entry);
          if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('cloud-data-changed', { table: entry.table_name }); } catch(_e) {}
          }
        }
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          console.log('[CLOUD] Realtime souscription active');
          sendCloudStatus({ status: 'connected' });
        } else if (s === 'CLOSED' || s === 'CHANNEL_ERROR') {
          // CHANNEL_ERROR = table pas dans la publication Realtime
          // Le REST API + polling 60s fonctionnent toujours \u2192 statut 'connected' maintenu
          console.warn('[CLOUD] Realtime ' + s + ' — sync via polling uniquement (60s)');
          _supaChannel = null;
          // Ne pas passer en 'error' — le push/pull REST fonctionne
          sendCloudStatus({ status: 'connected', realtimeOk: false });
        }
      });
  } catch(e) {
    console.error('[CLOUD] subscribeRealtime:', e.message);
  }
}

// ── Pull initial : récupérer les changements manqués ──────
async function pullFromCloud() {
  if (!_supabase || _cloudPullBusy) return;
  _cloudPullBusy = true;
  try {
    // Récupérer le dernier seq cloud qu'on a traité
    const seqRow = db.prepare("SELECT value FROM settings WHERE key='cloud_last_seq'").get();
    const lastSeq = parseInt(seqRow?.value || '0', 10);

    const { data, error } = await _supabase
      .from('cloud_sync_log')
      .select('*')
      .neq('source_machine_id', MACHINE_ID) // ignorer nos propres entrées
      .gt('id', lastSeq)
      .order('id', { ascending: true })
      .limit(200);

    if (error) throw error;
    if (!data || data.length === 0) return;

    let applied = 0;
    for (const entry of data) { applyCloudRow(entry); applied++; }

    // Sauvegarder le dernier seq traité
    const newSeq = data[data.length - 1].id;
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('cloud_last_seq',?)").run(String(newSeq));

    console.log('[CLOUD] Pull: ' + applied + ' entrees appliquees (dernier seq: ' + newSeq + ')');
    _cloudStatus.lastSync = new Date().toISOString();
    sendCloudStatus({ status: 'synced', lastSync: _cloudStatus.lastSync });
  } catch(e) {
    console.error('[CLOUD] pullFromCloud:', e.message);
  } finally {
    _cloudPullBusy = false;
  }
}

// ── Démarrage complet du bridge cloud ─────────────────────
async function startCloudBridge() {
  if (!initSupabase()) return;
  const ok = await testSupabaseConnection();
  if (!ok) return;
  await pullFromCloud();   // récupérer d'abord ce qu'on a manqué
  subscribeRealtime();     // puis souscrire aux nouveaux changements
  await pushToCloud();     // puis pousser nos changements locaux
}

// ── IPC Handlers cloud ─────────────────────────────────────
ipcMain.handle('cloud-connect', async () => {
  try { await startCloudBridge(); return { success: true, status: _cloudStatus }; }
  catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('cloud-status', () => ({ success: true, ..._cloudStatus }));

ipcMain.handle('cloud-push', async () => {
  try { await pushToCloud(); return { success: true }; }
  catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('cloud-pull', async () => {
  try { await pullFromCloud(); return { success: true }; }
  catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('cloud-disconnect', () => {
  try {
    if (_supaChannel) { _supabase?.removeChannel(_supaChannel); _supaChannel = null; }
    _supabase = null;
    sendCloudStatus({ status: 'disconnected', error: null });
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── Démarrage auto si credentials déjà configurés ─────────
app.whenReady().then(() => {
  setTimeout(async () => {
    const urlRow = db.prepare("SELECT value FROM settings WHERE key='supabase_url'").get();
    if (urlRow?.value?.trim()) {
      console.log('[CLOUD] Démarrage auto Supabase bridge');
      await startCloudBridge();
    }
    // v1.8.1 — Push + Pull cloud toutes les 10s (au lieu de 60s)
    setInterval(async () => {
      if (_supabase) {
        await pushToCloud();
        await pullFromCloud();
      }
    }, 10000);
  }, 3000); // délai après démarrage LAN
});

// Nettoyage Supabase à la fermeture
app.on('before-quit', () => {
  if (_supaChannel) { try { _supabase?.removeChannel(_supaChannel); } catch(_e) {} }
});

// ============================================================
// SETUP & ONBOARDING — v3.4
// Premier démarrage : wizard setup ou login normal
// ============================================================

const SNAPSHOT_TABLES = [
  'products','product_variants','stock_mouvements',
  'caderno_motivos','caderno_trabalhadores','caderno_produtos','caderno_entries',
  'users','clients','empresas','shifts',
  'settings',  // globaux seulement (filtre appliqué côté envoi)
  'ventes','vente_items',  // 30 derniers jours
];

const LOCAL_SETTINGS = new Set([
  'machine_id','machine_label','network_key','supabase_url','supabase_key',
  'cloud_last_seq','sync_applying','printer_mode','printer_machine_id',
  'coordinator_id','coordinator_label','setup_done','remember_session',
]);

// ── IPC : importer une DB existante (Setup wizard option 3) ─
ipcMain.handle('import-db-file', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecionar ficheiro de base de dados',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return { success: false, reason: 'canceled' };

    const srcPath = filePaths[0];
    const BetterSqlite = require('better-sqlite3');

    // Validar: verificar se é uma DB CKBPOS (tabela users existe)
    let testDb;
    try {
      testDb = new BetterSqlite(srcPath, { readonly: true });
      const hasUsers = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
      if (!hasUsers) { testDb.close(); return { success: false, reason: 'invalid_db' }; }
      const userCount = testDb.prepare("SELECT COUNT(*) as cnt FROM users").get()?.cnt || 0;
      if (userCount === 0) { testDb.close(); return { success: false, reason: 'empty_db' }; }
      testDb.close();
    } catch(e) {
      try { testDb?.close(); } catch(_) {}
      return { success: false, reason: 'corrupt_db', error: e.message };
    }

    // Copiar para o caminho da DB ativa
    const destPath = path.join(app.getPath('userData'), 'ckbpos.db');
    fs.copyFileSync(srcPath, destPath);

    // Marcar setup como feito (será lido no próximo arranque)
    // Reabrir DB e forçar setup_done
    const newDb = new BetterSqlite(destPath);
    newDb.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('setup_done','1')").run();
    newDb.close();

    return { success: true };
  } catch(e) {
    return { success: false, reason: 'error', error: e.message };
  }
});

// ── IPC : vérifier si setup déjà fait ───────────────────────
ipcMain.handle('check-setup', () => {
  try {
    const done   = db.prepare("SELECT value FROM settings WHERE key='setup_done'").get()?.value;
    const machId = db.prepare("SELECT value FROM settings WHERE key='machine_id'").get()?.value;
    const isSetup = done === '1' && !!machId;
    // Health check rapide
    const health = runHealthCheck();
    return { success: true, isSetup, health };
  } catch(e) { return { success: false, isSetup: false, health: { ok: false, error: e.message } }; }
});

// ── Health check ─────────────────────────────────────────────
function runHealthCheck() {
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const required = ['products','ventes','users','settings','sync_log'];
    const missing = required.filter(t => !tables.includes(t));
    if (missing.length) return { ok: false, missing };
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0;
    return { ok: true, tables: tables.length, userCount };
  } catch(e) { return { ok: false, error: e.message }; }
}

ipcMain.handle('health-check', () => ({ success: true, ...runHealthCheck() }));

// ── IPC : finaliser le setup (nova boutique) ────────────────
ipcMain.handle('setup-complete', (_, { shop, machine, admin, sync }) => {
  try {
    // Shop info
    if (shop.name)    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('shop_name',?)").run(shop.name);
    if (shop.address) db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('shop_address',?)").run(shop.address);
    if (shop.phone)   db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('shop_phone',?)").run(shop.phone);
    if (shop.currency)db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('currency',?)").run(shop.currency);
    if (shop.language)db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('language',?)").run(shop.language);
    if (shop.theme)   db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('theme',?)").run(shop.theme);

    // Machine identity
    const newMachineId = require('crypto').randomBytes(4).toString('hex').toUpperCase();
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('machine_id',?)").run(newMachineId);
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('machine_label',?)").run(machine.label || 'Caixa Principal');
    // Clé réseau : utiliser celle saisie par l'utilisateur, ou en générer une automatiquement
    {
      const nkToSave = machine.networkKey && machine.networkKey.trim()
        ? machine.networkKey.trim()
        : (() => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const bytes = require('crypto').randomBytes(8);
            let nk = 'CKB-';
            for (let i = 0; i < 4; i++) nk += chars[bytes[i] % chars.length];
            nk += '-';
            for (let i = 4; i < 8; i++) nk += chars[bytes[i] % chars.length];
            return nk;
          })();
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('network_key',?)").run(nkToSave);
      console.log('[SETUP] network_key:', nkToSave);
    }
    if (machine.ticketSize) {
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('ticket_size_mm',?)").run(machine.ticketSize);
      const microns = { 52: 1500000, 60: 1700000, 72: 2050000, 80: 2270000 }[parseInt(machine.ticketSize)] || 2050000;
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('ticket_width_microns',?)").run(microns);
    }

    // Sync optionnel
    if (sync?.supabaseUrl) db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('supabase_url',?)").run(sync.supabaseUrl);
    if (sync?.supabaseKey) db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('supabase_key',?)").run(sync.supabaseKey);

    // Créer admin
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(admin.password, 10);
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(admin.email);
    if (!existing) {
      db.prepare('INSERT INTO users (nom,email,password_hash,role,actif) VALUES (?,?,?,?,1)')
        .run(admin.name, admin.email, hash, 'admin');
    } else {
      db.prepare('UPDATE users SET nom=?,password_hash=?,role=? WHERE email=?')
        .run(admin.name, hash, 'admin', admin.email);
    }

    // Marquer setup comme terminé
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('setup_done','1')").run();
    console.log('[SETUP] Setup terminé — machine: ' + newMachineId);
    // Redémarrer services réseau avec nouvelle machine_id
    setTimeout(() => { try { restartNetworkServices(); } catch(_e) {} }, 500);
    return { success: true, machineId: newMachineId };
  } catch(e) { console.error('[SETUP] setup-complete:', e.message); return { success: false, error: e.message }; }
});

// ── IPC : scan LAN pour snapshot ────────────────────────────
ipcMain.handle('lan-scan-for-snapshot', async () => {
  try {
    // 1. Pairs déjà connus (DB + mémoire)
    const knownPeers = db.prepare('SELECT * FROM network_peers ORDER BY last_seen DESC').all()
      .map(p => ({ ...p, online: peersMap.has(p.machine_id) }));
    for (const [id, peer] of peersMap.entries()) {
      if (!knownPeers.find(p => p.machine_id === id)) {
        knownPeers.push({ machine_id: id, machine_label: peer.machine_label || id.slice(0,8), ip: peer.ip, online: true });
      }
    }

    // 2. Broadcast UDP actif — double écoute: port aléatoire + port UDP_PORT
    const discovered = await new Promise((resolve) => {
      const found = new Map();
      const dgram = require('dgram');
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        try { recvSock.close(); } catch(_e) {}
        try { recvSock2.close(); } catch(_e) {}
        if (udpSocket) try { udpSocket.removeListener('message', handleMsg); } catch(_e) {}
        resolve([...found.values()]);
      };
      const timer = setTimeout(finish, 4000);

      const handleMsg = (buf, rinfo) => {
        try {
          const msg = JSON.parse(buf.toString());
          // \u2705 Isolation produit — ignorer toute machine d'une autre app
          if (msg.product && msg.product !== PRODUCT_ID) return;
          if ((msg.type === 'CKBPOS_DISCOVERY' || msg.type === 'CKBPOS_DISCOVER_REPLY' || msg.type === 'CKBPOS_DISCOVER') 
              && msg.machine_id && msg.machine_id !== MACHINE_ID) {
            found.set(msg.machine_id, {
              machine_id: msg.machine_id,
              machine_label: msg.machine_label || msg.machine_id.slice(0,8),
              ip: rinfo.address, online: true,
            });
          }
        } catch(_e) {}
      };

      // Socket 1: port aléatoire pour recevoir les réponses unicast
      const recvSock = dgram.createSocket('udp4');
      recvSock.on('error', () => {});
      recvSock.on('message', handleMsg);

      // Socket 2: écouter aussi sur UDP_PORT pour les broadcasts de réponse
      const recvSock2 = dgram.createSocket({ type:'udp4', reuseAddr:true });
      recvSock2.on('error', () => {});
      recvSock2.on('message', handleMsg);

      // Socket 3: écouter sur udpSocket principal (réponses broadcast des pairs)
      if (udpSocket) udpSocket.on('message', handleMsg);

      recvSock.bind(0, () => {
        const recvPort = recvSock.address().port;

        // Tenter de binder sur le port alternatif aussi
        try {
          recvSock2.bind(UDP_ALT_PORT, () => {}); // port alternatif pour réponses
        } catch(_e) {}

        const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
        const nkRow = db.prepare("SELECT value FROM settings WHERE key='network_key'").get();
        const discover = Buffer.from(JSON.stringify({
          type: 'CKBPOS_DISCOVER',
          product: PRODUCT_ID,
          machine_id: MACHINE_ID,
          machine_label: labelRow?.value || 'CKBPOS',
          port: WS_PORT,
          reply_port: recvPort,  // \u2190 port où recevoir les réponses
          setup_mode: true,
          network_key: nkRow?.value || '',
        }));

        const sendSock = dgram.createSocket('udp4');
        sendSock.on('error', () => {});
        sendSock.bind(0, () => {
          sendSock.setBroadcast(true);
          // Envoyer plusieurs fois avec délai pour maximiser les chances
          const targets = ['255.255.255.255','10.55.173.255','10.55.255.255','192.168.1.255','192.168.0.255','192.168.43.255','192.168.137.255'];
          const doSend = () => targets.forEach(addr => {
            sendSock.send(discover, UDP_PORT, addr, () => {});
          });
          doSend();
          setTimeout(doSend, 1000); // Renvoyer après 1s
          setTimeout(doSend, 2000); // Et après 2s
          setTimeout(() => { try { sendSock.close(); } catch(_e) {} }, 2500);
        });
      });
    });

    // 3. Fusionner + persister IPs en DB
    const merged = [...knownPeers];
    for (const d of discovered) {
      if (!merged.find(p => p.machine_id === d.machine_id)) merged.push(d);
      try {
        db.prepare(`INSERT OR REPLACE INTO network_peers (machine_id, machine_label, ip, port, last_seen, actif) VALUES (?,?,?,?,datetime('now'),1)`)
          .run(d.machine_id, d.machine_label, d.ip, WS_PORT);
      } catch(_e) {}
    }

    console.log('[SETUP] lan-scan: known=' + knownPeers.length + ' discovered=' + discovered.length + ' total=' + merged.length);
    return { success: true, data: merged };
  } catch(e) { return { success: false, data: [], error: e.message }; }
});

// ── Code invitation (6 chiffres, TTL 5 min) ─────────────────
const _inviteCodes = new Map(); // code \u2192 { machine_id, expires }

ipcMain.handle('generate-invite-code', () => {
  try {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Date.now() + 5 * 60 * 1000;
    _inviteCodes.set(code, { machine_id: MACHINE_ID, expires });
    // Nettoyer les codes expirés
    for (const [k, v] of _inviteCodes.entries()) { if (v.expires < Date.now()) _inviteCodes.delete(k); }
    console.log('[SETUP] Code invitation généré: ' + code);
    return { success: true, code, expiresIn: 300 };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── IPC : envoyer snapshot complet à une machine qui demande ─
// Déclenché quand on reçoit WS SNAPSHOT_REQUEST
function handleSnapshotRequest(ws, msg) {
  const { invite_code, network_key } = msg;
  // Valider code invitation OU clé réseau
  const myKey = db.prepare("SELECT value FROM settings WHERE key='network_key'").get()?.value || '';
  const codeEntry = _inviteCodes.get(invite_code);
  const codeValid = codeEntry && codeEntry.expires > Date.now();
  const keyValid  = network_key && myKey && network_key === myKey;
  if (!codeValid && !keyValid) {
    try { secureSend(ws, { type: 'SNAPSHOT_DENIED', reason: 'invalid_auth' }); } catch(_e) {}
    console.warn('[SETUP] SNAPSHOT_REQUEST refusé — auth invalide');
    return;
  }
  if (codeEntry) _inviteCodes.delete(invite_code); // usage unique
  console.log('[SETUP] SNAPSHOT_REQUEST accepté — envoi en cours...');
  try {
    const snapshot = {};
    const cutoff30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0,10);
    for (const table of SNAPSHOT_TABLES) {
      try {
        if (table === 'settings') {
          snapshot[table] = db.prepare('SELECT key,value FROM settings').all()
            .filter(r => !LOCAL_SETTINGS.has(r.key));
        } else if (table === 'ventes') {
          snapshot[table] = db.prepare('SELECT * FROM ventes WHERE date_heure >= ?').all(cutoff30 + 'T00:00:00');
        } else if (table === 'vente_items') {
          snapshot[table] = db.prepare(
            'SELECT vi.* FROM vente_items vi INNER JOIN ventes v ON vi.vente_id=v.id WHERE v.date_heure >= ?'
          ).all(cutoff30 + 'T00:00:00');
        } else {
          snapshot[table] = db.prepare('SELECT * FROM "' + table + '"').all();
        }
      } catch(_e) { snapshot[table] = []; }
    }
    // Envoyer en chunks de 500KB pour éviter les gros messages WS
    // Inclure la network_key explicitement (exclue de LOCAL_SETTINGS, transmise séparément)
    const json = JSON.stringify({ type: 'SNAPSHOT_DATA', snapshot, network_key: getNetworkKey() });
    const CHUNK = 480 * 1024;
    if (json.length <= CHUNK) {
      secureSend(ws, JSON.parse(json));
    } else {
      const total = Math.ceil(json.length / CHUNK);
      for (let i = 0; i < total; i++) {
        secureSend(ws, {
          type: 'SNAPSHOT_CHUNK',
          index: i, total,
          data: json.slice(i * CHUNK, (i + 1) * CHUNK),
        });
      }
    }
    console.log('[SETUP] Snapshot envoyé — ' + Object.values(snapshot).reduce((s,a) => s + a.length, 0) + ' enregistrements');
  } catch(e) { console.error('[SETUP] handleSnapshotRequest:', e.message); }
}

// ── Appliquer snapshot reçu ──────────────────────────────────
let _snapshotChunks = [];
let _snapshotTotal  = 0;

function handleSnapshotData(data) {
  try {
    applySnapshot(data.snapshot, data.network_key);
  } catch(e) { console.error('[SETUP] handleSnapshotData:', e.message); }
}

function handleSnapshotChunk(msg) {
  _snapshotChunks[msg.index] = msg.data;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('snapshot-progress', { received: _snapshotChunks.filter(Boolean).length, total: msg.total }); } catch(_e) {}
  }
  if (_snapshotChunks.filter(Boolean).length === msg.total) {
    try {
      const full = JSON.parse(_snapshotChunks.join(''));
      _snapshotChunks = [];
      applySnapshot(full.snapshot, full.network_key);
    } catch(e) { console.error('[SETUP] handleSnapshotChunk assemble:', e.message); }
  }
}

function applySnapshot(snapshot, receivedNetworkKey) {
  console.log('[SETUP] Application snapshot...');
  // Cache PRAGMA pour tolérance aux différences de schéma entre machines
  const _snapColCache = new Map();
  const snapKnownCols = (tbl) => {
    if (!_snapColCache.has(tbl)) {
      try { _snapColCache.set(tbl, new Set(db.prepare('PRAGMA table_info("'+tbl+'")').all().map(c=>c.name))); }
      catch(_) { _snapColCache.set(tbl, new Set()); }
    }
    return _snapColCache.get(tbl);
  };
  db.transaction(() => {
    db.prepare("UPDATE settings SET value='1' WHERE key='sync_applying'").run();
    try {
      for (const [table, rows] of Object.entries(snapshot)) {
        if (!rows?.length) continue;
        if (table === 'settings') {
          for (const r of rows) {
            if (!LOCAL_SETTINGS.has(r.key)) {
              db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(r.key, r.value);
            }
          }
        } else {
          let snapOk = 0, snapSkip = 0;
          for (const row of rows) {
            try {
              // Filtrer les colonnes inconnues (tolérance schéma)
              const known = snapKnownCols(table);
              const rowKeys = Object.keys(row).filter(k => known.has(k));
              if (rowKeys.length === 0) { snapSkip++; continue; }
              // v4.9.5 — ventes : déduplication par uuid (ne pas forcer l'id distant)
              if (table === 'ventes' && row.uuid) {
                const existing = db.prepare('SELECT id FROM ventes WHERE uuid=?').get(row.uuid);
                if (existing) { snapSkip++; continue; } // déjà présente localement
                const skip = new Set(['id']);
                const cols = rowKeys.filter(k=>!skip.has(k)).map(c=>'"'+c+'"').join(',');
                const phs  = rowKeys.filter(k=>!skip.has(k)).map(()=>'?').join(',');
                const vals = rowKeys.filter(k=>!skip.has(k)).map(k=>row[k]);
                try { db.prepare('INSERT INTO ventes ('+cols+') VALUES ('+phs+')').run(...vals); snapOk++; }
                catch(_ev) { snapSkip++; }
              } else {
                const cols = rowKeys.map(c => '"' + c + '"').join(',');
                const phs  = rowKeys.map(() => '?').join(',');
                const vals = rowKeys.map(k => row[k]);
                db.prepare('INSERT OR IGNORE INTO "' + table + '" (' + cols + ') VALUES (' + phs + ')').run(...vals);
                snapOk++;
              }
            } catch(_e) { snapSkip++; }
          }
          console.log('[SETUP] ' + table + ': ' + snapOk + ' ok, ' + snapSkip + ' skip / ' + rows.length + ' total');
        }
      }
    } finally {
      db.prepare("UPDATE settings SET value='0' WHERE key='sync_applying'").run();
    }
  })();
  console.log('[SETUP] Snapshot appliqué');
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('setup_done','1')").run();
  // Synchroniser la network_key de la machine émettrice
  if (receivedNetworkKey && receivedNetworkKey.trim()) {
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('network_key',?)").run(receivedNetworkKey.trim());
    console.log('[SETUP] network_key synchronisée depuis snapshot:', receivedNetworkKey.trim());
    // Re-annoncer la présence avec la nouvelle clé (getNetworkKey() lit depuis DB)
    setImmediate(() => {
      sendDiscoveryBroadcast();
      console.log('[SETUP] Présence re-annoncée avec la nouvelle clé réseau');
    });
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('snapshot-done', { success: true }); } catch(_e) {}
  }
}

// ── IPC : demander snapshot à une machine ───────────────────
ipcMain.handle('request-snapshot', async (_, { machine_id, invite_code, network_key }) => {
  try {
    let peer = peersMap.get(machine_id);

    // Si la machine n'est pas dans peersMap, tenter connexion directe via IP connue
    if (!peer || peer.ws?.readyState !== WebSocket.OPEN) {
      const info = db.prepare('SELECT ip, port FROM network_peers WHERE machine_id=?').get(machine_id);
      if (info?.ip) {
        console.log('[SETUP] Machine hors peersMap — tentative connexion directe: ' + info.ip);
        connectToPeer(info.ip, info.port || WS_PORT);
        // Attendre jusqu'à 4 secondes que la connexion s'établisse
        await new Promise(resolve => {
          let tries = 0;
          const check = setInterval(() => {
            peer = peersMap.get(machine_id);
            if ((peer && peer.ws?.readyState === WebSocket.OPEN) || ++tries >= 8) {
              clearInterval(check); resolve();
            }
          }, 500);
        });
        peer = peersMap.get(machine_id);
      }
    }

    if (!peer || peer.ws?.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'Machine hors ligne — vérifiez que CKBPOS est ouvert sur la machine source' };
    }

    _snapshotChunks = [];
    peer.secureSend(ws, { type: 'SNAPSHOT_REQUEST', invite_code: invite_code || '', network_key: network_key || '' });
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ── IPC : remember session ───────────────────────────────────
ipcMain.handle('set-remember-session', (_, { remember }) => {
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('remember_session',?)").run(remember ? '1' : '0');
  return { success: true };
});
ipcMain.handle('get-remember-session', () => {
  const v = db.prepare("SELECT value FROM settings WHERE key='remember_session'").get()?.value;
  return { success: true, remember: v === '1' };
});

// ============================================================
// MESSAGERIE INTERNE — v4.1.0
// Chat temps réel via WebSocket LAN existant
// Table : messages (id, from_machine, from_label, to_machine, content, ts, read_at)
// ============================================================

// Migration table messages
try {
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_machine TEXT NOT NULL,
    from_label TEXT NOT NULL,
    from_user_nom TEXT,
    to_machine TEXT DEFAULT 'all',
    content TEXT NOT NULL,
    msg_type TEXT DEFAULT 'text',
    audio_data TEXT,
    ts TEXT DEFAULT (datetime('now','utc')),
    read_at TEXT
  )`);
  // Migrations messages table
  try { db.exec("ALTER TABLE messages ADD COLUMN from_user_nom TEXT"); } catch(_e) {}
  try { db.exec("ALTER TABLE messages ADD COLUMN msg_type TEXT DEFAULT 'text'"); } catch(_e) {}
  try { db.exec("ALTER TABLE messages ADD COLUMN audio_data TEXT"); } catch(_e) {}
  try { db.exec("ALTER TABLE messages ADD COLUMN client_id TEXT"); } catch(_e) {}
  // Migration users photo
  try { db.exec("ALTER TABLE users ADD COLUMN photo_base64 TEXT"); } catch(_e) {}
} catch(_e) {}

ipcMain.handle('chat-send', (_, { to, content, userNom, msgType, audioData }) => {
  try {
    const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
    const fromLabel = labelRow?.value || 'CKBPOS';
    const ts = new Date().toISOString().replace('T',' ').slice(0,19);
    const type = msgType || 'text';
    const msgContent = content || (type === 'audio' ? '[Message vocal]' : '');
    const clientId = require('crypto').randomUUID();
    // Persister localement
    db.prepare('INSERT INTO messages (from_machine, from_label, from_user_nom, to_machine, content, msg_type, audio_data, ts, client_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(MACHINE_ID, fromLabel, userNom || null, to || 'all', msgContent, type, audioData || null, ts, clientId);
    // Diffuser via WS
    const wsMsg = encryptPayload({ type: 'CHAT_MESSAGE', from: MACHINE_ID, fromLabel, fromUserNom: userNom || null, to: to || 'all', content: msgContent, msgType: type, audioData: audioData || null, ts, clientId });
    if (to === 'all' || !to) {
      for (const peer of peersMap.values()) {
        if (peer.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(wsMsg); } catch(_e) {}
      }
    } else {
      const peer = peersMap.get(to);
      if (peer?.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(wsMsg); } catch(_e) {}
    }
    return { success: true, clientId };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('chat-history', (_, { to, limit }) => {
  try {
    const lim = limit || 100;
    let rows;
    if (!to || to === 'all') {
      rows = db.prepare("SELECT * FROM messages WHERE to_machine='all' ORDER BY id DESC LIMIT ?").all(lim);
    } else {
      rows = db.prepare(
        "SELECT * FROM messages WHERE (from_machine=? AND to_machine=?) OR (from_machine=? AND to_machine=?) OR to_machine='all' ORDER BY id DESC LIMIT ?"
      ).all(MACHINE_ID, to, to, MACHINE_ID, lim);
    }
    return { success: true, data: rows.reverse() };
  } catch(e) { return { success: false, data: [] }; }
});

ipcMain.handle('chat-mark-read', (_, { ids }) => {
  try {
    const upd = db.prepare("UPDATE messages SET read_at=datetime('now','utc') WHERE id=? AND read_at IS NULL");
    for (const id of (ids || [])) upd.run(id);
    return { success: true };
  } catch(e) { return { success: false }; }
});

ipcMain.handle('chat-unread-count', () => {
  try {
    const c = db.prepare("SELECT COUNT(*) as c FROM messages WHERE from_machine!=? AND read_at IS NULL").get(MACHINE_ID)?.c || 0;
    return { success: true, count: c };
  } catch(e) { return { success: false, count: 0 }; }
});

// ── v4.10.0 — Suppression message / conversation ────────────────
ipcMain.handle('chat-delete-message', (_, { client_id, scope }) => {
  try {
    if (!client_id) return { success: false, error: 'client_id manquant' };
    const row = db.prepare('SELECT * FROM messages WHERE client_id=?').get(client_id);
    if (!row) return { success: false, error: 'not_found' };
    db.prepare('DELETE FROM messages WHERE client_id=?').run(client_id);
    if (scope === 'all' && row.from_machine === MACHINE_ID) {
      const wsMsg = encryptPayload({ type: 'CHAT_DELETE', clientId: client_id });
      if (row.to_machine === 'all' || !row.to_machine) {
        for (const peer of peersMap.values()) {
          if (peer.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(wsMsg); } catch(_e) {}
        }
      } else {
        const peer = peersMap.get(row.to_machine);
        if (peer?.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(wsMsg); } catch(_e) {}
      }
    }
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('chat-edit-message', (_, { client_id, content }) => {
  try {
    if (!client_id) return { success: false, error: 'client_id manquant' };
    const row = db.prepare('SELECT * FROM messages WHERE client_id=?').get(client_id);
    if (!row) return { success: false, error: 'not_found' };
    if (row.from_machine !== MACHINE_ID) return { success: false, error: 'not_owner' };
    const ts = new Date().toISOString().replace('T',' ').slice(0,19);
    db.prepare('UPDATE messages SET content=?, ts=? WHERE client_id=?').run(content || '', ts, client_id);
    const wsMsg = encryptPayload({ type: 'CHAT_EDIT', clientId: client_id, content: content || '', ts, from: MACHINE_ID });
    if (row.to_machine === 'all' || !row.to_machine) {
      for (const peer of peersMap.values()) {
        if (peer.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(wsMsg); } catch(_e) {}
      }
    } else {
      const peer = peersMap.get(row.to_machine);
      if (peer?.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(wsMsg); } catch(_e) {}
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('chat-message', { from: MACHINE_ID, to: row.to_machine || 'all', content, clientId: client_id, ts }); } catch(_e) {}
    }
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('chat-delete-conversation', (_, { peerId, scope }) => {
  try {
    if (!peerId) return { success: false, error: 'peerId manquant' };
    if (peerId === 'all') {
      db.prepare("DELETE FROM messages WHERE to_machine='all'").run();
      return { success: true };
    }
    db.prepare('DELETE FROM messages WHERE (from_machine=? AND to_machine=?) OR (from_machine=? AND to_machine=?)')
      .run(peerId, MACHINE_ID, MACHINE_ID, peerId);
    if (scope === 'all') {
      const peer = peersMap.get(peerId);
      if (peer?.ws?.readyState === WebSocket.OPEN) {
        try { peer.secureSend(ws, { type: 'CHAT_DELETE_CONV', from: MACHINE_ID }); } catch(_e) {}
      }
    }
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// Réception messages chat via WS — injecté dans handleSyncMessage
function handleChatMessage(msg) {
  try {
    const { from, fromLabel, fromUserNom, to, content, msgType, audioData, ts, clientId } = msg;
    if (!from || (!content && !audioData)) return;
    const msgContent = content || '[Message vocal]';
    const type = msgType || 'text';
    db.prepare('INSERT OR IGNORE INTO messages (from_machine, from_label, from_user_nom, to_machine, content, msg_type, audio_data, ts, client_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(from, fromLabel || from.slice(0,8), fromUserNom || null, to || 'all', msgContent, type, audioData || null, ts || new Date().toISOString().replace('T',' ').slice(0,19), clientId || null);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('chat-message', { from, fromLabel, fromUserNom, to, content: msgContent, msgType: type, audioData: audioData || null, ts, clientId }); } catch(_e) {}
    }
  } catch(e) { console.error('[CHAT]', e.message); }
}

// Réception suppression message/conversation distante (v4.10.0)
function handleChatDelete(msg) {
  try {
    if (msg.clientId) db.prepare('DELETE FROM messages WHERE client_id=?').run(msg.clientId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('chat-deleted', { clientId: msg.clientId }); } catch(_e) {}
    }
  } catch(e) { console.error('[CHAT] delete:', e.message); }
}

function handleChatEdit(msg) {
  try {
    if (!msg.clientId || !msg.content) return;
    db.prepare('UPDATE messages SET content=?, ts=? WHERE client_id=?')
      .run(msg.content, msg.ts || new Date().toISOString().replace('T',' ').slice(0,19), msg.clientId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('chat-message', { from: msg.from, to: msg.to || 'all', content: msg.content, clientId: msg.clientId, ts: msg.ts }); } catch(_e) {}
    }
  } catch(e) { console.error('[CHAT] edit:', e.message); }
}

function handleChatDeleteConv(msg) {
  try {
    const from = msg.from;
    if (!from) return;
    db.prepare('DELETE FROM messages WHERE (from_machine=? AND to_machine=?) OR (from_machine=? AND to_machine=?)')
      .run(from, MACHINE_ID, MACHINE_ID, from);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('chat-conv-deleted', { peerId: from }); } catch(_e) {}
    }
  } catch(e) { console.error('[CHAT] deleteConv:', e.message); }
}

// Notification connexion/déconnexion dans le chat
function chatNotifyPeer(label, event) {
  try {
    const ts = new Date().toISOString().replace('T',' ').slice(0,19);
    const content = `__system__:${event}:${label}`;
    db.prepare("INSERT INTO messages (from_machine, from_label, to_machine, content, ts) VALUES ('system','system','all',?,?)").run(content, ts);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('chat-message', { from: 'system', fromLabel: 'system', to: 'all', content, ts }); } catch(_e) {}
    }
  } catch(_e) {}
}

// ============================================================
// Audit Log + Email + Excel — extracted to src/main/audit.js, email.js, excel.js
// ============================================================
auditModule.ensureTable();
auditModule.registerIPC(ipcMain);
emailModule.registerIPC(ipcMain);
excelModule.registerIPC(ipcMain);
global._ckbAuditLog = auditModule.insertAuditLog;

// Étendre handleSyncMessage pour les messages chat
const _v4HandlerBase = global._ckbSyncHandlers.handleSyncMessage;
global._ckbSyncHandlers.handleSyncMessage = (ws, msg, peerMachineId) => {
  if (msg.type === 'CHAT_MESSAGE') handleChatMessage(msg);
  else if (msg.type === 'CHAT_EDIT') handleChatEdit(msg);
  else if (msg.type === 'CHAT_DELETE') handleChatDelete(msg);
  else if (msg.type === 'CHAT_DELETE_CONV') handleChatDeleteConv(msg);
  else _v4HandlerBase(ws, msg, peerMachineId);
};

// Notifier chat à la connexion/déconnexion d'un pair
const _v4OnPeerReg = global._ckbSyncHandlers.onPeerRegistered;
global._ckbSyncHandlers.onPeerRegistered = (peerMachineId) => {
  _v4OnPeerReg(peerMachineId);
  const peer = peersMap.get(peerMachineId) || db.prepare('SELECT machine_label FROM network_peers WHERE machine_id=?').get(peerMachineId);
  const label = peer?.machine_label || peerMachineId.slice(0,8);
  setTimeout(() => chatNotifyPeer(label, 'connected'), 800);
};

ipcMain.handle('print-audit-pdf', async (_, { html, filename }) => {
  try {
    const tmpFile = path.join(os.tmpdir(), 'ckbpos_audit_' + Date.now() + '.html');
    fs.writeFileSync(tmpFile, html, 'utf8');
    const win2 = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    await new Promise(res => {
      win2.loadURL('file:///' + tmpFile.replace(/\\/g, '/'));
      win2.webContents.on('did-finish-load', res);
    });
    const pdfBuffer = await win2.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: true,
      margins: { marginType: 'default' },
    });
    win2.close();
    try { fs.unlinkSync(tmpFile); } catch(_e) {}
    const result = await dialog.showSaveDialog({
      title: 'Salvar Audit PDF',
      defaultPath: path.join('D:\\', filename || ('ckbpos_audit_' + Date.now() + '.pdf')),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled) return { success: true, canceled: true };
    fs.writeFileSync(result.filePath, pdfBuffer);
    shell.openPath(result.filePath).catch(() => {});
    return { success: true, path: result.filePath };
  } catch(e) {
    console.error('[print-audit-pdf]', e.message);
    return { success: false, error: e.message };
  }
});


ipcMain.handle('coord-connected-users', () => {
  try {
    // Utilisateurs avec session récente (< 12h) + machine online
    const sessions = db.prepare(`
      SELECT us.user_id, us.machine_id, us.machine_label, us.login_at, u.nom, u.role
      FROM user_sessions us JOIN users u ON us.user_id=u.id
      WHERE us.login_at >= datetime('now','-12 hours')
      ORDER BY us.login_at DESC
    `).all();
    // Enrichir avec statut online
    const result = sessions.map(s => ({
      ...s,
      online: s.machine_id === MACHINE_ID || peersMap.has(s.machine_id),
    }));
    return { success: true, data: result };
  } catch(e) { return { success: false, data: [] }; }
});

// Broadcast depuis CoordDashboard (v4.4.0)
ipcMain.handle('coord-broadcast-msg', (_, { content, fromLabel }) => {
  try {
    const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
    const fl = fromLabel || labelRow?.value || 'COORD';
    const ts = new Date().toISOString().replace('T',' ').slice(0,19);
    db.prepare('INSERT INTO messages (from_machine, from_label, to_machine, content, ts) VALUES (?,?,?,?,?)')
      .run(MACHINE_ID, fl, 'all', content, ts);
    const wsMsg = encryptPayload({ type: 'CHAT_MESSAGE', from: MACHINE_ID, fromLabel: fl, to: 'all', content, ts });
    for (const peer of peersMap.values()) {
      if (peer.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(wsMsg); } catch(_e) {}
    }
    // Notifier localement
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('chat-message', { from: MACHINE_ID, fromLabel: fl, to: 'all', content, ts }); } catch(_e) {}
    }
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});


const _v3HandlerFinal = global._ckbSyncHandlers.handleSyncMessage;
global._ckbSyncHandlers.handleSyncMessage = (ws, msg, peerMachineId) => {
  if      (msg.type === 'SNAPSHOT_REQUEST') handleSnapshotRequest(ws, msg);
  else if (msg.type === 'SNAPSHOT_DATA')    handleSnapshotData(msg);
  else if (msg.type === 'SNAPSHOT_CHUNK')   handleSnapshotChunk(msg);
  else if (msg.type === 'SNAPSHOT_DENIED')  {
    if (mainWindow && !mainWindow.isDestroyed()) try { mainWindow.webContents.send('snapshot-denied', {}); } catch(_e) {}
  }
  else _v3HandlerFinal(ws, msg, peerMachineId);
};
