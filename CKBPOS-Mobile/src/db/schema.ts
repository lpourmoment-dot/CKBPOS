export const INITIAL_SCHEMA = `
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
    client_nif TEXT DEFAULT 'CONSUMIDOR FINAL',
    facture_num TEXT,
    reservation_id INTEGER,
    machine_id TEXT DEFAULT 'LOCAL',
    uuid TEXT,
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
    machine_id TEXT DEFAULT 'LOCAL',
    items_json TEXT,
    mode_paiement TEXT DEFAULT 'dinheiro',
    montant_dinheiro REAL DEFAULT 0,
    montant_express REAL DEFAULT 0,
    expiration TEXT,
    vente_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','utc')),
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
    categorie_depense TEXT DEFAULT NULL,
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
    prix REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS caderno_motivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE,
    icone TEXT DEFAULT '📌',
    direction TEXT NOT NULL CHECK(direction IN ('entree','sortie','perte')),
    est_dette INTEGER DEFAULT 0,
    role TEXT DEFAULT 'Geral' CHECK(role IN ('Geral','Admin')),
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id INTEGER,
    operation TEXT NOT NULL,
    payload TEXT,
    machine_id TEXT,
    synced_to TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','utc'))
  );
  CREATE TABLE IF NOT EXISTS sync_state (
    machine_id TEXT PRIMARY KEY,
    last_sync_at TEXT,
    last_seq INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 0
  );
`;

// Triggers SQLite — sync delta pour cloud sync
// Identiques aux triggers Desktop (sync_log INSERT/UPDATE/DELETE)
// WHEN clause : skip si sync_applying='1' pour éviter l'écho lors de l'apply
export const SYNC_TRIGGERS = [
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

  // stock_mouvements (INSERT uniquement)
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

  // users
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_users AFTER INSERT ON users
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('users',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_users AFTER UPDATE ON users
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('users',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // caderno_motivos
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_caderno_motivos AFTER INSERT ON caderno_motivos
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_motivos',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_caderno_motivos AFTER UPDATE ON caderno_motivos
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_motivos',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // caderno_trabalhadores
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_caderno_trabalhadores AFTER INSERT ON caderno_trabalhadores
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_trabalhadores',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_caderno_trabalhadores AFTER UPDATE ON caderno_trabalhadores
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_trabalhadores',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // caderno_produtos
  `CREATE TRIGGER IF NOT EXISTS trg_sync_ins_caderno_produtos AFTER INSERT ON caderno_produtos
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_produtos',NEW.id,'INSERT',(SELECT value FROM settings WHERE key='machine_id')); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_upd_caderno_produtos AFTER UPDATE ON caderno_produtos
   WHEN (SELECT value FROM settings WHERE key='sync_applying')!='1'
   BEGIN INSERT INTO sync_log(table_name,record_id,operation,machine_id)
   VALUES('caderno_produtos',NEW.id,'UPDATE',(SELECT value FROM settings WHERE key='machine_id')); END`,

  // settings globaux (exclure les clés locales)
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
];

export const DEFAULT_SETTINGS: [string, string][] = [
  ['shop_name', 'Minha Loja'],
  ['shop_address', ''],
  ['shop_phone', ''],
  ['shop_nif', ''],
  ['currency', 'AOA'],
  ['app_language', 'pt-BR'],
  ['machine_id', ''],
  ['machine_label', 'Caixa Principal'],
  ['network_key', ''],
  ['printer_name', ''],
  ['printer_copies_ticket', '2'],
  ['printer_copies_shift', '1'],
  ['setup_done', '0'],
  ['ticket_size_mm', '72'],
  ['supabase_url', ''],
  ['supabase_key', ''],
  ['cloud_last_seq', '0'],
];

export const DEFAULT_MOTIVOS: [string, string, string, number, string][] = [
  ['📦', 'Produto não registrado', 'entree', 0, 'Geral'],
  ['💵', 'Kilape remboursado', 'entree', 0, 'Geral'],
  ['📥', 'Outra entrada', 'entree', 0, 'Geral'],
  ['🍽', 'Almoço / Repas', 'sortie', 0, 'Geral'],
  ['🚗', 'Transport / Livraison', 'sortie', 0, 'Geral'],
  ['💡', 'Électricité', 'sortie', 0, 'Geral'],
  ['🌐', 'Internet', 'sortie', 0, 'Geral'],
  ['💧', 'Eau', 'sortie', 0, 'Geral'],
  ['📱', 'Téléphone / Crédit', 'sortie', 0, 'Geral'],
  ['📄', 'Fournitures', 'sortie', 0, 'Geral'],
  ['🔧', 'Réparation / Maintenance', 'sortie', 0, 'Geral'],
  ['💰', 'Salaires', 'sortie', 0, 'Admin'],
  ['📦', 'Achat de stock', 'sortie', 0, 'Admin'],
  ['🏷', 'Divers', 'sortie', 0, 'Geral'],
  ['💸', 'Kilape (dette)', 'sortie', 1, 'Geral'],
  ['⚠', 'Sem pagar / Perte', 'perte', 1, 'Geral'],
];
