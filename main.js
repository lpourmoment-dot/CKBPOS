const { registerLicenseIPC, incrementSalesCounter } = require('./license-ipc');
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

let mainWindow;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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

  // \u2705 F12 / Ctrl+Shift+I \u2192 DevTools (before-input-event — fiable sur tous les claviers)
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && (
      input.key === 'F12' ||
      (input.control && input.shift && input.key === 'I')
    )) {
      mainWindow.webContents.toggleDevTools();
    }
  });

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
  createWindow();
  // Pré-charger les modules lourds en arrière-plan après que la fenêtre est prête
  setTimeout(() => {
    try { require('./database/driveSync'); } catch(e) {}
  }, 2000);
  // v1.4.0 — Services réseau LAN (WS + UDP) — délai pour laisser la BDD s'initialiser
  setTimeout(startNetworkServices, 1500);
  // Auto-update : check au démarrage (5s après affichage, silencieux si rien)
  setupAutoUpdater();
  setTimeout(() => checkForUpdates(true), 5000);
  // Check périodique : toutes les 30 minutes, même app en cours d'utilisation
  setInterval(() => checkForUpdates(true), 30 * 60 * 1000);
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
ipcMain.handle('store-set', (_, key, value) => { store.set(key, value); return true; });
ipcMain.handle('store-delete', (_, key) => { store.delete(key); return true; });

// Lister les imprimantes disponibles
ipcMain.handle('get-printers', async () => {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return { success: true, data: printers.map(p => ({ name: p.name, isDefault: p.isDefault, status: p.status })) };
  } catch(e) { return { success: false, error: e.message, data: [] }; }
});

const db = require('./database/db');
const { MACHINE_ID } = require('./database/db');
// Version auto depuis package.json
const APP_VERSION = (() => { try { return require('./package.json').version; } catch(e) { return '3.2.0'; } })();
// \u2705 Version auto depuis package.json — utilisé dans SettingsPage.js
ipcMain.handle('app-version', () => APP_VERSION);

ipcMain.handle('db-query', (_, sql, params) => {
  try {
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
    return { success:true, data:result };
  } catch(err) { return { success:false, error:err.message }; }
});
ipcMain.handle('db-get', (_, sql, params) => {
  try { return { success:true, data:db.prepare(sql).get(...(params||[])) }; }
  catch(err) { return { success:false, error:err.message }; }
});

// ── Console SQL (debug terrain) ──
ipcMain.handle('dev-sql-query', (_, sql) => {
  try {
    const s = sql.trim();
    if (!s) return { success:false, error:'Requête vide' };
    const up = s.toUpperCase();
    if (up.startsWith('SELECT') || up.startsWith('PRAGMA')) {
      const rows = db.prepare(s).all();
      return { success:true, rows, count: rows.length };
    } else {
      const r = db.prepare(s).run();
      return { success:true, rows:[], count: r.changes, info: 'changes: ' + r.changes };
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
ipcMain.handle('caderno-entries-list', (_, { date_jour, user_id, is_admin }) => {
  try {
    let sql = `SELECT e.*, u.nom as user_nom
               FROM caderno_entries e
               JOIN users u ON e.user_id = u.id
               WHERE e.date_jour = ?`;
    const params = [date_jour];
    if (!is_admin) { sql += ' AND e.user_id = ?'; params.push(user_id); }
    sql += ' ORDER BY e.created_at ASC';
    return { success:true, data:db.prepare(sql).all(...params) };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Ajouter ou cumuler une entrée ──
// Règle : même nom + même motivo + même date_jour \u2192 additionne le montant
ipcMain.handle('caderno-entries-add', (_, entry) => {
  try {
    const { nom, motivo, montant, montant_raw, note, direction, est_dette, user_id, machine_id, date_jour } = entry;

    // Chercher si une entrée identique existe déjà aujourd'hui
    const existing = db.prepare(
      'SELECT * FROM caderno_entries WHERE nom=? AND motivo=? AND date_jour=? LIMIT 1'
    ).get(nom, motivo, date_jour);

    if (existing) {
      // Cumuler
      const newMontant = existing.montant + (montant || 0);
      const newRaw = existing.montant_raw
        ? existing.montant_raw + '+' + (montant_raw || montant)
        : (montant_raw || String(montant));
      db.prepare(
        'UPDATE caderno_entries SET montant=?, montant_raw=?, note=? WHERE id=?'
      ).run(newMontant, newRaw, note || existing.note, existing.id);
      return { success:true, id:existing.id, cumul:true };
    } else {
      // Nouvelle entrée
      const statutDette = est_dette ? 'pendente' : null;
      const r = db.prepare(
        `INSERT INTO caderno_entries
         (nom, motivo, montant, montant_raw, note, direction, est_dette, statut_dette, user_id, machine_id, date_jour)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run(nom, motivo, montant||0, montant_raw||'', note||'', direction, est_dette?1:0, statutDette, user_id, machine_id||'LOCAL', date_jour);
      return { success:true, id:r.lastInsertRowid, cumul:false };
    }
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
ipcMain.handle('caderno-entries-clear', (_, { mode, date_jour, user_id, is_admin }) => {
  try {
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
    if (!is_admin) { sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' user_id=?'; params.push(user_id); }
    db.prepare(sql).run(...params);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
});

// ── Lister les jours disponibles ──
ipcMain.handle('caderno-days-list', (_, { user_id, is_admin }) => {
  try {
    let sql = 'SELECT DISTINCT date_jour FROM caderno_entries';
    const params = [];
    if (!is_admin) { sql += ' WHERE user_id=?'; params.push(user_id); }
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
// NUMERO FACTURE SEQUENTIEL
// ============================================================
ipcMain.handle('next-facture-num', async () => {
  try {
    const year = new Date().getFullYear();
    // \u2705 Basé sur MAX(id) — séquentiel et jamais réutilisé même après annulation
    const row = db.prepare("SELECT COALESCE(MAX(id),0) as maxId FROM ventes").get();
    const seq = (row?.maxId || 0) + 1;
    const shortId = MACHINE_ID.slice(0,8).toUpperCase();
    const num = `FR CKB${year}/${shortId}-${String(seq).padStart(4,'0')}`;
    return { success: true, numero: num, seq };
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
      const vRes = db.prepare(
        "INSERT INTO ventes (user_id,client_nom,client_nif,total,montant_recu,monnaie_rendue,mode_paiement,montant_dinheiro,montant_express,statut,facture_num) VALUES (?,?,?,?,?,?,?,?,?,'pago_retirar',?)"
      ).run(userId, clientNom||null, clientNif||'CONSUMIDOR FINAL', total, total, 0, modeP, montantD||0, montantE||0, '');
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

    const vRes = db.prepare(
      "INSERT INTO ventes (user_id,client_nom,client_nif,total,montant_recu,monnaie_rendue,mode_paiement,montant_dinheiro,montant_express,facture_num) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(userId, clientNom||res.client_nom, clientNif||res.client_nif, total, totalPaid, change, modeP||'dinheiro', montantD||0, montantE||0, numeroFacture);
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
  return { printerName, copiesTicket, copiesShift, ticketSizeMm, ticketWidthMicrons };
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

function printHTML(html, copies = 1, isTicket = false) {
  return new Promise((resolve, reject) => {
    const { printerName, ticketWidthMicrons } = getPrintSettings();
    const os = require('os');
    const fs = require('fs');

    const thermalFix = isTicket ? `<style>
      * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { background: #ffffff !important; }
    </style>` : '';
    const fixedHtml = html.replace('</head>', thermalFix + '</head>');

    const tmpFile = path.join(os.tmpdir(), 'ckbpos_' + Date.now() + '.html');
    fs.writeFileSync(tmpFile, fixedHtml, 'utf8');
    const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch(e) {} };

    // ── Détecter "Microsoft Print to PDF" ──────────────────────────
    // Quand cette imprimante virtuelle est sélectionnée, on utilise
    // printToPDF() d'Electron au lieu de print() pour garder les
    // dimensions exactes du ticket (72mm) au lieu d'une page A4.
    const isMicrosoftPdf = printerName && printerName.trim().toLowerCase().includes('microsoft print to pdf');

    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    win.loadURL('file:///' + tmpFile.replace(/\\/g, '/'));

    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (isMicrosoftPdf && isTicket) {
            // -- Chemin PDF : printToPDF avec dimensions dynamiques --
            const pdfBuffer = await win.webContents.printToPDF({
              printBackground: true,
              pageSize: { width: ticketWidthMicrons || 72100, height: 400000 },
              margins: { marginType: 'none' },
            });
            win.close();
            cleanup();

            const result = await dialog.showSaveDialog({
              title: 'Salvar Factura PDF',
              defaultPath: path.join('D:\\', 'factura_' + Date.now() + '.pdf'),
              filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });

            if (result.canceled) {
              // \u2705 Dialog annulé = impression abandonnée volontairement
              // On résout avec success:true pour ne pas bloquer le bouton Imprimir
              return resolve({ success: true, canceled: true });
            }
            fs.writeFileSync(result.filePath, pdfBuffer);
            // \u2705 Ouvrir le PDF automatiquement après sauvegarde
            shell.openPath(result.filePath).catch(() => {});
            return resolve({ success: true, path: result.filePath });
          }

          // ── Chemin impression physique (POS-80, AnyDesk, etc.) ──
          const printOptions = {
            silent: true,
            printBackground: true,
            color: false,
            copies: Math.max(1, copies),
            margins: { marginType: 'none' },
            scaleFactor: 100,
          };

          if (isTicket) {
            printOptions.pageSize = { width: ticketWidthMicrons || 72100, height: 400000 };
          }

          if (printerName && printerName.trim()) {
            printOptions.deviceName = printerName.trim();
          }

          win.webContents.print(printOptions, (success, errorType) => {
            win.close();
            cleanup();
            if (success) {
              resolve({ success: true });
            } else {
              // Fallback : essayer sans deviceName
              const tmpFile2 = path.join(os.tmpdir(), 'ckbpos_fb_' + Date.now() + '.html');
              fs.writeFileSync(tmpFile2, fixedHtml, 'utf8');
              const cleanup2 = () => { try { fs.unlinkSync(tmpFile2); } catch(e) {} };
              const win2 = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
              win2.loadURL('file:///' + tmpFile2.replace(/\\/g, '/'));
              win2.webContents.on('did-finish-load', () => {
                setTimeout(() => {
                  const fallbackOpts = { silent: true, printBackground: true, color: false, copies: Math.max(1, copies), margins: { marginType: 'none' }, scaleFactor: 100 };
                  if (isTicket) fallbackOpts.pageSize = { width: ticketWidthMicrons || 72100, height: 400000 };
                  win2.webContents.print(fallbackOpts, (s2, e2) => {
                    win2.close(); cleanup2();
                    if (s2) resolve({ success: true });
                    else reject(new Error(e2 || errorType));
                  });
                }, 800);
              });
              win2.webContents.on('did-fail-load', (e, code, desc) => { win2.close(); cleanup2(); reject(new Error(desc)); });
            }
          });

        } catch(err) {
          win.close(); cleanup();
          reject(err);
        }
      }, 1500);
    });
    win.webContents.on('did-fail-load', (e, code, desc) => { win.close(); cleanup(); reject(new Error(desc)); });
  });
}

ipcMain.handle('print-ticket', async (_, data) => {
  try {
    // ── v1.9.1 — Mode impression partagée ──
    const printerMode = db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
    const targetId    = db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
    if (printerMode === 'shared' && targetId && targetId !== MACHINE_ID) {
      const peer = peersMap.get(targetId);
      if (peer?.ws?.readyState === WebSocket.OPEN) {
        try {
          await sendPrintRequest(targetId, 'ticket', data);
          return { success: true, remote: true };
        } catch(remoteErr) {
          console.error('[PRINT] Fallback local (pair offline):', remoteErr.message);
          // fallback local — continuer
        }
      } else {
        console.warn('[PRINT] Machine cible hors ligne — fallback local');
      }
    }
    // ── Mode local (défaut) ──
    let qrDataUrl = '';
    if (QRCode) {
      try {
        const qrText = [
          data.numeroFacture || 'N/A',
          `${data.total} ${data.currency}`,
          data.date,
          data.seller
        ].join('|');
        qrDataUrl = await QRCode.toDataURL(qrText, {
          width: 128, margin: 2, errorCorrectionLevel: 'L',
          color: { dark: '#000000', light: '#ffffff' }
        });
      } catch(e) { console.log('QR error:', e.message); }
    }
    const { copiesTicket, ticketSizeMm } = getPrintSettings();
    const copies = data.copies || copiesTicket || 2;
    const flags = getTicketFlags();
    const result = await printHTML(generateTicketHTML({ ...data, qrDataUrl, flags, ticketSizeMm }), copies, true);
    return { success: true, copies, ...(result || {}) };
  }
  catch(e) {
    console.error('[print-ticket]', e.message);
    return { success: true, error: e.message };
  }
});
ipcMain.handle('print-shift-report', async (_, data) => {
  try {
    // ── v1.9.1 — Mode impression partagée ──
    const printerMode = db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
    const targetId    = db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
    if (printerMode === 'shared' && targetId && targetId !== MACHINE_ID) {
      const peer = peersMap.get(targetId);
      if (peer?.ws?.readyState === WebSocket.OPEN) {
        try { await sendPrintRequest(targetId, 'shift', data); return { success: true, remote: true }; }
        catch(remoteErr) { console.error('[PRINT] Fallback local shift:', remoteErr.message); }
      }
    }
    const { copiesShift, ticketSizeMm } = getPrintSettings();
    const copies = data.copies || copiesShift || 1;
    let cadernoResume = null;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = db.prepare('SELECT direction, montant, est_dette, statut_dette FROM caderno_entries WHERE date_jour=?').all(today);
      if (rows.length > 0) {
        const totalPlus  = rows.filter(e => e.direction === 'entree').reduce((s,e) => s + e.montant, 0);
        const totalMoins = rows.filter(e => e.direction !== 'entree').reduce((s,e) => s + e.montant, 0);
        const dettes     = rows.filter(e => e.est_dette && e.statut_dette !== 'pago').reduce((s,e) => s + e.montant, 0);
        cadernoResume = { totalPlus, totalMoins, dettes, net: totalPlus - totalMoins };
      }
    } catch(err) { console.error('[shift caderno]', err.message); }
    await printHTML(generateShiftHTML({ ...data, cadernoResume, ticketSizeMm }), copies, true);
    return { success: true, copies };
  }
  catch(e) { return { success:false, error:e.message }; }
});
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

// v1.3.0 -- Impression Caderno de Caixa (résumé du jour)
ipcMain.handle('print-caderno', async (_, data) => {
  try {
    // ── v1.9.1 — Mode impression partagée ──
    const printerMode = db.prepare("SELECT value FROM settings WHERE key='printer_mode'").get()?.value || 'local';
    const targetId    = db.prepare("SELECT value FROM settings WHERE key='printer_machine_id'").get()?.value || '';
    if (printerMode === 'shared' && targetId && targetId !== MACHINE_ID) {
      const peer = peersMap.get(targetId);
      if (peer?.ws?.readyState === WebSocket.OPEN) {
        try { await sendPrintRequest(targetId, 'caderno', data); return { success: true, remote: true }; }
        catch(remoteErr) { console.error('[PRINT] Fallback local caderno:', remoteErr.message); }
      }
    }
    const { ticketSizeMm } = getPrintSettings();
    const html = generateCadernoTicketHTML({ ...data, ticketSizeMm });
    await printHTML(html, 1, true);
    return { success: true };
  } catch(e) {
    console.error('[print-caderno]', e.message);
    return { success: true, error: e.message };
  }
});

// ============================================================
// TICKET HTML - Format professionnel 58mm
// ============================================================
function generateTicketHTML(data) {
  const {
    shopName, shopAddress, shopPhone, shopNif,
    clientNom, clientNif, items, total, cashGiven, change,
    seller, date, currency, statut,
    payMode, montantDinheiro, montantExpress,
    qrDataUrl, numeroFacture,
    segundaVia,
    flags: rawFlags,
    ticketSizeMm: _tMm,
  } = data;
  const ticketW = `${_tMm || 72}mm`;

  // Valeurs par défaut si flags absents (tout visible)
  const flags = rawFlags || {
    showQr:true, showAddress:true, showPhone:true, showNif:true,
    showFactureNum:true, showClientNom:true, showClientNif:true,
    showSeller:true, showObrigado:true, showVersion:true, showSecondaVia:true,
  };

  const payLabel = payMode==='dinheiro'?'Numerário':payMode==='express'?'App Express':'Misto';
  const clientDisplay = clientNom || 'CONSUMIDOR FINAL';
  const nifDisplay = clientNif || 'CONSUMIDOR FINAL';
  const frNum = numeroFacture || '';

  // Largeur utile 58mm - 2x2mm padding = 54mm
  // font-size 11px Courier New = ~1.8mm/char \u2192 max ~40 chars/ligne
  const itemsRows = (items||[]).map(i => `
    <tr>
      <td style="width:50%;word-break:break-word;"><strong>${i.name}</strong><br><small style="font-size:9px;">(${i.type})</small></td>
      <td style="width:8%;text-align:center;"><strong>${i.qty}</strong></td>
      <td style="width:20%;text-align:right;white-space:nowrap;">${i.price}</td>
      <td style="width:22%;text-align:right;white-space:nowrap;"><strong>${i.subtotal || i.price}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: ${ticketW};
      padding: 2mm 3mm;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .sep-solid { border-top: 2px solid #000; margin: 4px 0; }
    .sep-dash  { border-top: 1px dashed #000; margin: 3px 0; }
    .shop-name { font-size: 15px; font-weight: 900; text-transform: uppercase; text-align: center; line-height: 1.4; word-break: break-word; }
    .shop-info { font-size: 11px; text-align: center; line-height: 1.7; }
    .factura-title { font-size: 13px; font-weight: 900; text-align: center; letter-spacing: 1px; margin: 3px 0; text-transform: uppercase; }
    .fr-num { font-size: 11px; font-weight: 900; text-align: center; margin-bottom: 2px; word-break: break-all; }
    .original { font-size: 9px; text-align: center; margin-bottom: 3px; }
    .meta-line { font-size: 11px; line-height: 1.8; }
    .mention-legal { font-size: 9px; font-style: italic; line-height: 1.4; text-align: justify; margin: 3px 0; }
    .cancelled { font-size: 13px; text-align: center; font-weight: 900; border: 2px dashed #000; padding: 3px; margin: 5px 0; letter-spacing: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 2px 0; table-layout: fixed; }
    th { font-size: 10px; font-weight: 900; text-transform: uppercase; padding: 3px 1px; border-top: 2px solid #000; border-bottom: 1px dashed #000; }
    td { padding: 3px 1px; font-size: 11px; vertical-align: top; word-break: break-word; }
    tbody tr:last-child td { border-bottom: 2px solid #000; }
    .total-grand { display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; padding: 4px 0; border-bottom: 2px solid #000; margin: 3px 0 5px; }
    .pay-title { font-size: 12px; font-weight: 900; margin: 4px 0 2px; text-decoration: underline; }
    .pay-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; padding: 2px 0; }
    .footer { text-align: center; font-size: 12px; font-weight: 900; margin-top: 7px; line-height: 1.9; }
    @media print { * { color: #000 !important; background: transparent !important; } body { background: #fff !important; } }
  </style></head><body>

  <div class="shop-name">${shopName}</div>
  <div class="shop-info">
    ${flags.showNif && shopNif ? `Contribuinte Nº ${shopNif}<br>` : ''}
    ${flags.showPhone && shopPhone ? `Tel: ${shopPhone}<br>` : ''}
    ${flags.showAddress && shopAddress ? `${shopAddress}` : ''}
  </div>

  <div class="sep-solid"></div>

  <div class="factura-title">FACTURA RECIBO</div>
  ${flags.showFactureNum && frNum ? `<div class="fr-num">${frNum}</div>` : ''}
  ${flags.showSecondaVia ? `<div class="original">${segundaVia ? '2ème exemplaire — Segunda via' : 'Original'}</div>` : ''}

  <div class="sep-dash"></div>

  <div class="meta-line">
    ${flags.showClientNom ? `<div>Cliente: ${clientDisplay}</div>` : ''}
    ${flags.showClientNif ? `<div>NIF: ${nifDisplay}</div>` : ''}
    <div>Data e Hora: ${date}</div>
    ${flags.showSeller ? `<div>Vendedor: ${seller.toUpperCase()}</div>` : ''}
  </div>

  ${flags.showMentionLegal && shopAddress ? `<div class="mention-legal">Os bens/Serviços foram colocados à disposição do adquirente na data do documento: ${shopAddress}.</div>` : ''}

  ${statut==='annule' ? '<div class="cancelled">*** ANULADO ***</div>' : ''}

  <div class="sep-solid"></div>

  <table>
    <thead>
      <tr>
        <th style="width:50%;text-align:left;">Descrição</th>
        <th style="width:8%;text-align:center;">Qtd</th>
        <th style="width:20%;text-align:right;">Preço</th>
        <th style="width:22%;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <div class="total-grand">
    <span>TOTAL</span>
    <span>${total} ${currency}</span>
  </div>

  <div class="pay-title">Forma de Pagamento</div>
  <div class="sep-dash"></div>
  <div class="pay-row">
    <span>${payLabel.toUpperCase()}</span>
    <span>${payMode==='misto'?`${total} ${currency}`:payMode==='dinheiro'?`${montantDinheiro} ${currency}`:`${montantExpress} ${currency}`}</span>
  </div>
  ${payMode==='misto' ? `
  <div class="pay-row" style="font-size:9px;"><span>└ Numerário</span><span>${montantDinheiro} ${currency}</span></div>
  <div class="pay-row" style="font-size:9px;"><span>└ App Express</span><span>${montantExpress} ${currency}</span></div>` : ''}
  <div class="sep-dash"></div>
  ${payMode==='dinheiro' ? `<div class="pay-row"><span>Recebido</span><span>${cashGiven} ${currency}</span></div>` : ''}
  ${(change && change !== '0' && change !== '0,00') ? `<div class="pay-row"><span>Troco</span><span>${change} ${currency}</span></div>` : ''}

  <div class="sep-solid"></div>

  <div class="footer">
    ${flags.showObrigado ? 'OBRIGADO PELA SUA COMPRA!<br>' : ''}
    ${flags.showVersion ? `CKBPOS v${APP_VERSION}` : ''}
  </div>

  ${flags.showQr && qrDataUrl ? `
  <div style="text-align:center;margin-top:10px;padding-top:6px;border-top:1px dashed #000;">
    <img src="${qrDataUrl}" width="120" height="120" style="display:inline-block;"/>
    <div style="font-size:8px;color:#666;margin-top:3px;font-family:'Courier New',monospace;">Escaneie para verificar</div>
  </div>` : ''}

  </body></html>`;
}

// ============================================================
// HISTORIQUE TICKET HTML - Format 58mm thermique
// ============================================================
function generateHistoriqueTicketHTML(data) {
  const { shopName, ventes, total, currency, filterUser, filterDateFrom, filterDateTo, printedAt, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;

  const statutLabel = { annule:'ANUL', modifie:'MOD', normal:'OK', pago_retirar:'RES' };
  const payLabel    = { dinheiro:'NUM', express:'EXP', misto:'MIS' };

  const countOk   = (ventes||[]).filter(v => v.statut !== 'annule').length;
  const countAnul = (ventes||[]).filter(v => v.statut === 'annule').length;
  const isFiltered = filterDateFrom || (filterUser && filterUser !== 'Todos' && filterUser !== 'all');

  const rows = (ventes||[]).map(v => {
    const statut = statutLabel[v.statut] || 'OK';
    const pay    = payLabel[v.mode_paiement] || 'NUM';
    const date   = fmtDate(v.date_vente).slice(0,16); // dd/mm/yyyy hh:mm
    return `
  <div class="row-vente">
    <span class="vid">#${v.id}</span>
    <span class="vdate">${date}</span>
    <span class="vpay">${pay}</span>
    <span class="vstat ${v.statut}">${statut}</span>
    <span class="vtotal">${fmtNum(v.total)}</span>
  </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      width: ${ticketW};
      padding: 4mm 2mm;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center  { text-align:center; }
    .right   { text-align:right; }
    .sep     { border-top:2px solid #000; margin:4px 0; }
    .sep-d   { border-top:1px dashed #000; margin:3px 0; }
    .title   { font-size:13px; font-weight:900; text-align:center; text-transform:uppercase; }
    .sub     { font-size:9px; text-align:center; margin-bottom:2px; }
    .meta    { font-size:9px; line-height:1.7; }
    .stats   { display:flex; justify-content:space-between; font-size:9px; margin:3px 0; }
    .col-hdr { display:flex; justify-content:space-between; font-size:8px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin-bottom:2px; }
    .row-vente { display:flex; justify-content:space-between; align-items:center; font-size:9px; padding:2px 0; border-bottom:1px dashed #eee; }
    .vid    { width:24px; flex-shrink:0; font-size:8px; }
    .vdate  { width:82px; flex-shrink:0; font-size:8px; }
    .vpay   { width:20px; flex-shrink:0; font-size:8px; text-align:center; }
    .vstat  { width:20px; flex-shrink:0; font-size:8px; text-align:center; font-weight:900; }
    .vstat.annule { color:#000; text-decoration:line-through; }
    .vtotal { flex:1; text-align:right; font-size:9px; }
    .total-line { display:flex; justify-content:space-between; font-size:12px; font-weight:900; margin-top:4px; }
    .footer { text-align:center; font-size:8px; margin-top:6px; }
    @media print { * { color:#000 !important; background:#fff !important; } }
  </style>
  </head><body>

  <div class="title">${shopName || 'CKBPOS'}</div>
  <div class="sub">Histórico de Vendas${isFiltered ? ' — FILTRADO' : ''}</div>
  <div class="sep"></div>

  <div class="meta">
    <div>Impresso: ${printedAt || '-'}</div>
    ${filterUser && filterUser !== 'all' && filterUser !== 'Todos' ? `<div>Vendedor: ${filterUser}</div>` : ''}
    ${filterDateFrom ? `<div>De: ${filterDateFrom}</div><div>Até: ${filterDateTo || 'hoje'}</div>` : ''}
  </div>

  <div class="sep-d"></div>

  <div class="stats">
    <span>Total: ${(ventes||[]).length} venda(s)</span>
    <span>OK: ${countOk} | ANUL: ${countAnul}</span>
  </div>

  <div class="sep"></div>

  <div class="col-hdr">
    <span style="width:24px">#</span>
    <span style="width:82px">Data/Hora</span>
    <span style="width:20px;text-align:center">Pag</span>
    <span style="width:20px;text-align:center">Stat</span>
    <span style="flex:1;text-align:right">${currency}</span>
  </div>

  ${rows || '<div class="center" style="padding:8px 0;">Nenhuma venda</div>'}

  <div class="sep"></div>

  <div class="total-line">
    <span>TOTAL GERAL</span>
    <span>${fmtNum(total)} ${currency}</span>
  </div>

  <div class="sep-d"></div>
  <div class="footer">CKBPOS — ${printedAt || '-'}</div>

  </body></html>`;
}
function generateShiftHTML(data) {
  const { vendeur, dateDebut, dateFin, items, totalVentes, totalDinheiro, totalExpress, argentEnMain, argentEnvoye, note, currency, shopName, shopAddress, shopPhone, shopNif, cadernoResume, fundoCaixa, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;
  const diffMain = argentEnMain - totalDinheiro;
  const diffExpress = argentEnvoye - totalExpress;
  const ecartCaixa = argentEnMain - (fundoCaixa || 0) - totalDinheiro;

  const grouped = {};
  (items||[]).forEach(i => {
    if (!grouped[i.nom]) grouped[i.nom] = { carton:0, demi:0, unite:0, subtotal:0 };
    grouped[i.nom][i.type_vente] += Math.round(i.qty*100)/100;
    grouped[i.nom].subtotal += i.subtotal;
  });

  const groupedRows = Object.entries(grouped).map(([nom, v]) => {
    const parts = [];
    if (v.carton > 0) parts.push(`${v.carton} cx`);
    if (v.demi > 0) parts.push(`${v.demi} demi`);
    if (v.unite > 0) parts.push(`${v.unite} un`);
    return `<div class="row"><span>${nom}: ${parts.join(' + ')}</span><span>${v.subtotal.toLocaleString('fr-FR')} ${currency}</span></div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      width: ${ticketW};
      padding: 2mm 2mm;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .separator { border-top: 2px solid #000; margin: 4px 0; }
    .separator-thin { border-top: 1px dashed #000; margin: 3px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; font-size:9px; }
    .shop-name { font-size:13px; font-weight:900; text-transform:uppercase; text-align:center; line-height:1.3; word-break:break-word; }
    .shop-info { font-size:8px; text-align:center; line-height:1.6; }
    @media print { * { color: #000 !important; background: transparent !important; } body { background: #fff !important; } }
  </style>
  </head><body>
  <div class="shop-name">${shopName || 'CKBPOS'}</div>
  <div class="shop-info">
    ${shopNif ? `Contribuinte Nº ${shopNif}<br>` : ''}
    ${shopPhone ? `Tel: ${shopPhone}<br>` : ''}
    ${shopAddress ? `${shopAddress}` : ''}
  </div>
  <div class="separator"></div>
  <div class="center bold" style="font-size:13px;">RELATÓRIO DE TURNO</div>
  <div class="center" style="font-size:11px;">${vendeur}</div>
  <div class="separator"></div>
  <div class="row"><span>Início:</span><span>${dateDebut}</span></div>
  <div class="row"><span>Fim:</span><span>${dateFin}</span></div>
  <div class="separator"></div>
  <div class="bold" style="margin-bottom:4px;">PRODUTOS VENDIDOS:</div>
  <div class="separator-thin"></div>
  ${groupedRows || '<div class="center">Nenhuma venda</div>'}
  <div class="separator"></div>
  <div class="row bold" style="font-size:14px;"><span>TOTAL VENDAS</span><span>${totalVentes.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="separator"></div>
  <div class="bold" style="margin-bottom:4px;">REGISTRADO NO SISTEMA:</div>
  <div class="row"><span>Numerário</span><span>${totalDinheiro.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="row"><span>App Express</span><span>${totalExpress.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="separator-thin"></div>
  <div class="bold" style="margin-bottom:4px;">CONFIRMADO PELO VENDEDOR:</div>
  <div class="row"><span>Numerário real</span><span>${argentEnMain.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="row"><span>App Express real</span><span>${argentEnvoye.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="separator"></div>
  <div class="bold" style="margin-bottom:4px;">DIFERENÇAS:</div>
  <div class="row"><span>Numerário</span><span>${diffMain>=0?'+':''}${diffMain.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="row"><span>App Express</span><span>${diffExpress>=0?'+':''}${diffExpress.toLocaleString('fr-FR')} ${currency}</span></div>
  ${(fundoCaixa && fundoCaixa > 0) ? `<div class="separator-thin"></div><div class="row"><span>Fundo Caixa</span><span>${Number(fundoCaixa).toLocaleString('fr-FR')} ${currency}</span></div><div class="row bold"><span>ÉCART CAIXA</span><span>${ecartCaixa>=0?'+':''}${ecartCaixa.toLocaleString('fr-FR')} ${currency}</span></div>` : ''}
  ${note ? `<div class="separator-thin"></div><div>Obs: ${note}</div>` : ''}
  <div class="separator"></div>
  ${cadernoResume ? `
  <div class="bold" style="margin-bottom:4px;">CADERNO DE CAIXA:</div>
  <div class="row"><span>Entradas (+)</span><span>${cadernoResume.totalPlus.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="row"><span>Sa\u00eddas (-)</span><span>${cadernoResume.totalMoins.toLocaleString('fr-FR')} ${currency}</span></div>
  ${cadernoResume.dettes > 0 ? `<div class="row" style="font-size:8px;"><span>D\u00edvidas pend.</span><span>${cadernoResume.dettes.toLocaleString('fr-FR')} ${currency}</span></div>` : ''}
  <div class="row bold"><span>Net caderno</span><span>${cadernoResume.net>=0?'+':''}${cadernoResume.net.toLocaleString('fr-FR')} ${currency}</span></div>
  <div class="separator"></div>` : ''}
  <div class="separator-thin"></div>
  <div class="center" style="margin-top:6px;font-size:10px;">Assinatura: ____________________</div>
  <div class="center" style="margin-top:6px;font-size:9px;">CKBPOS v${APP_VERSION}</div>
  </body></html>`;
}


// ============================================================
// PRODUTOS HTML - Rapport produits vendus A4
// ============================================================
function generateProdutosHTML(data) {
  const { shopName, produtos, currency, filterUser, filterDateFrom, filterDateTo, printedAt } = data;
  const totalRevenue = (produtos||[]).reduce((s,p) => s + (p.total||0), 0);
  const totalProduits = (produtos||[]).length;

  const rows = (produtos||[]).map((p, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f5f5';
    const nom = p.variant_nom ? p.nom + ' \u2014 ' + p.variant_nom : p.nom;
    const carton = p.carton > 0 ? Math.round(p.carton*100)/100 + ' cx' : '';
    const demi   = p.demi   > 0 ? Math.round(p.demi*100)/100   + ' demi' : '';
    const unite  = p.unite  > 0 ? Math.round(p.unite*100)/100  + ' un' : '';
    const qtyStr = [carton, demi, unite].filter(Boolean).join(' + ') || '-';
    return `<tr style="background:${bg};">
      <td style="text-align:center;">${i+1}</td>
      <td style="font-weight:700;">${nom}</td>
      <td style="text-align:center;">${qtyStr}</td>
      <td style="text-align:right;font-weight:700;">${fmtNum(p.total)} ${currency}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .title { font-size: 18px; font-weight: 900; text-transform: uppercase; }
    .subtitle { font-size: 12px; color: #444; margin-top: 2px; }
    .meta { margin-bottom: 12px; font-size: 11px; line-height: 1.8; }
    .stats { display: flex; gap: 20px; margin-bottom: 14px; }
    .stat-box { border: 1px solid #ccc; border-radius: 4px; padding: 6px 14px; text-align: center; }
    .stat-box .val { font-size: 16px; font-weight: 900; }
    .stat-box .lbl { font-size: 9px; color: #666; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #000; color: #fff; }
    thead th { padding: 6px; font-weight: 900; font-size: 10px; text-transform: uppercase; }
    tbody td { padding: 5px 6px; border-bottom: 1px solid #e0e0e0; }
    tfoot td { padding: 7px 6px; border-top: 3px solid #000; font-weight: 900; font-size: 12px; }
    .footer { margin-top: 14px; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 6px; text-align: center; }
    @media print { * { color:#000 !important; } thead tr { background:#000 !important; color:#fff !important; } }
  </style></head><body>
  <div class="header">
    <div class="title">${shopName || 'CKBPOS'}</div>
    <div class="subtitle">Relat\u00f3rio de Produtos Vendidos</div>
  </div>
  <div class="meta">
    <div><strong>Impresso em:</strong> ${printedAt || '-'}</div>
    ${filterUser && filterUser !== 'all' && filterUser !== 'Todos' ? `<div><strong>Vendedor:</strong> ${filterUser}</div>` : ''}
    ${filterDateFrom ? `<div><strong>Per\u00edodo:</strong> ${filterDateFrom} \u2192 ${filterDateTo || 'hoje'}</div>` : ''}
  </div>
  <div class="stats">
    <div class="stat-box"><div class="val">${totalProduits}</div><div class="lbl">Produtos</div></div>
    <div class="stat-box" style="border-color:#000;"><div class="val">${fmtNum(totalRevenue)} ${currency}</div><div class="lbl">Receita total</div></div>
  </div>
  <table>
    <thead><tr>
      <th style="width:30px;text-align:center;">#</th>
      <th style="text-align:left;">Produto</th>
      <th style="text-align:center;width:160px;">Quantidade</th>
      <th style="text-align:right;width:120px;">Total</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:20px;">Nenhum produto</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="3" style="text-align:right;">TOTAL GERAL</td>
      <td style="text-align:right;">${fmtNum(totalRevenue)} ${currency}</td>
    </tr></tfoot>
  </table>
  <div class="footer">CKBPOS \u2014 Relat\u00f3rio gerado em ${printedAt || '-'}</div>
  </body></html>`;
}

// ============================================================
// PRODUTOS TICKET HTML - Format 58mm thermique
// ============================================================
function generateProdutosTicketHTML(data) {
  const { shopName, produtos, currency, filterUser, filterDateFrom, filterDateTo, printedAt, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;
  const totalRevenue = (produtos||[]).reduce((s,p) => s + (p.total||0), 0);

  const rows = (produtos||[]).map(p => {
    const nom = p.variant_nom ? p.nom + ' ' + p.variant_nom : p.nom;
    const parts = [];
    if (p.carton > 0) parts.push(Math.round(p.carton*100)/100 + 'cx');
    if (p.demi   > 0) parts.push(Math.round(p.demi*100)/100   + 'dm');
    if (p.unite  > 0) parts.push(Math.round(p.unite*100)/100  + 'un');
    const qtyStr = parts.join('+') || '-';
    return `<div class="prow">
      <div class="pnom">${nom}</div>
      <div class="pinfo"><span class="pqty">${qtyStr}</span><span class="ptot">${fmtNum(p.total)} ${currency}</span></div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body { font-family: 'Courier New', Courier, monospace; font-size:10px; width:${ticketW}; padding:4mm 2mm; color:#000; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .center { text-align:center; }
    .sep    { border-top:2px solid #000; margin:4px 0; }
    .sep-d  { border-top:1px dashed #000; margin:3px 0; }
    .title  { font-size:13px; font-weight:900; text-align:center; text-transform:uppercase; }
    .sub    { font-size:9px; text-align:center; margin-bottom:2px; }
    .meta   { font-size:9px; line-height:1.7; margin-bottom:3px; }
    .col-hdr { display:flex; justify-content:space-between; font-size:8px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin-bottom:2px; }
    .prow   { padding:2px 0; border-bottom:1px dashed #ddd; }
    .pnom   { font-size:10px; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:72mm; }
    .pinfo  { display:flex; justify-content:space-between; font-size:9px; margin-top:1px; }
    .pqty   { color:#333; }
    .ptot   { font-weight:900; }
    .total-line { display:flex; justify-content:space-between; font-size:12px; font-weight:900; margin-top:5px; }
    .footer { text-align:center; font-size:8px; margin-top:6px; }
    @media print { * { color:#000 !important; background:#fff !important; } }
  </style></head><body>
  <div class="title">${shopName || 'CKBPOS'}</div>
  <div class="sub">Produtos Vendidos</div>
  <div class="sep"></div>
  <div class="meta">
    <div>Impresso: ${printedAt || '-'}</div>
    ${filterUser && filterUser !== 'Todos' && filterUser !== 'all' ? `<div>Vendedor: ${filterUser}</div>` : ''}
    ${filterDateFrom ? `<div>De: ${filterDateFrom} \u2192 ${filterDateTo || 'hoje'}</div>` : ''}
  </div>
  <div class="sep-d"></div>
  <div class="col-hdr"><span>Produto</span><span>Qtd / Total</span></div>
  ${rows || '<div class="center" style="padding:8px 0;">Nenhum produto</div>'}
  <div class="sep"></div>
  <div class="total-line">
    <span>${(produtos||[]).length} produto(s)</span>
    <span>${fmtNum(totalRevenue)} ${currency}</span>
  </div>
  <div class="sep-d"></div>
  <div class="footer">CKBPOS \u2014 ${printedAt || '-'}</div>
  </body></html>`;
}

// ============================================================
// HISTORIQUE HTML - A4, robuste, filtres affichés
// ============================================================
function fmtNum(n) {
  // toLocaleString sécurisé pour Node.js process main
  const num = Number(n) || 0;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDate(str) {
  try {
    const d = new Date(str);
    if (isNaN(d)) return str || '-';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mn = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mn}`;
  } catch(e) { return str || '-'; }
}

function generateHistoriqueHTML(data) {
  const { shopName, ventes, total, currency, filterUser, filterDateFrom, filterDateTo, printedAt } = data;

  const payLabel = { dinheiro:'Numerário', express:'App Express', misto:'Misto' };
  const statutLabel = { annule:'ANULADO', modifie:'MODIF.', normal:'OK', pago_retirar:'RESERVADO' };

  const isFiltered = filterDateFrom || (filterUser && filterUser !== 'Todos' && filterUser !== 'all');

  const rows = (ventes||[]).map((v, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f5f5';
    const statut = statutLabel[v.statut] || 'OK';
    const statutColor = v.statut === 'annule' ? '#cc0000' : v.statut === 'modifie' ? '#cc7700' : '#007700';
    return `<tr style="background:${bg};">
      <td style="text-align:center;">${v.id}</td>
      <td>${fmtDate(v.date_vente)}</td>
      <td>${v.vendeur || '-'}</td>
      <td>${v.client_nom || 'CONSUMIDOR FINAL'}</td>
      <td style="text-align:center;">${payLabel[v.mode_paiement] || v.mode_paiement || 'Numerário'}</td>
      <td style="text-align:center;font-weight:900;color:${statutColor};">${statut}</td>
      <td style="text-align:right;font-weight:700;">${fmtNum(v.total)} ${currency}</td>
    </tr>`;
  }).join('');

  const countOk    = (ventes||[]).filter(v => v.statut !== 'annule').length;
  const countAnul  = (ventes||[]).filter(v => v.statut === 'annule').length;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .title { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
    .subtitle { font-size: 12px; color: #444; margin-top: 2px; }
    .meta { margin-bottom: 10px; font-size: 11px; line-height: 1.8; }
    .meta strong { display: inline-block; min-width: 90px; }
    .stats { display: flex; gap: 24px; margin-bottom: 12px; }
    .stat-box { border: 1px solid #ccc; border-radius: 4px; padding: 6px 14px; text-align: center; }
    .stat-box .val { font-size: 16px; font-weight: 900; }
    .stat-box .lbl { font-size: 9px; color: #666; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #000; color: #fff; }
    thead th { padding: 6px 6px; font-weight: 900; font-size: 10px; text-transform: uppercase; }
    tbody td { padding: 5px 6px; border-bottom: 1px solid #e0e0e0; }
    tfoot td { padding: 6px 6px; border-top: 3px solid #000; font-weight: 900; font-size: 12px; }
    .right { text-align: right; }
    .center { text-align: center; }
    .footer { margin-top: 16px; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 6px; text-align: center; }
    @media print {
      * { color: #000 !important; }
      thead tr { background: #000 !important; color: #fff !important; }
      -webkit-print-color-adjust: exact;
    }
  </style>
  </head><body>

  <div class="header">
    <div class="title">${shopName || 'CKBPOS'}</div>
    <div class="subtitle">Relatório de Histórico de Vendas${isFiltered ? ' — FILTRADO' : ' — COMPLETO'}</div>
  </div>

  <div class="meta">
    <div><strong>Impresso em:</strong> ${printedAt || '-'}</div>
    ${filterUser && filterUser !== 'all' && filterUser !== 'Todos' ? `<div><strong>Vendedor:</strong> ${filterUser}</div>` : ''}
    ${filterDateFrom ? `<div><strong>Período:</strong> ${filterDateFrom} \u2192 ${filterDateTo || 'hoje'}</div>` : ''}
    <div><strong>Registros:</strong> ${(ventes||[]).length} venda(s)</div>
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="val">${(ventes||[]).length}</div>
      <div class="lbl">Total vendas</div>
    </div>
    <div class="stat-box">
      <div class="val">${countOk}</div>
      <div class="lbl">Confirmadas</div>
    </div>
    <div class="stat-box">
      <div class="val">${countAnul}</div>
      <div class="lbl">Anuladas</div>
    </div>
    <div class="stat-box" style="border-color:#000;">
      <div class="val">${fmtNum(total)} ${currency}</div>
      <div class="lbl">Total geral</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>Data / Hora</th>
        <th>Vendedor</th>
        <th>Cliente</th>
        <th class="center">Pagamento</th>
        <th class="center">Status</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7" style="text-align:center;padding:20px;">Nenhuma venda encontrada</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" class="right">TOTAL GERAL (excl. anuladas)</td>
        <td class="right">${fmtNum(total)} ${currency}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">CKBPOS — Relatório gerado automaticamente em ${printedAt || '-'}</div>

  </body></html>`;
}

// ============================================================
// CADERNO TICKET HTML - Format thermique (résumé du jour)
// ============================================================
function generateCadernoTicketHTML(data) {
  const { shopName, entries, date_jour, currency, printedAt, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;

  const totalPlus  = (entries||[]).filter(e => e.direction === 'entree').reduce((s,e) => s + (e.montant||0), 0);
  const totalMoins = (entries||[]).filter(e => e.direction !== 'entree').reduce((s,e) => s + (e.montant||0), 0);
  const dettes     = (entries||[]).filter(e => e.est_dette && e.statut_dette !== 'pago').reduce((s,e) => s + (e.montant||0), 0);
  const net        = totalPlus - totalMoins;

  const rows = (entries||[]).map(e => {
    const signe = e.direction === 'entree' ? '+' : '-';
    const col   = e.direction === 'entree' ? '#2d9e6b' : '#cc4444';
    const motTxt = (e.motivo || '').substring(0, 16);
    const nomTxt = (e.nom    || '-').substring(0, 18);
    return `<div class="erow">
      <span class="enom">${nomTxt}</span>
      <span class="emot">${motTxt}</span>
      <span class="eamt" style="color:${col};">${signe}${fmtNum(e.montant||0)}</span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${ticketW} auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body { font-family: 'Courier New', Courier, monospace; font-size:10px; width:${ticketW}; padding:4mm 2mm; color:#000; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .center { text-align:center; }
    .sep    { border-top:2px solid #000; margin:4px 0; }
    .sep-d  { border-top:1px dashed #000; margin:3px 0; }
    .title  { font-size:13px; font-weight:900; text-align:center; text-transform:uppercase; }
    .sub    { font-size:9px; text-align:center; margin-bottom:2px; }
    .meta   { font-size:9px; line-height:1.7; margin-bottom:3px; }
    .erow   { display:flex; justify-content:space-between; align-items:center; font-size:9px; padding:2px 0; border-bottom:1px dashed #ccc; gap:3px; }
    .enom   { flex:1; font-size:9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .emot   { width:60px; font-size:8px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }
    .eamt   { width:50px; text-align:right; font-size:9px; flex-shrink:0; }
    .totrow { display:flex; justify-content:space-between; font-size:10px; padding:2px 0; }
    .totbig { display:flex; justify-content:space-between; font-size:12px; font-weight:900; margin-top:3px; padding:3px 0; border-top:2px solid #000; }
    .footer { text-align:center; font-size:8px; margin-top:6px; }
    @media print { * { color:#000 !important; background:#fff !important; } }
  </style></head><body>
  <div class="title">${shopName || 'CKBPOS'}</div>
  <div class="sub">Caderno de Caixa</div>
  <div class="sep"></div>
  <div class="meta">
    <div>Data: ${date_jour || '-'}</div>
    <div>Impresso: ${printedAt || '-'}</div>
  </div>
  <div class="sep-d"></div>
  ${rows || '<div class="center" style="padding:6px 0;font-size:9px;">Nenhum registo</div>'}
  <div class="sep"></div>
  <div class="totrow"><span>TOTAL +</span><span>+${fmtNum(totalPlus)} ${currency || 'Kz'}</span></div>
  <div class="totrow"><span>TOTAL -</span><span>-${fmtNum(totalMoins)} ${currency || 'Kz'}</span></div>
  ${dettes > 0 ? `<div class="totrow" style="color:#b00;"><span>D\u00edvidas pend.</span><span>-${fmtNum(dettes)} ${currency || 'Kz'}</span></div>` : ''}
  <div class="totbig"><span>NET DO DIA</span><span>${net>=0?'+':''}${fmtNum(net)} ${currency || 'Kz'}</span></div>
  <div class="sep-d"></div>
  <div class="footer">CKBPOS \u2014 ${printedAt || '-'}</div>
  </body></html>`;
}


// ============================================================
// CONSOLE IN-APP — v1.4.1
// Intercepte console.log/error/warn \u2192 envoie au renderer
// Capture automatique des tags [LAN] [SYNC] [BEAT] [DB] etc.
// ============================================================

const MAX_LOG_BUFFER = 250;
const _logBuffer     = [];

const _origLog   = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn  = console.warn.bind(console);

function _pushLog(level, args) {
  try {
    const raw = args.map(a => {
      if (a instanceof Error) return a.message;
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch(_e2) { return String(a); } }
      return String(a);
    }).join(' ');

    // Extraire le tag [XXX] en début de message
    const tagMatch = raw.match(/^(\[[A-Z0-9_]+\])\s*/);
    const tag  = tagMatch ? tagMatch[1] : '[LOG]';
    const msg  = tagMatch ? raw.slice(tagMatch[0].length) : raw;

    const entry = {
      time:  new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
      tag, msg, level,
    };
    _logBuffer.push(entry);
    if (_logBuffer.length > MAX_LOG_BUFFER) _logBuffer.shift();

    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('debug-log', entry); } catch(_e2) {}
    }
  } catch(_e2) {}
}

console.log   = (...a) => { _origLog(...a);   _pushLog('info',    a); };
console.error = (...a) => { _origError(...a); _pushLog('error',   a); };
console.warn  = (...a) => { _origWarn(...a);  _pushLog('warn',    a); };

ipcMain.handle('debug-logs-get', () => ({ success: true, data: [..._logBuffer] }));

// ============================================================
// RÉSEAU P2P LAN — v1.4.0
// WebSocket server (port 41234) + UDP broadcast discovery (port 41235)
// ============================================================

const WebSocket = require('ws');
const dgram     = require('dgram');
const os        = require('os');

const WS_PORT  = 41234;
const UDP_PORT = 41235;

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
      machine_id:    MACHINE_ID,
      machine_label: labelRow?.value || 'CKBPOS',
      port:          WS_PORT,
      network_key:   getNetworkKey(),
    };
  } catch(_e) {
    return { type: 'CKBPOS_INFO', machine_id: MACHINE_ID, machine_label: 'CKBPOS', port: WS_PORT, network_key: '' };
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

// ── Serveur WebSocket — écoute les connexions entrantes ────
function startWsServer() {
  try {
    wssServer = new WebSocket.Server({ port: WS_PORT });
    console.log('[LAN] WebSocket server port ' + WS_PORT);

    wssServer.on('connection', (ws, req) => {
      const peerIp = (req.socket.remoteAddress || '').replace('::ffff:', '');
      let peerMachineId = null;

      // Envoyer immédiatement nos informations
      try { ws.send(JSON.stringify(getMachineInfo())); } catch(_e) {}

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === 'CKBPOS_INFO') {
            if (msg.machine_id === MACHINE_ID) { ws.close(); return; }
            // ── v1.8.0 Clé réseau — isoler les entreprises sur le même LAN ──
            // Exception : accepter si la machine distante n'a pas encore de clé (setup en cours)
            if (!networkKeyMatches(msg.network_key) && msg.network_key) {
              console.warn('[LAN] Refusé (clé réseau différente): ' + (msg.machine_label || msg.machine_id) + ' @ ' + peerIp);
              ws.close(); return;
            }
            peerMachineId = msg.machine_id;
            // v1.8.1 — Connexion permanente : rejeter le doublon si connexion active
            if (peersMap.has(peerMachineId)) {
              const existing = peersMap.get(peerMachineId);
              if (existing.ws?.readyState === WebSocket.OPEN) {
                ws.close(); return; // garder la connexion existante
              }
            }
            upsertPeer(peerMachineId, msg.machine_label, peerIp, msg.port);
            peersMap.set(peerMachineId, { ws, machine_label: msg.machine_label, ip: peerIp, lastSeen: Date.now() });
            broadcastPeersUpdate();
            console.log('[LAN] Pair connecte: ' + (msg.machine_label || peerMachineId) + ' @ ' + peerIp);
            // v1.5.0 — déclencher sync après connexion
            if (global._ckbSyncHandlers) global._ckbSyncHandlers.onPeerRegistered(peerMachineId);

          } else if (msg.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG', machine_id: MACHINE_ID }));
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
      try { ws.send(JSON.stringify(getMachineInfo())); } catch(_e) {}
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'CKBPOS_INFO') {
          if (msg.machine_id === MACHINE_ID) { ws.close(); return; }
          // Eviter les doublons (connexion entrante peut deja exister)
          if (peersMap.has(msg.machine_id)) { ws.close(); return; }
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
          ws.send(JSON.stringify({ type: 'PONG', machine_id: MACHINE_ID }));
        } else if (msg.type === 'PONG') {
          if (peerMachineId) {
            const p = peersMap.get(peerMachineId);
            if (p) p.lastSeen = Date.now();
          }
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
          const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
          const reply = Buffer.from(JSON.stringify({
            type: 'CKBPOS_DISCOVER_REPLY',
            machine_id: MACHINE_ID,
            machine_label: labelRow?.value || 'CKBPOS',
            port: WS_PORT,
            setup_mode: true,
          }));
          // Répondre au reply_port si spécifié, sinon au port source
          const replyPort = msg.reply_port || rinfo.port;
          udpSocket.send(reply, replyPort, rinfo.address, () => {});
          // Aussi envoyer en broadcast pour maximiser les chances
          try { udpSocket.send(reply, 41235, rinfo.address, () => {}); } catch(_e) {}
          return;
        }

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
    const ping = JSON.stringify({ type: 'PING', machine_id: MACHINE_ID });
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
}

// ── Nettoyage à la fermeture ────────────────────────────────
app.on('before-quit', () => {
  clearInterval(heartbeatInterval);
  clearInterval(rebroadcastInterval);
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

const SYNC_TABLES = new Set(['ventes','vente_items','products','stock_mouvements','caderno_entries','caderno_motivos','caderno_trabalhadores','caderno_produtos','users','settings']);
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
    ws.send(JSON.stringify({ type: 'SYNC_REQUEST', machine_id: MACHINE_ID, last_seq }));
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
      ws.send(JSON.stringify({ type: 'SYNC_DELTA', machine_id: MACHINE_ID, last_id: last_seq || 0, entries: [] }));
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
    ws.send(JSON.stringify({ type: 'SYNC_DELTA', machine_id: MACHINE_ID, last_id: lastId, entries: enriched }));
    console.log('[SYNC] SYNC_DELTA \u2192 ' + machine_id + ' : ' + enriched.length + ' entrees (seq ' + lastId + ')');
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
      try { ws.send(JSON.stringify({ type: 'SYNC_ACK', machine_id: MACHINE_ID, last_seq: ackSeq })); } catch(_e) {}
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
                  try { db.prepare('INSERT INTO users ('+cols+') VALUES ('+phs+')').run(...vals); }
                  catch(_eu) {}
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
    ws.send(JSON.stringify({ type: 'SYNC_ACK', machine_id: MACHINE_ID, last_seq: ackSeq }));

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
    try { ws.send(JSON.stringify({ type: 'SYNC_ACK', machine_id: MACHINE_ID, last_seq: ackSeq })); } catch(_e3) {}
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
  const msg = JSON.stringify({ type: 'COORD_ANNOUNCE', machine_id: MACHINE_ID, machine_label: _coordinatorLabel, ts: Date.now() });
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
    try { ws.send(JSON.stringify({ type: 'STOCK_RESERVED', reservation_id: msg.reservation_id, ok: false, reason: 'not_coordinator' })); } catch(_e) {}
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
      ws.send(JSON.stringify({ type: 'STOCK_RESERVED', reservation_id, ok: false, reason: 'insufficient_stock', available }));
      console.log('[COORD] STOCK refusé prod=' + product_id + ' dispo=' + available + ' demandé=' + qty);
      return;
    }
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_S * 1000).toISOString().replace('T',' ').slice(0,19);
    db.prepare('INSERT INTO stock_reservations (reservation_id,product_id,variant_id,qty_reserved,machine_id,expires_at) VALUES (?,?,?,?,?,?)')
      .run(reservation_id, product_id, variant_id || null, qty, machine_id, expiresAt);
    ws.send(JSON.stringify({ type: 'STOCK_RESERVED', reservation_id, ok: true, available: available - qty }));
    console.log('[COORD] STOCK réservé ' + reservation_id.slice(0,8) + ' prod=' + product_id + ' qty=' + qty);
  } catch(e) {
    console.error('[COORD] handleStockReserve:', e.message);
    try { ws.send(JSON.stringify({ type: 'STOCK_RESERVED', reservation_id: msg.reservation_id, ok: false, reason: 'error' })); } catch(_e) {}
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
    coordPeer.ws.send(JSON.stringify({ type: 'STOCK_RESERVE', reservation_id, product_id, variant_id, qty, machine_id: MACHINE_ID }));
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
    try { coordPeer.ws.send(JSON.stringify({ type: 'STOCK_RELEASE', reservation_id, consumed })); } catch(_e) {}
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
  if (peer?.ws?.readyState === WebSocket.OPEN) try { peer.ws.send(JSON.stringify({ type: 'PRINT_DONE', job_id, success, error: error || null })); } catch(_e) {}
}

function handlePrintEnqueue(ws, msg) {
  if (!_isCoordinator) {
    try { ws.send(JSON.stringify({ type: 'PRINT_QUEUED', job_id: msg.job_id, position: -1, error: 'not_coordinator' })); } catch(_e) {}
    return;
  }
  try {
    const { job_id, print_type, data, priority, machine_source } = msg;
    db.prepare('INSERT OR IGNORE INTO print_queue (job_id,print_type,data_json,priority,machine_source) VALUES (?,?,?,?,?)')
      .run(job_id, print_type, JSON.stringify(data), priority || 5, machine_source || MACHINE_ID);
    const position = db.prepare("SELECT COUNT(*) as c FROM print_queue WHERE status='queued' AND id<=(SELECT id FROM print_queue WHERE job_id=?)").get(job_id)?.c || 1;
    ws.send(JSON.stringify({ type: 'PRINT_QUEUED', job_id, position }));
    console.log('[PRINT] Enqueued job=' + job_id.slice(0,8) + ' pos=' + position);
  } catch(e) {
    console.error('[PRINT] handlePrintEnqueue:', e.message);
    try { ws.send(JSON.stringify({ type: 'PRINT_QUEUED', job_id: msg.job_id, position: -1, error: e.message })); } catch(_e) {}
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
    coordPeer.ws.send(JSON.stringify({ type: 'PRINT_ENQUEUE', job_id, print_type, data, priority: priority || 5, machine_source: MACHINE_ID }));
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
    ws.send(JSON.stringify({ type: 'PRINT_RESPONSE', machine_id: MACHINE_ID, request_id, success: result.success, error: result.error || null }));
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
    peer.ws.send(JSON.stringify({ type: 'PRINT_REQUEST', machine_id: MACHINE_ID, print_type, data, request_id }));
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

    // 2. Broadcast UDP actif — double écoute: port aléatoire + port 41235
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

      // Socket 2: écouter aussi sur 41235 pour les broadcasts de réponse
      const recvSock2 = dgram.createSocket({ type:'udp4', reuseAddr:true });
      recvSock2.on('error', () => {});
      recvSock2.on('message', handleMsg);

      // Socket 3: écouter sur udpSocket principal (réponses broadcast de NLANDU etc.)
      if (udpSocket) udpSocket.on('message', handleMsg);

      recvSock.bind(0, () => {
        const recvPort = recvSock.address().port;

        // Tenter de binder sur 41235 aussi
        try {
          recvSock2.bind(41236, () => {}); // port alternatif pour réponses
        } catch(_e) {}

        const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
        const nkRow = db.prepare("SELECT value FROM settings WHERE key='network_key'").get();
        const discover = Buffer.from(JSON.stringify({
          type: 'CKBPOS_DISCOVER',
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
            sendSock.send(discover, 41235, addr, () => {});
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
          .run(d.machine_id, d.machine_label, d.ip, 41234);
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
    try { ws.send(JSON.stringify({ type: 'SNAPSHOT_DENIED', reason: 'invalid_auth' })); } catch(_e) {}
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
      ws.send(json);
    } else {
      const total = Math.ceil(json.length / CHUNK);
      for (let i = 0; i < total; i++) {
        ws.send(JSON.stringify({
          type: 'SNAPSHOT_CHUNK',
          index: i, total,
          data: json.slice(i * CHUNK, (i + 1) * CHUNK),
        }));
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
              const cols = rowKeys.map(c => '"' + c + '"').join(',');
              const phs  = rowKeys.map(() => '?').join(',');
              const vals = rowKeys.map(k => row[k]);
              db.prepare('INSERT OR IGNORE INTO "' + table + '" (' + cols + ') VALUES (' + phs + ')').run(...vals);
              snapOk++;
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
        connectToPeer(info.ip, info.port || 41234);
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
    peer.ws.send(JSON.stringify({ type: 'SNAPSHOT_REQUEST', invite_code: invite_code || '', network_key: network_key || '' }));
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
    const wsMsg = JSON.stringify({ type: 'CHAT_MESSAGE', from: MACHINE_ID, fromLabel, fromUserNom: userNom || null, to: to || 'all', content: msgContent, msgType: type, audioData: audioData || null, ts, clientId });
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
      const wsMsg = JSON.stringify({ type: 'CHAT_DELETE', clientId: client_id });
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
        try { peer.ws.send(JSON.stringify({ type: 'CHAT_DELETE_CONV', from: MACHINE_ID })); } catch(_e) {}
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
// AUDIT LOG — v4.2.0
// Journal centralisé de toutes les actions
// ============================================================

try {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_nom TEXT,
    action TEXT NOT NULL,
    details TEXT,
    machine_id TEXT,
    machine_label TEXT,
    ts TEXT DEFAULT (datetime('now','utc'))
  )`);
} catch(_e) {}

function insertAuditLog(user_id, user_nom, action, details) {
  try {
    const labelRow = db.prepare("SELECT value FROM settings WHERE key='machine_label'").get();
    const ml = labelRow?.value || 'CKBPOS';
    db.prepare('INSERT INTO audit_log (user_id, user_nom, action, details, machine_id, machine_label) VALUES (?,?,?,?,?,?)')
      .run(user_id || null, user_nom || 'system', action, details || null, MACHINE_ID, ml);
  } catch(_e) {}
}
global._ckbAuditLog = insertAuditLog;

ipcMain.handle('audit-list', (_, { limit, offset, user_id, action, date_from, date_to }) => {
  try {
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (user_id) { sql += ' AND user_id=?'; params.push(user_id); }
    if (action)  { sql += ' AND action=?';  params.push(action); }
    if (date_from) { sql += ' AND ts >= ?'; params.push(date_from + ' 00:00:00'); }
    if (date_to)   { sql += ' AND ts <= ?'; params.push(date_to + ' 23:59:59'); }
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit || 100, offset || 0);
    const data = db.prepare(sql).all(...params);
    const total = db.prepare('SELECT COUNT(*) as c FROM audit_log WHERE 1=1' +
      (user_id ? ' AND user_id=?' : '') +
      (action  ? ' AND action=?'  : '') +
      (date_from ? ' AND ts >= ?' : '') +
      (date_to   ? ' AND ts <= ?' : '')
    ).get(...params.slice(0, -2))?.c || 0;
    return { success: true, data, total };
  } catch(e) { return { success: false, data: [], total: 0 }; }
});

ipcMain.handle('audit-actions', () => {
  try {
    const rows = db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all();
    return { success: true, data: rows.map(r => r.action) };
  } catch(e) { return { success: false, data: [] }; }
});

// ============================================================
// RAPPORT EMAIL — v4.3.0
// nodemailer + Gmail SMTP
// ============================================================

ipcMain.handle('email-report-send', async (_, { to, subject, html }) => {
  try {
    let nodemailer;
    try { nodemailer = require('nodemailer'); } catch(_e) {
      return { success: false, error: 'nodemailer non installé — npm install nodemailer' };
    }
    const gmailUser = db.prepare("SELECT value FROM settings WHERE key='email_gmail_user'").get()?.value;
    const gmailPass = db.prepare("SELECT value FROM settings WHERE key='email_gmail_pass'").get()?.value;
    if (!gmailUser || !gmailPass) return { success: false, error: 'Gmail SMTP non configuré' };
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transporter.sendMail({
      from: `"CKBPOS" <${gmailUser}>`,
      to: to || gmailUser,
      subject: subject || 'Rapport journalier CKBPOS',
      html: html || '<p>Rapport CKBPOS</p>',
    });
    console.log('[EMAIL] Rapport envoyé à', to);
    return { success: true };
  } catch(e) { console.error('[EMAIL]', e.message); return { success: false, error: e.message }; }
});

ipcMain.handle('email-config-get', () => {
  try {
    const user = db.prepare("SELECT value FROM settings WHERE key='email_gmail_user'").get()?.value || '';
    const configured = !!user && !!db.prepare("SELECT value FROM settings WHERE key='email_gmail_pass'").get()?.value;
    return { success: true, email: user, configured };
  } catch(e) { return { success: false, email: '', configured: false }; }
});

ipcMain.handle('email-config-set', (_, { gmailUser, gmailPass }) => {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('email_gmail_user',?)").run(gmailUser || '');
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('email_gmail_pass',?)").run(gmailPass || '');
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// Générer HTML rapport journalier
ipcMain.handle('email-report-build', (_, { date }) => {
  try {
    const d = date || new Date().toISOString().slice(0,10);
    const shop = db.prepare("SELECT value FROM settings WHERE key='shop_name'").get()?.value || 'CKBPOS';
    const currency = db.prepare("SELECT value FROM settings WHERE key='currency'").get()?.value || 'Kz';
    const ventes = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as tot FROM ventes WHERE date(date_vente)=? AND statut!='annule'").get(d) || { cnt:0, tot:0 };
    const annule = db.prepare("SELECT COUNT(*) as cnt FROM ventes WHERE date(date_vente)=? AND statut='annule'").get(d)?.cnt || 0;
    const topProds = db.prepare(`
      SELECT p.nom, SUM(vi.quantite) as qte, SUM(vi.sous_total) as total
      FROM vente_items vi JOIN ventes v ON vi.vente_id=v.id JOIN products p ON vi.product_id=p.id
      WHERE date(v.date_vente)=? AND v.statut!='annule'
      GROUP BY p.id ORDER BY total DESC LIMIT 5`).all(d);
    const stockAlerte = db.prepare("SELECT nom, stock_cartons FROM products WHERE actif=1 AND stock_cartons<=COALESCE(stock_alerte,2) ORDER BY stock_cartons ASC LIMIT 10").all();
    const rows = topProds.map(p => `<tr><td>${p.nom}</td><td>${Math.round(p.qte*100)/100}</td><td><strong>${Number(p.total).toLocaleString('fr-FR')} ${currency}</strong></td></tr>`).join('');
    const alertRows = stockAlerte.map(p => `<tr style="color:#cc0000"><td>${p.nom}</td><td>${Math.round(p.stock_cartons*100)/100} cx</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
<h1 style="color:#e8c547;border-bottom:2px solid #e8c547;padding-bottom:8px">${shop}</h1>
<h2 style="color:#555">Rapport journalier — ${d}</h2>
<div style="display:flex;gap:20px;margin:20px 0">
  <div style="flex:1;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center">
    <div style="font-size:28px;font-weight:bold;color:#22c55e">${ventes.cnt}</div>
    <div style="font-size:12px;color:#666">Ventes confirmées</div>
  </div>
  <div style="flex:1;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center">
    <div style="font-size:28px;font-weight:bold;color:#e8c547">${Number(ventes.tot).toLocaleString('fr-FR')} ${currency}</div>
    <div style="font-size:12px;color:#666">Chiffre d'affaires</div>
  </div>
  <div style="flex:1;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center">
    <div style="font-size:28px;font-weight:bold;color:#ef4444">${annule}</div>
    <div style="font-size:12px;color:#666">Annulées</div>
  </div>
</div>
${topProds.length ? `<h3>Top Produits</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#333;color:#fff"><th style="padding:8px;text-align:left">Produit</th><th style="padding:8px;text-align:left">Qté</th><th style="padding:8px;text-align:left">Total</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
${stockAlerte.length ? `<h3 style="color:#cc0000">\u26A0\uFE0F Stock en alerte</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#cc0000;color:#fff"><th style="padding:8px;text-align:left">Produit</th><th style="padding:8px;text-align:left">Stock</th></tr></thead><tbody>${alertRows}</tbody></table>` : ''}
<p style="color:#999;font-size:11px;margin-top:30px;border-top:1px solid #eee;padding-top:10px">CKBPOS v${APP_VERSION} — Rapport généré automatiquement</p>
</body></html>`;
    return { success: true, html, subject: `Rapport CKBPOS — ${shop} — ${d}` };
  } catch(e) { return { success: false, error: e.message }; }
});

// ============================================================
// EXPORT EXCEL — v4.5.0
// xlsx via sheetjs (xlsx package)
// ============================================================

ipcMain.handle('excel-export-sales', async (_, { date_from, date_to, user_id }) => {
  try {
    let XLSX;
    try { XLSX = require('xlsx'); } catch(_e) {
      return { success: false, error: 'xlsx non installé — npm install xlsx' };
    }
    let sql = `SELECT v.id, v.date_vente, u.nom as vendeur, v.client_nom, v.client_nif,
      v.total, v.mode_paiement, v.montant_dinheiro, v.montant_express, v.statut, v.facture_num, v.machine_id
      FROM ventes v LEFT JOIN users u ON v.user_id=u.id WHERE 1=1`;
    const params = [];
    if (date_from) { sql += ' AND date(v.date_vente)>=?'; params.push(date_from); }
    if (date_to)   { sql += ' AND date(v.date_vente)<=?'; params.push(date_to); }
    if (user_id)   { sql += ' AND v.user_id=?'; params.push(user_id); }
    sql += ' ORDER BY v.id DESC LIMIT 10000';
    const rows = db.prepare(sql).all(...params);
    const wsData = [
      ['#','Data','Vendedor','Cliente','NIF','Total','Pagamento','Numerário','Express','Status','Factura','Máquina'],
      ...rows.map(r => [r.id, r.date_vente, r.vendeur||'', r.client_nom||'', r.client_nif||'', r.total, r.mode_paiement||'', r.montant_dinheiro||0, r.montant_express||0, r.statut||'', r.facture_num||'', r.machine_id||''])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [5,16,14,20,16,10,12,10,10,10,20,14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
    const fileName = `ckbpos_vendas_${date_from||'all'}_${Date.now()}.xlsx`;
    const savePath = path.join(app.getPath('downloads'), fileName);
    XLSX.writeFile(wb, savePath);
    try { require('electron').shell.openPath(path.dirname(savePath)); } catch(_e) {}
    return { success: true, path: savePath, count: rows.length };
  } catch(e) { console.error('[EXCEL]', e.message); return { success: false, error: e.message }; }
});

ipcMain.handle('excel-export-stock', async () => {
  try {
    let XLSX;
    try { XLSX = require('xlsx'); } catch(_e) {
      return { success: false, error: 'xlsx non installé — npm install xlsx' };
    }
    const products = db.prepare(`
      SELECT p.nom, p.stock_cartons, COALESCE(p.unites,1) as unites,
        p.prix_vente, p.prix_demi, p.prix_unite,
        p.stock_alerte, p.actif,
        COALESCE((SELECT SUM(r.qty_reserved) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='active'),0) as reserved
      FROM products p WHERE p.actif=1 ORDER BY p.nom`).all();
    const wsData = [
      ['Produto','Stock (cartons)','Unidades/Caixa','Reservado','Disponível','Preço venda','Preço demi','Preço unitário','Alerta'],
      ...products.map(p => {
        const dispo = (p.stock_cartons||0) - (p.reserved||0);
        return [p.nom, p.stock_cartons||0, p.unites||1, p.reserved||0, Math.max(0,dispo), p.prix_vente||0, p.prix_demi||0, p.prix_unite||0, p.stock_alerte||2];
      })
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [22,14,14,10,10,12,12,12,8].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Stock');
    const fileName = `ckbpos_stock_${new Date().toISOString().slice(0,10)}.xlsx`;
    const savePath = path.join(app.getPath('downloads'), fileName);
    XLSX.writeFile(wb, savePath);
    try { require('electron').shell.openPath(path.dirname(savePath)); } catch(_e) {}
    return { success: true, path: savePath, count: products.length };
  } catch(e) { console.error('[EXCEL]', e.message); return { success: false, error: e.message }; }
});

// Étendre handleSyncMessage pour les messages chat
const _v4HandlerBase = global._ckbSyncHandlers.handleSyncMessage;
global._ckbSyncHandlers.handleSyncMessage = (ws, msg, peerMachineId) => {
  if (msg.type === 'CHAT_MESSAGE') handleChatMessage(msg);
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

// ── Audit login/logout (v4.2.0) ─────────────────────────────
ipcMain.handle('audit-login', (_, { user_id, user_nom, action, details }) => {
  try {
    insertAuditLog(user_id || null, user_nom || 'unknown', action || 'LOGIN', details || null);
    return { success: true };
  } catch(e) { return { success: false }; }
});


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
    const wsMsg = JSON.stringify({ type: 'CHAT_MESSAGE', from: MACHINE_ID, fromLabel: fl, to: 'all', content, ts });
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
