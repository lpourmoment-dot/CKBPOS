const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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

// Migrations
[
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
  // ── v1.0.9 ──────────────────────────────────────────────
  "ALTER TABLE ventes ADD COLUMN client_nif TEXT DEFAULT 'CONSUMIDOR FINAL'",
  "ALTER TABLE ventes ADD COLUMN facture_num TEXT",
  "ALTER TABLE ventes ADD COLUMN reservation_id INTEGER",
  "ALTER TABLE users ADD COLUMN pin TEXT",
  // ── v1.1.2 ──────────────────────────────────────────────
  "ALTER TABLE ventes ADD COLUMN machine_id TEXT DEFAULT 'LOCAL'",
  // ── v1.2.3 — code-barres produits ───────────────────────
  "ALTER TABLE products ADD COLUMN barcode TEXT",
].forEach(sql => { try { db.exec(sql); } catch(e){} });

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

// ✅ Fix v1.1.7 — corriger les réservations créées avec statut='active' (bug)
// reservation-list filtre sur statut='pendente' → les anciennes réservations étaient invisibles
try {
  const fixed = db.prepare("UPDATE reservations SET statut='pendente' WHERE statut='active'").run();
  if (fixed.changes > 0) console.log(`[CKBPOS] ${fixed.changes} réservations 'active' → 'pendente' corrigées`);
} catch(e) {}

// Admin par defaut
const adminExists = db.prepare("SELECT id FROM users WHERE role='admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (nom,email,role,password_hash,peut_modifier_factures) VALUES (?,?,'admin',?,1)")
    .run('Administrador','admin@ckbpos.com',hash);
}

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
  ['machine_id',     ''],   // UUID unique par installation — généré ci-dessous
  ['machine_label',  'Caixa Principal'], // Nom affiché pour cette machine
].forEach(([k,v]) => db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(k,v));

// ── Générer machine_id si absent ou vide ──────────────────
// Chaque installation reçoit un UUID unique et permanent.
// Utilisé pour : préfixe facture, identification LAN v2.0.0
const machineIdRow = db.prepare("SELECT value FROM settings WHERE key='machine_id'").get();
if (!machineIdRow || !machineIdRow.value || machineIdRow.value.trim() === '') {
  const newId = generateUUID();
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('machine_id',?)").run(newId);
  console.log('[CKBPOS] Nouveau machine_id généré:', newId);
}

// ── Export ───────────────────────────────────────────────
const MACHINE_ID_FINAL = db.prepare("SELECT value FROM settings WHERE key='machine_id'").get()?.value || 'UNKNOWN';
module.exports = db;
module.exports.MACHINE_ID = MACHINE_ID_FINAL;
