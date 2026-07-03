const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ── Database Encryption (AES-256-GCM au repos) ──
let _dbPath, _machineIdForEnc;
try {
  const enc = require('../scripts/db-encryption');
  // On ne peut pas déchiffrer ici car on n'a pas encore le machine_id
  // On stocke le path pour déchiffrer plus tard
  _dbPath = null; // défini plus bas
  module.exports._decryptIfNeeded = enc.decryptDbIfNeeded;
  module.exports._encryptOnExit = enc.encryptDbOnExit;
} catch(_e) {
  module.exports._decryptIfNeeded = () => {};
  module.exports._encryptOnExit = () => {};
}

// ── Générer un UUID v4 simple sans dépendance externe ──
function generateUUID() {
  return crypto.randomBytes(16).toString('hex').replace(
    /(.{8})(.{4})(.{4})(.{4})(.{12})/,
    '$1-$2-$3-$4-$5'
  );
}

const dbPath = app
  ? path.join(app.getPath('userData'), 'ckbpos.db')
  : path.join(__dirname, 'ckbpos.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','vendeur')),
    password_hash TEXT NOT NULL,
    pin TEXT,
    actif INTEGER DEFAULT 1,
    peut_modifier_factures INTEGER DEFAULT 0,
    question_secreta TEXT,
    resposta_secreta TEXT,
    tentativas_login INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','utc')),
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    categorie TEXT DEFAULT 'General',
    prix_carton REAL NOT NULL,
    prix_demi REAL,
    prix_unite REAL,
    prix_demi_manual INTEGER DEFAULT 0,
    prix_unite_manual INTEGER DEFAULT 0,
    cout_carton REAL DEFAULT 0,
    unites_par_carton INTEGER DEFAULT 1,
    stock_cartons REAL DEFAULT 0,
    stock_alerte REAL DEFAULT 2,
    has_variants INTEGER DEFAULT 0,
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','utc')),
    updated_at TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    prix_carton REAL,
    prix_demi REAL,
    prix_unite REAL,
    stock_cartons REAL DEFAULT 0,
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','utc')),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS stock_mouvements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('entree','sortie','ajuste','vente','retour')),
    type_mesure TEXT DEFAULT 'carton',
    quantite REAL NOT NULL,
    quantite_cartons REAL NOT NULL,
    stock_avant REAL NOT NULL,
    stock_apres REAL NOT NULL,
    motif TEXT,
    note TEXT,
    date_mouvement TEXT DEFAULT (datetime('now','utc')),
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS historique_modifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    table_name TEXT NOT NULL,
    record_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    date_action TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    telephone TEXT,
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS ventes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    client_id INTEGER,
    client_nom TEXT,
    total REAL NOT NULL,
    montant_recu REAL DEFAULT 0,
    monnaie_rendue REAL DEFAULT 0,
    mode_paiement TEXT DEFAULT 'dinheiro',
    montant_dinheiro REAL DEFAULT 0,
    montant_express REAL DEFAULT 0,
    statut TEXT DEFAULT 'normal',
    date_vente TEXT DEFAULT (datetime('now','utc')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS vente_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vente_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    type_vente TEXT NOT NULL CHECK(type_vente IN ('carton','demi','unite')),
    quantite REAL NOT NULL,
    prix_unitaire REAL NOT NULL,
    sous_total REAL NOT NULL,
    statut TEXT DEFAULT 'normal',
    FOREIGN KEY(vente_id) REFERENCES ventes(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    debut TEXT DEFAULT (datetime('now','utc')),
    fin TEXT,
    total_ventes REAL DEFAULT 0,
    total_dinheiro REAL DEFAULT 0,
    total_express REAL DEFAULT 0,
    argent_en_main REAL DEFAULT 0,
    argent_envoye REAL DEFAULT 0,
    note TEXT,
    actif INTEGER DEFAULT 1,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ── Migrateur versionné (schema_version table) ────────────────
db.exec("CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL DEFAULT 0)");
const _sv = db.prepare("SELECT version FROM schema_version WHERE id = 1").get();
let _currentVersion = _sv ? _sv.version : 0;
if (!_sv) db.prepare("INSERT INTO schema_version (id, version) VALUES (1, 0)").run();

const _migrations = [
  // ── Base (pre-v1.0.9) ──
  { v: 1,  sql: "ALTER TABLE products ADD COLUMN prix_demi REAL" },
  { v: 2,  sql: "ALTER TABLE products ADD COLUMN prix_unite REAL" },
  { v: 3,  sql: "ALTER TABLE products ADD COLUMN prix_demi_manual INTEGER DEFAULT 0" },
  { v: 4,  sql: "ALTER TABLE products ADD COLUMN prix_unite_manual INTEGER DEFAULT 0" },
  { v: 5,  sql: "ALTER TABLE products ADD COLUMN stock_alerte REAL DEFAULT 2" },
  { v: 6,  sql: "ALTER TABLE products ADD COLUMN has_variants INTEGER DEFAULT 0" },
  { v: 7,  sql: "ALTER TABLE ventes ADD COLUMN client_id INTEGER" },
  { v: 8,  sql: "ALTER TABLE ventes ADD COLUMN client_nom TEXT" },
  { v: 9,  sql: "ALTER TABLE ventes ADD COLUMN statut TEXT DEFAULT 'normal'" },
  { v: 10, sql: "ALTER TABLE ventes ADD COLUMN mode_paiement TEXT DEFAULT 'dinheiro'" },
  { v: 11, sql: "ALTER TABLE ventes ADD COLUMN montant_dinheiro REAL DEFAULT 0" },
  { v: 12, sql: "ALTER TABLE ventes ADD COLUMN montant_express REAL DEFAULT 0" },
  { v: 13, sql: "ALTER TABLE vente_items ADD COLUMN statut TEXT DEFAULT 'normal'" },
  { v: 14, sql: "ALTER TABLE vente_items ADD COLUMN variant_id INTEGER" },
  { v: 15, sql: "ALTER TABLE users ADD COLUMN peut_modifier_factures INTEGER DEFAULT 0" },
  { v: 16, sql: "ALTER TABLE users ADD COLUMN question_secreta TEXT" },
  { v: 17, sql: "ALTER TABLE users ADD COLUMN resposta_secreta TEXT" },
  { v: 18, sql: "ALTER TABLE users ADD COLUMN tentativas_login INTEGER DEFAULT 0" },
  { v: 19, sql: "ALTER TABLE shifts ADD COLUMN total_dinheiro REAL DEFAULT 0" },
  { v: 20, sql: "ALTER TABLE shifts ADD COLUMN total_express REAL DEFAULT 0" },
  { v: 21, sql: "ALTER TABLE shifts ADD COLUMN argent_en_main REAL DEFAULT 0" },
  { v: 22, sql: "ALTER TABLE shifts ADD COLUMN argent_envoye REAL DEFAULT 0" },
  { v: 23, sql: "ALTER TABLE shifts ADD COLUMN note TEXT" },
  { v: 24, sql: "ALTER TABLE stock_mouvements ADD COLUMN variant_id INTEGER" },
  { v: 25, sql: "ALTER TABLE stock_mouvements ADD COLUMN type_mesure TEXT DEFAULT 'carton'" },
  { v: 26, sql: "ALTER TABLE stock_mouvements ADD COLUMN quantite_cartons REAL" },
  { v: 27, sql: "ALTER TABLE stock_mouvements ADD COLUMN motif TEXT" },
  // ── v1.0.9 ──
  { v: 28, sql: "ALTER TABLE ventes ADD COLUMN client_nif TEXT DEFAULT 'CONSUMIDOR FINAL'" },
  { v: 29, sql: "ALTER TABLE ventes ADD COLUMN facture_num TEXT" },
  { v: 30, sql: "ALTER TABLE ventes ADD COLUMN reservation_id INTEGER" },
  { v: 31, sql: "ALTER TABLE users ADD COLUMN pin TEXT" },
  // ── v1.1.2 ──
  { v: 32, sql: "ALTER TABLE ventes ADD COLUMN machine_id TEXT DEFAULT 'LOCAL'" },
  // ── v1.2.3 — code-barres produits ──
  { v: 33, sql: "ALTER TABLE products ADD COLUMN barcode TEXT" },
  // ── Caderno catégories de dépenses ──
  { v: 34, sql: "ALTER TABLE caderno_entries ADD COLUMN categorie_depense TEXT DEFAULT NULL" },
  // ── Stock prix d'achat variable + fournisseur ──
  { v: 35, sql: "ALTER TABLE stock_mouvements ADD COLUMN cout_entree REAL DEFAULT 0" },
  { v: 36, sql: "ALTER TABLE stock_mouvements ADD COLUMN fournisseur TEXT DEFAULT ''" },
  // ── v4.9.5 — UUID cross-machine pour ventes (dedup LAN) ──
  { v: 37, sql: "ALTER TABLE ventes ADD COLUMN uuid TEXT" },
];

for (const m of _migrations) {
  if (m.v > _currentVersion) {
    try { db.exec(m.sql); } catch(e) {}
  }
}
db.prepare("UPDATE schema_version SET version = ? WHERE id = 1").run(_migrations[_migrations.length - 1].v);
console.log('[CKBPOS] schema_version migré vers', _migrations[_migrations.length - 1].v);

// Backfill UUID pour ventes existantes sans uuid
try {
  const orphanVentes = db.prepare("SELECT id FROM ventes WHERE uuid IS NULL OR uuid = ''").all();
  if (orphanVentes.length > 0) {
    const backfill = db.prepare("UPDATE ventes SET uuid = ? WHERE id = ?");
    for (const v of orphanVentes) { backfill.run(generateUUID(), v.id); }
    console.log('[CKBPOS] ' + orphanVentes.length + ' ventes sans uuid → UUID générés');
  }
} catch(e) {}

// ── Tables v1.0.9 (CREATE IF NOT EXISTS = safe sur toute DB) ──
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

// ── Tables Caderno de Caixa v1.2.7 ──────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS caderno_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    motivo TEXT NOT NULL,
    montant REAL DEFAULT 0,
    montant_raw TEXT DEFAULT '',
    note TEXT DEFAULT '',
    direction TEXT NOT NULL CHECK(direction IN ('entree','sortie','perte')),
    est_dette INTEGER DEFAULT 0,
    statut_dette TEXT DEFAULT NULL CHECK(statut_dette IN ('pendente','pago') OR statut_dette IS NULL),
    date_pago TEXT DEFAULT NULL,
    user_id INTEGER NOT NULL,
    machine_id TEXT DEFAULT 'LOCAL',
    date_jour TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','utc')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS caderno_trabalhadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS caderno_produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS caderno_motivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE,
    icone TEXT DEFAULT '\u{1F4CC}',
    direction TEXT NOT NULL CHECK(direction IN ('entree','sortie','perte')),
    est_dette INTEGER DEFAULT 0,
    role TEXT DEFAULT 'Geral' CHECK(role IN ('Geral','Admin')),
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','utc'))
  );
`);

// ── Motivos par défaut — catégories professionnelles (INSERT OR IGNORE = safe) ──
[
  // Entrées
  ['\u{1F4E6}', 'Produto não registrado', 'entree', 0, 'Geral'],
  ['\u{1F4B5}', 'Kilape remboursado',    'entree', 0, 'Geral'],
  ['\u{1F4E5}', 'Outra entrada',         'entree', 0, 'Geral'],
  // Dépenses — catégories professionnelles
  ['\u{1F37D}', 'Almoço / Repas',        'sortie', 0, 'Geral'],
  ['\u{1F697}', 'Transport / Livraison', 'sortie', 0, 'Geral'],
  ['\u{1F4A1}', 'Électricité',           'sortie', 0, 'Geral'],
  ['\u{1F310}', 'Internet',              'sortie', 0, 'Geral'],
  ['\u{1F4A7}', 'Eau',                   'sortie', 0, 'Geral'],
  ['\u{1F4F1}', 'Téléphone / Crédit',    'sortie', 0, 'Geral'],
  ['\u{1F4C4}', 'Fournitures',           'sortie', 0, 'Geral'],
  ['\u{1F527}', 'Réparation / Maintenance','sortie', 0, 'Geral'],
  ['\u{1F4B0}', 'Salaires',              'sortie', 0, 'Admin'],
  ['\u{1F4E6}', 'Achat de stock',        'sortie', 0, 'Admin'],
  ['\u{1F3F7}', 'Divers',                'sortie', 0, 'Geral'],
  // Dettes
  ['\u{1F4B8}', 'Kilape (dette)',         'sortie', 1, 'Geral'],
  // Pertes
  ['\u26A0',    'Sem pagar / Perte',      'perte',  1, 'Geral'],
].forEach(([icone, label, direction, est_dette, role]) => {
  db.prepare('INSERT OR IGNORE INTO caderno_motivos (icone,label,direction,est_dette,role) VALUES (?,?,?,?,?)')
    .run(icone, label, direction, est_dette, role);
});

// Migrations post-CREATE (doivent venir apres la creation des tables)
[
  "ALTER TABLE reservations ADD COLUMN machine_id TEXT DEFAULT 'LOCAL'",
  // ── v1.1.5 — colonnes reservations manquantes sur anciennes BDD ──
  "ALTER TABLE reservations ADD COLUMN items_json TEXT",
  "ALTER TABLE reservations ADD COLUMN mode_paiement TEXT DEFAULT 'dinheiro'",
  "ALTER TABLE reservations ADD COLUMN montant_dinheiro REAL DEFAULT 0",
  "ALTER TABLE reservations ADD COLUMN montant_express REAL DEFAULT 0",
  "ALTER TABLE reservations ADD COLUMN expiration TEXT",
  "ALTER TABLE reservations ADD COLUMN vente_id INTEGER",
  "ALTER TABLE reservations ADD COLUMN created_at TEXT DEFAULT (datetime('now','utc'))",
].forEach(sql => { try { db.exec(sql); } catch(e){} });

// \u2705 Fix v1.1.7 — corriger les réservations créées avec statut='active' (bug)
// reservation-list filtre sur statut='pendente' \u2192 les anciennes réservations étaient invisibles
try {
  const fixed = db.prepare("UPDATE reservations SET statut='pendente' WHERE statut='active'").run();
  if (fixed.changes > 0) console.log(`[CKBPOS] ${fixed.changes} réservations 'active' \u2192 'pendente' corrigées`);
} catch(e) {}

// Admin par defaut
const adminExists = db.prepare("SELECT id FROM users WHERE role='admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (nom,email,role,password_hash,peut_modifier_factures,tentativas_login) VALUES (?,?,'admin',?,1,0)")
    .run('Administrador','admin@ckbpos.com',hash);
}
// Forcer le reset du mot de passe admin par défaut au prochain login
try {
  db.prepare("UPDATE users SET tentativas_login = 0, last_login = NULL WHERE email = 'admin@ckbpos.com' AND password_hash = ?")
    .run(bcrypt.hashSync('admin123', 10));
} catch(e) {}

// Settings par defaut — incluant les nouveaux champs loja
[
  ['shop_name',    'Minha Loja'],
  ['shop_address', ''],
  ['shop_phone',   ''],
  ['shop_nif',     ''],
  ['currency',     'AOA'],
  ['app_language', 'pt-BR'],
  ['drive_connected', '0'],
  ['facture_seq',            '0'],
  ['printer_name',           ''],
  ['printer_copies_ticket',  '2'],
  ['printer_copies_shift',   '1'],
  // ── v1.1.2 ──────────────────────────────────────────────
  ['machine_id',     ''],
  ['machine_label',  'Caixa Principal'],
  ['network_key',    ''],
  ['printer_mode',   'local'],
  ['printer_machine_id', ''],
  ['coordinator_id',    ''],
  ['coordinator_label', ''],
  ['setup_done',     '0'],         // v3.4 — 0=première fois, 1=configuré
  ['remember_session','0'],        // v3.4 — session persistante
].forEach(([k,v]) => db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(k,v));

// ── Générer machine_id si absent ou vide ──────────────────
const machineIdRow = db.prepare("SELECT value FROM settings WHERE key='machine_id'").get();
if (!machineIdRow || !machineIdRow.value || machineIdRow.value.trim() === '') {
  const newId = generateUUID();
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('machine_id',?)").run(newId);
  console.log('[CKBPOS] Nouveau machine_id généré:', newId);
}

// network_key générée lors du setup-complete (pas auto-générée au démarrage)

// ── Tables réseau v1.4.0 ─────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS network_peers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id    TEXT UNIQUE NOT NULL,
    machine_label TEXT,
    ip            TEXT,
    port          INTEGER DEFAULT 41234,
    last_seen     TEXT,
    actif         INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS sync_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id  INTEGER,
    operation  TEXT NOT NULL,
    payload    TEXT,
    machine_id TEXT,
    synced_to  TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS sync_state (
    machine_id   TEXT PRIMARY KEY,
    last_sync_at TEXT,
    last_seq     INTEGER DEFAULT 0
  );
`);

// ── Settings sync v1.5.0 ─────────────────────────────────
// sync_applying = '1' désactive les triggers pendant l'apply d'un delta reçu
db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('sync_applying','0')").run();
// Reset au démarrage (protection si crash pendant un sync précédent)
db.prepare("UPDATE settings SET value='0' WHERE key='sync_applying'").run();

// ── Triggers SQLite — sync delta v1.5.0 ─────────────────
// Tables trackées : ventes · vente_items · products · stock_mouvements · caderno_entries
// WHEN clause : skip si sync_applying='1' pour éviter l'écho lors de l'apply d'un delta reçu
[
  // ventes
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_ventes AFTER INSERT ON ventes
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('ventes',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_ventes AFTER UPDATE ON ventes
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('ventes',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_del_ventes AFTER DELETE ON ventes
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('ventes',OLD.id,'DELETE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // vente_items
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_vente_items AFTER INSERT ON vente_items
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('vente_items',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_vente_items AFTER UPDATE ON vente_items
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('vente_items',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_del_vente_items AFTER DELETE ON vente_items
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('vente_items',OLD.id,'DELETE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // products
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_products AFTER INSERT ON products
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('products',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_products AFTER UPDATE ON products
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('products',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_del_products AFTER DELETE ON products
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('products',OLD.id,'DELETE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // stock_mouvements (INSERT uniquement — jamais modifiés/supprimés)
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_stock_mouvements AFTER INSERT ON stock_mouvements
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('stock_mouvements',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // caderno_entries
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_caderno_entries AFTER INSERT ON caderno_entries
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_entries',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_caderno_entries AFTER UPDATE ON caderno_entries
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_entries',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_del_caderno_entries AFTER DELETE ON caderno_entries
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_entries',OLD.id,'DELETE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // ── users — v1.8.1 : sync des utilisateurs entre machines ──
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_users AFTER INSERT ON users
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('users',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_users AFTER UPDATE ON users
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('users',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // ── caderno_motivos/trabalhadores/produtos — v3.4 ──────────
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_caderno_motivos AFTER INSERT ON caderno_motivos
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_motivos',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_caderno_motivos AFTER UPDATE ON caderno_motivos
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_motivos',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_caderno_trabalhadores AFTER INSERT ON caderno_trabalhadores
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_trabalhadores',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_caderno_trabalhadores AFTER UPDATE ON caderno_trabalhadores
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_trabalhadores',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_caderno_produtos AFTER INSERT ON caderno_produtos
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_produtos',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_caderno_produtos AFTER UPDATE ON caderno_produtos
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_produtos',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // ── settings globaux — v1.9.1 (recréé si manquant — migration) ──
  // Clés locales exclues : machine_id, machine_label, network_key, supabase_url/key,
  //                        cloud_last_seq, sync_applying, printer_mode, printer_machine_id
  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_settings AFTER UPDATE ON settings
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   AND NEW.key NOT IN ('machine_id','machine_label','network_key','supabase_url','supabase_key','cloud_last_seq','sync_applying','printer_mode','printer_machine_id')
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('settings',NEW.rowid,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_settings AFTER INSERT ON settings
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   AND NEW.key NOT IN ('machine_id','machine_label','network_key','supabase_url','supabase_key','cloud_last_seq','sync_applying','printer_mode','printer_machine_id')
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('settings',NEW.rowid,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,

].forEach(sql => { try { db.exec(sql); } catch(e) { console.error('[DB] trigger:', e.message); } });

// ── Tables v3.0 — Coordinateur + Stock Lock + Print Queue ──
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_reservations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id TEXT UNIQUE NOT NULL,
    product_id     INTEGER NOT NULL,
    variant_id     INTEGER,
    qty_reserved   REAL NOT NULL,
    machine_id     TEXT NOT NULL,
    status         TEXT DEFAULT 'active' CHECK(status IN ('active','released','expired','consumed')),
    created_at     TEXT DEFAULT (datetime('now','utc')),
    expires_at     TEXT NOT NULL,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS print_queue (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id         TEXT UNIQUE NOT NULL,
    print_type     TEXT NOT NULL,
    data_json      TEXT NOT NULL,
    priority       INTEGER DEFAULT 5,
    status         TEXT DEFAULT 'queued' CHECK(status IN ('queued','printing','done','failed')),
    machine_source TEXT NOT NULL,
    error          TEXT,
    created_at     TEXT DEFAULT (datetime('now','utc')),
    done_at        TEXT
  );
  CREATE TABLE IF NOT EXISTS coordinator_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id     TEXT NOT NULL,
    event          TEXT NOT NULL,
    created_at     TEXT DEFAULT (datetime('now','utc'))
  );
`);

// Nettoyer les réservations expirées et jobs anciens au démarrage
try {
  db.prepare("UPDATE stock_reservations SET status='expired' WHERE status='active' AND expires_at < datetime('now','utc')").run();
  db.prepare("DELETE FROM print_queue WHERE status IN ('done','failed') AND created_at < datetime('now','-1 day')").run();
} catch(_e) {}

// Settings coordinateur
db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('coordinator_id','')").run();
db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('coordinator_label','')").run();

// ── Export ───────────────────────────────────────────────
// ── Migration v3.4 : forcer recréation triggers settings si absents ──
// Nécessaire pour les DBs créées avant v1.9.1 qui n'ont pas ces triggers
try {
  const hasTrigger = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_sync_upd_settings'").get();
  if (!hasTrigger) {
    console.log('[DB] Migration v3.4 : création triggers settings globaux');
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_sync_upd_settings AFTER UPDATE ON settings
      WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
      AND NEW.key NOT IN ('machine_id','machine_label','network_key','supabase_url','supabase_key','cloud_last_seq','sync_applying','printer_mode','printer_machine_id','coordinator_id','coordinator_label','setup_done','remember_session','fundo_caixa_hoje','fundo_caixa_date')
      BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
      VALUES('settings',NEW.rowid,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_ins_settings AFTER INSERT ON settings
      WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
      AND NEW.key NOT IN ('machine_id','machine_label','network_key','supabase_url','supabase_key','cloud_last_seq','sync_applying','printer_mode','printer_machine_id','coordinator_id','coordinator_label','setup_done','remember_session','fundo_caixa_hoje','fundo_caixa_date')
      BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
      VALUES('settings',NEW.rowid,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END;
    `);
  }
} catch(e) { console.error('[DB] Migration triggers settings:', e.message); }

// ── Settings fundo de caixa (local, non-sync) ─────────────
try {
  db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('fundo_caixa_hoje','0')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('fundo_caixa_date','')").run();
} catch(_e) {}

const MACHINE_ID_FINAL = db.prepare("SELECT value FROM settings WHERE key='machine_id'").get()?.value || 'UNKNOWN';
module.exports = db;
module.exports.MACHINE_ID = MACHINE_ID_FINAL;
