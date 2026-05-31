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

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1280, height:800, minWidth:1024, minHeight:700,
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
    // ✅ Fix charset UTF-8 : injecter meta charset si absent (corrige symboles/emojis cassés)
    mainWindow.webContents.executeJavaScript(`
      if (!document.querySelector('meta[charset]')) {
        const m = document.createElement('meta');
        m.setAttribute('charset', 'UTF-8');
        document.head.prepend(m);
      }
    `).catch(()=>{});
  });

  // ✅ F12 / Ctrl+Shift+I → DevTools (before-input-event — fiable sur tous les claviers)
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && (
      input.key === 'F12' ||
      (input.control && input.shift && input.key === 'I')
    )) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  if (isDev) mainWindow.loadURL('http://localhost:3000');
  else mainWindow.loadFile(path.join(__dirname,'build','index.html'));
}

app.whenReady().then(() => {
  createWindow();
  // Pré-charger les modules lourds en arrière-plan après que la fenêtre est prête
  setTimeout(() => {
    try { require('./database/driveSync'); } catch(e) {}
  }, 2000);
  // v1.4.0 — Services réseau LAN (WS + UDP) — délai pour laisser la BDD s'initialiser
  setTimeout(startNetworkServices, 1500);
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
const APP_VERSION = (() => { try { return require('./package.json').version; } catch(e) { return '1.1.3'; } })();
// ✅ Version auto depuis package.json — utilisé dans SettingsPage.js
ipcMain.handle('app-version', () => APP_VERSION);

ipcMain.handle('db-query', (_, sql, params) => {
  try {
    const stmt = db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) return { success:true, data:stmt.all(...(params||[])) };
    return { success:true, data:stmt.run(...(params||[])) };
  } catch(err) { return { success:false, error:err.message }; }
});
ipcMain.handle('db-get', (_, sql, params) => {
  try { return { success:true, data:db.prepare(sql).get(...(params||[])) }; }
  catch(err) { return { success:false, error:err.message }; }
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
      .run(icone||'📌', label, direction, est_dette||0, role||'Geral');
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
// Règle : même nom + même motivo + même date_jour → additionne le montant
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
    // ✅ Dialog pour choisir le fichier .db à restaurer
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Restaurar Backup CKBPOS',
      defaultPath: 'D:\\',
      filters: [{ name: 'Base de dados SQLite', extensions: ['db'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };

    const backupPath = result.filePaths[0];
    const dbPath     = path.join(app.getPath('userData'), 'ckbpos.db');

    // ✅ Vérifier que c'est bien une BDD CKBPOS (contient la table users)
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

    // ✅ Sauvegarder l'actuelle avant d'écraser (sécurité)
    const safetyBackup = path.join(app.getPath('userData'), 'ckbpos_before_restore_' + Date.now() + '.db');
    fs.copyFileSync(dbPath, safetyBackup);

    // ✅ Remplacer la BDD avec le fichier nettoyé et relancer l'app
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
    // ✅ Basé sur MAX(id) — séquentiel et jamais réutilisé même après annulation
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
    ];

    let applied = 0;
    let skipped = 0;
    for (const sql of migrations) {
      try { db.exec(sql); applied++; } catch(e) { skipped++; }
    }

    // ✅ Fix statut : corriger les réservations créées avec statut='active' (bug v1.1.6)
    // reservation-list filtre sur statut='pendente' — mettre à jour les anciens enregistrements
    try {
      const fixed = db.prepare("UPDATE reservations SET statut='pendente' WHERE statut='active'").run();
      if (fixed.changes > 0) console.log(`[migration] ${fixed.changes} réservations 'active' → 'pendente'`);
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

// ✅ v1.2.3 — Lire les flags de personnalisation du ticket depuis settings
function getTicketFlags() {
  const defaults = {
    showQr: true, showAddress: true, showPhone: true, showNif: true,
    showFactureNum: true, showClientNom: true, showClientNif: true,
    showSeller: true, showObrigado: true, showVersion: true, showSecondaVia: true,
    showMentionLegal: true, // ✅ Séparé de showAddress — mention légale Angola
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
              // ✅ Dialog annulé = impression abandonnée volontairement
              // On résout avec success:true pour ne pas bloquer le bouton Imprimir
              return resolve({ success: true, canceled: true });
            }
            fs.writeFileSync(result.filePath, pdfBuffer);
            // ✅ Ouvrir le PDF automatiquement après sauvegarde
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
    let qrDataUrl = '';
    if (QRCode) {
      try {
        // ✅ Contenu minimal → QR peu dense → lisible sur imprimante thermique 203dpi
        // Format : FR-NUM|TOTAL AOA|DATE|VENDEUR
        const qrText = [
          data.numeroFacture || 'N/A',
          `${data.total} ${data.currency}`,
          data.date,
          data.seller
        ].join('|');
        qrDataUrl = await QRCode.toDataURL(qrText, {
          width: 128,
          margin: 2,
          errorCorrectionLevel: 'L', // ✅ L = moins de modules = QR plus simple
          color: { dark: '#000000', light: '#ffffff' }
        });
      } catch(e) { console.log('QR error:', e.message); }
    }
    const { copiesTicket, ticketSizeMm } = getPrintSettings();
    const copies = data.copies || copiesTicket || 2;
    // ✅ v1.2.3 — Appliquer les flags de personnalisation du ticket
    const flags = getTicketFlags();
    const result = await printHTML(generateTicketHTML({ ...data, qrDataUrl, flags, ticketSizeMm }), copies, true);
    return { success: true, copies, ...(result || {}) };
  }
  catch(e) {
    // ✅ Ne jamais retourner success:false ici — ça bloquerait isPrinting.current
    console.error('[print-ticket]', e.message);
    return { success: true, error: e.message };
  }
});
ipcMain.handle('print-shift-report', async (_, data) => {
  try {
    const { copiesShift, ticketSizeMm } = getPrintSettings();
    const copies = data.copies || copiesShift || 1;
    // v1.3.0 — Résumé caderno du jour injecté automatiquement dans le ticket de fermeture
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
  // font-size 11px Courier New = ~1.8mm/char → max ~40 chars/ligne
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
  const { vendeur, dateDebut, dateFin, items, totalVentes, totalDinheiro, totalExpress, argentEnMain, argentEnvoye, note, currency, shopName, shopAddress, shopPhone, shopNif, cadernoResume, ticketSizeMm: _tMm } = data;
  const ticketW = `${_tMm || 72}mm`;
  const diffMain = argentEnMain - totalDinheiro;
  const diffExpress = argentEnvoye - totalExpress;

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
    ${filterDateFrom ? `<div><strong>Período:</strong> ${filterDateFrom} → ${filterDateTo || 'hoje'}</div>` : ''}
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
// Intercepte console.log/error/warn → envoie au renderer
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

// Peers actifs en mémoire : machine_id → { ws, machine_label, ip, lastSeen }
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
  if (!myKey) return true;      // Pas de clé configurée → mode ouvert (legacy)
  if (!receivedKey) return false; // Moi j'ai une clé, l'autre non → refus
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
            if (!networkKeyMatches(msg.network_key)) {
              console.warn('[LAN] Refusé (clé réseau différente): ' + (msg.machine_label || msg.machine_id) + ' @ ' + peerIp);
              ws.close(); return;
            }
            peerMachineId = msg.machine_id;
            // Fermer l'ancienne connexion si elle existe
            if (peersMap.has(peerMachineId)) {
              try { peersMap.get(peerMachineId).ws?.close(); } catch(_e) {}
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
        }
      });

      ws.on('error', (_e) => {
        if (peerMachineId) peersMap.delete(peerMachineId);
      });
    });

    wssServer.on('error', (e) => {
      console.error('[LAN] WS server error:', e.message);
      if (e.code === 'EADDRINUSE') console.error('[LAN] Port ' + WS_PORT + ' deja utilise — services reseau desactives.');
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
          if (!networkKeyMatches(msg.network_key)) {
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
        peersMap.delete(peerMachineId);
        broadcastPeersUpdate();
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

        // ── v1.8.0 Clé réseau — ignorer les broadcasts d'autres entreprises ──
        if (!networkKeyMatches(msg.network_key)) {
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
    return { success: true };
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
    const peers = db.prepare('SELECT * FROM network_peers ORDER BY last_seen DESC').all()
      .map(p => ({ ...p, isLocal: false, status: peersMap.has(p.machine_id) ? 'online' : 'offline' }));

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
          // Timeout : si pas de réponse depuis 15s → déconnecter
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
// Protocole : SYNC_REQUEST → SYNC_DELTA → SYNC_ACK
// Résolution conflits : last-write-wins (INSERT OR REPLACE)
// ============================================================

const SYNC_TABLES = new Set(['ventes','vente_items','products','stock_mouvements','caderno_entries']);
const SYNC_LIMIT  = 200; // entrées max par delta

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
    console.log('[SYNC] SYNC_REQUEST → ' + peerMachineId + ' (seq ' + last_seq + ')');
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('sync-status-changed', { status: 'syncing', pending: -1, online: peersMap.size }); } catch(_e) {}
    }
  } catch(e) { console.error('[SYNC] sendSyncRequest:', e.message); }
}

// ── Répondre à SYNC_REQUEST → envoyer SYNC_DELTA ───────────
function handleSyncRequest(ws, msg) {
  try {
    const { machine_id, last_seq } = msg;
    const entries = db.prepare(
      'SELECT * FROM sync_log WHERE machine_id=? AND id>? ORDER BY id LIMIT ?'
    ).all(MACHINE_ID, last_seq || 0, SYNC_LIMIT);

    if (entries.length === 0) {
      ws.send(JSON.stringify({ type: 'SYNC_DELTA', machine_id: MACHINE_ID, last_id: last_seq || 0, entries: [] }));
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
          const row = db.prepare('SELECT * FROM "' + e.table_name + '" WHERE id=?').get(e.record_id);
          // Si la ligne n'existe plus (supprimée après le log) → on envoie un DELETE
          enriched.push({ id: e.id, table_name: e.table_name, record_id: e.record_id, operation: row ? e.operation : 'DELETE', row: row || null });
        } catch(_e) {}
      } else {
        enriched.push({ id: e.id, table_name: e.table_name, record_id: e.record_id, operation: 'DELETE', row: null });
      }
    }

    const lastId = entries[entries.length - 1].id;
    ws.send(JSON.stringify({ type: 'SYNC_DELTA', machine_id: MACHINE_ID, last_id: lastId, entries: enriched }));
    console.log('[SYNC] SYNC_DELTA → ' + machine_id + ' : ' + enriched.length + ' entrees (seq ' + lastId + ')');
  } catch(e) { console.error('[SYNC] handleSyncRequest:', e.message); }
}

// ── Appliquer un SYNC_DELTA reçu ───────────────────────────
function handleSyncDelta(ws, msg) {
  try {
    const { machine_id, entries, last_id } = msg;
    const ackSeq = last_id || 0;

    if (!entries || entries.length === 0) {
      ws.send(JSON.stringify({ type: 'SYNC_ACK', machine_id: MACHINE_ID, last_seq: ackSeq }));
      return;
    }

    console.log('[SYNC] SYNC_DELTA recu de ' + machine_id + ' : ' + entries.length + ' entrees');

    // Désactiver les triggers pendant l'apply (éviter l'écho)
    db.prepare("UPDATE settings SET value='1' WHERE key='sync_applying'").run();

    let applied = 0, skipped = 0;
    try {
      db.transaction(() => {
        for (const e of entries) {
          if (!SYNC_TABLES.has(e.table_name)) { skipped++; continue; }
          try {
            if (e.operation === 'DELETE') {
              db.prepare('DELETE FROM "' + e.table_name + '" WHERE id=?').run(e.record_id);
            } else if (e.row && typeof e.row === 'object') {
              const cols = Object.keys(e.row).map(c => '"' + c + '"').join(',');
              const phs  = Object.keys(e.row).map(() => '?').join(',');
              db.prepare('INSERT OR REPLACE INTO "' + e.table_name + '" (' + cols + ') VALUES (' + phs + ')').run(...Object.values(e.row));
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
      try { mainWindow.webContents.send('sync-status-changed', { status: applied > 0 ? 'synced' : 'idle', pending: 0, online: peersMap.size, applied }); } catch(_e) {}
    }
    updateSyncStatus();
  } catch(e) {
    console.error('[SYNC] handleSyncDelta:', e.message);
    try { db.prepare("UPDATE settings SET value='0' WHERE key='sync_applying'").run(); } catch(_e2) {}
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
  if      (msg.type === 'SYNC_REQUEST') handleSyncRequest(ws, msg);
  else if (msg.type === 'SYNC_DELTA')   handleSyncDelta(ws, msg);
  else if (msg.type === 'SYNC_ACK')     handleSyncAck(msg);
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
// SUPABASE CLOUD BRIDGE — v1.7.0
// Sync bidirectionnel cloud via Supabase (REST + Realtime)
// Config : settings → supabase_url + supabase_key
// Table Supabase requise : cloud_sync_log (voir SQL ci-dessous)
// ============================================================

let _supabase     = null; // client Supabase actif
let _supaChannel  = null; // canal Realtime
let _cloudStatus  = { status: 'disconnected', lastSync: null, error: null };
let _cloudPushBusy = false;

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
        try { row_data = db.prepare('SELECT * FROM "' + e.table_name + '" WHERE id=?').get(e.record_id) || null; } catch(_e) {}
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
        const cols = Object.keys(entry.row_data).map(c => '"' + c + '"').join(',');
        const phs  = Object.keys(entry.row_data).map(() => '?').join(',');
        db.prepare('INSERT OR REPLACE INTO "' + entry.table_name + '" (' + cols + ') VALUES (' + phs + ')').run(...Object.values(entry.row_data));
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
          // Le REST API + polling 60s fonctionnent toujours → statut 'connected' maintenu
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
  if (!_supabase) return;
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
    // Push cloud toutes les 60s si connecté
    setInterval(async () => {
      if (_supabase) await pushToCloud();
    }, 60000);
  }, 3000); // délai après démarrage LAN
});

// Nettoyage Supabase à la fermeture
app.on('before-quit', () => {
  if (_supaChannel) { try { _supabase?.removeChannel(_supaChannel); } catch(_e) {} }
});
