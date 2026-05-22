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

  // ✅ F12 → DevTools (debug sur app compilée)
  app.whenReady().then(() => {
    globalShortcut.register('F12', () => {
      if (mainWindow) mainWindow.webContents.toggleDevTools();
    });
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
  return { printerName, copiesTicket, copiesShift };
}

function printHTML(html, copies = 1, isTicket = false) {
  return new Promise((resolve, reject) => {
    const { printerName } = getPrintSettings();
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
            // ── Chemin PDF : printToPDF avec dimensions 72mm ──────
            const pdfBuffer = await win.webContents.printToPDF({
              printBackground: true,
              pageSize: { width: 72100, height: 400000 },
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
            printOptions.pageSize = { width: 72100, height: 400000 };
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
                  if (isTicket) fallbackOpts.pageSize = { width: 72100, height: 400000 };
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
        // ✅ QR enrichi : toutes les infos de la facture
        const qrData = {
          loja: data.shopName,
          nif: data.shopNif || '',
          factura: data.numeroFacture || '',
          data: data.date,
          vendedor: data.seller,
          cliente: data.clientNom || 'CONSUMIDOR FINAL',
          produtos: (data.items || []).map(i => `${i.name} x${i.qty} = ${i.subtotal}`).join(' | '),
          total: `${data.total} ${data.currency}`,
        };
        qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
          width: 120, margin: 1,
          color: { dark:'#000000', light:'#ffffff' },
          errorCorrectionLevel: 'M'
        });
      } catch(e) { console.log('QR error:', e.message); }
    }
    const { copiesTicket } = getPrintSettings();
    const copies = data.copies || copiesTicket || 2;
    const result = await printHTML(generateTicketHTML({ ...data, qrDataUrl }), copies, true);
    // ✅ Toujours success:true — même si PDF dialog annulé ou erreur impression
    // Le bouton Imprimir se débloque toujours après l'appel
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
    const { copiesShift } = getPrintSettings();
    const copies = data.copies || copiesShift || 1;
    await printHTML(generateShiftHTML(data), copies);
    return { success: true, copies };
  }
  catch(e) { return { success:false, error:e.message }; }
});
ipcMain.handle('print-produtos-report', async (_, data) => {
  try {
    const isTicket = data.format === 'ticket';
    const html = isTicket ? generateProdutosTicketHTML(data) : generateProdutosHTML(data);
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
    const html = isTicket ? generateHistoriqueTicketHTML(data) : generateHistoriqueHTML(data);
    await printHTML(html, 1, isTicket);
    return { success: true };
  } catch(e) {
    console.error('[print-historique-report] ERREUR:', e.message);
    return { success: false, error: e.message };
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
    segundaVia // ✅ true = réimpression → affiche "2ème exemplaire — Segunda via"
  } = data;

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
    @page { size: 72mm auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 72mm;
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
    ${shopNif ? `Contribuinte Nº ${shopNif}<br>` : ''}
    ${shopPhone ? `Tel: ${shopPhone}<br>` : ''}
    ${shopAddress ? `${shopAddress}` : ''}
  </div>

  <div class="sep-solid"></div>

  <div class="factura-title">FACTURA RECIBO</div>
  ${frNum ? `<div class="fr-num">${frNum}</div>` : ''}
  <div class="original">${segundaVia ? '2ème exemplaire — Segunda via' : 'Original'}</div>

  <div class="sep-dash"></div>

  <div class="meta-line">
    <div>Cliente: ${clientDisplay}</div>
    <div>NIF: ${nifDisplay}</div>
    <div>Data e Hora: ${date}</div>
    <div>Vendedor: ${seller.toUpperCase()}</div>
  </div>

  ${shopAddress ? `<div class="mention-legal">Os bens/Serviços foram colocados à disposição do adquirente na data do documento: ${shopAddress}.</div>` : ''}

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
    OBRIGADO PELA SUA COMPRA!<br>
    CKBPOS v${APP_VERSION}
  </div>

  ${qrDataUrl ? `
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
  const { shopName, ventes, total, currency, filterUser, filterDateFrom, filterDateTo, printedAt } = data;

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
    @page { size: 72mm auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      width: 72mm;
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
  const { vendeur, dateDebut, dateFin, items, totalVentes, totalDinheiro, totalExpress, argentEnMain, argentEnvoye, note, currency, shopName, shopAddress, shopPhone, shopNif } = data;
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
    @page { size: 72mm auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      width: 72mm;
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
  const { shopName, produtos, currency, filterUser, filterDateFrom, filterDateTo, printedAt } = data;
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
    @page { size: 72mm auto; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; font-weight:700; }
    body { font-family: 'Courier New', Courier, monospace; font-size:10px; width:72mm; padding:4mm 2mm; color:#000; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
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
