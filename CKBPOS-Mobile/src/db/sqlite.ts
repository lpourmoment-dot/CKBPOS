import * as SQLite from 'expo-sqlite';
import bcrypt from 'bcryptjs';
import { INITIAL_SCHEMA, SYNC_TRIGGERS, DEFAULT_SETTINGS, DEFAULT_MOTIVOS } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('ckbpos.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  return db;
}

export async function initDb(): Promise<void> {
  const database = await getDb();

  // Create all tables
  await database.execAsync(INITIAL_SCHEMA);

  // Initialize schema_version
  await database.execAsync(`
    INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);
  `);

  // Run migrations
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
    "ALTER TABLE ventes ADD COLUMN client_nif TEXT DEFAULT 'CONSUMIDOR FINAL'",
    "ALTER TABLE ventes ADD COLUMN facture_num TEXT",
    "ALTER TABLE ventes ADD COLUMN reservation_id INTEGER",
    "ALTER TABLE users ADD COLUMN pin TEXT",
    "ALTER TABLE ventes ADD COLUMN machine_id TEXT DEFAULT 'LOCAL'",
    "ALTER TABLE products ADD COLUMN barcode TEXT",
    "ALTER TABLE caderno_entries ADD COLUMN categorie_depense TEXT DEFAULT NULL",
    "ALTER TABLE stock_mouvements ADD COLUMN cout_entree REAL DEFAULT 0",
    "ALTER TABLE stock_mouvements ADD COLUMN fournisseur TEXT DEFAULT ''",
    "ALTER TABLE ventes ADD COLUMN uuid TEXT",
    "ALTER TABLE reservations ADD COLUMN machine_id TEXT DEFAULT 'LOCAL'",
    "ALTER TABLE reservations ADD COLUMN items_json TEXT",
    "ALTER TABLE reservations ADD COLUMN mode_paiement TEXT DEFAULT 'dinheiro'",
    "ALTER TABLE reservations ADD COLUMN montant_dinheiro REAL DEFAULT 0",
    "ALTER TABLE reservations ADD COLUMN montant_express REAL DEFAULT 0",
    "ALTER TABLE reservations ADD COLUMN expiration TEXT",
    "ALTER TABLE reservations ADD COLUMN vente_id INTEGER",
    "ALTER TABLE reservations ADD COLUMN created_at TEXT DEFAULT (datetime('now','utc'))",
  ];

  for (const sql of migrations) {
    try { await database.execAsync(sql); } catch {}
  }

  await database.runAsync(
    'UPDATE schema_version SET version = ? WHERE id = 1',
    [migrations.length]
  );

  // Sync triggers — identiques aux triggers Desktop
  for (const triggerSql of SYNC_TRIGGERS) {
    try { await database.execAsync(triggerSql); } catch (e) {
      console.error('[DB] trigger error:', (e as Error).message);
    }
  }

  // Default settings
  for (const [k, v] of DEFAULT_SETTINGS) {
    await database.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [k, v]
    );
  }

  // Default motivos
  for (const [icone, label, direction, est_dette, role] of DEFAULT_MOTIVOS) {
    await database.runAsync(
      'INSERT OR IGNORE INTO caderno_motivos (icone, label, direction, est_dette, role) VALUES (?, ?, ?, ?, ?)',
      [icone, label, direction, est_dette, role]
    );
  }

  // Default admin user if none exists
  const adminExists = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM users WHERE role = ?',
    ['admin']
  );
  if (!adminExists) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    await database.runAsync(
      "INSERT INTO users (nom, email, role, password_hash, peut_modifier_factures, tentativas_login) VALUES (?, ?, ?, ?, ?, ?)",
      ['Administrador', 'admin@ckbpos.com', 'admin', adminHash, 1, 0]
    );
  }

  console.log('[CKBPOS] Database initialized');
}

// Helper: run a query and return all rows
export async function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const database = await getDb();
  const result = await database.getAllAsync<T>(sql, params);
  return result;
}

// Helper: run a query and return first row
export async function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const database = await getDb();
  const result = await database.getFirstAsync<T>(sql, params);
  return result ?? null;
}

// Helper: run a statement
export async function dbRun(sql: string, params: any[] = []): Promise<SQLite.SQLiteRunResult> {
  const database = await getDb();
  const result = await database.runAsync(sql, params);
  return result;
}

// Helper: get setting value
export async function getSetting(key: string): Promise<string | null> {
  const row = await dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

// Helper: set setting value
export async function setSetting(key: string, value: string): Promise<void> {
  await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

// Helper: generate machine ID
export function generateMachineId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
