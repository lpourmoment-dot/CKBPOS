// Script temporaire de vérification DB PRO (lecture seule)
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'ckbpos-pro', 'ckbpos.db');
console.log('DB path:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  console.log('[OK] Database ouverte en lecture seule');

  const integrity = db.pragma('integrity_check');
  console.log('integrity_check:', JSON.stringify(integrity));

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('Tables:', tables.map(t => t.name).join(', '));

  // Vérifier ventes
  try {
    const count = db.prepare("SELECT COUNT(*) as c FROM ventes").get();
    console.log('Ventes:', count.c);
  } catch(e) { console.log('Ventes error:', e.message); }

  // Vérifier schema_version
  try {
    const sv = db.prepare("SELECT * FROM schema_version").get();
    console.log('schema_version:', JSON.stringify(sv));
  } catch(e) { console.log('schema_version error:', e.message); }

  // Vérifier settings machine_id
  try {
    const mid = db.prepare("SELECT value FROM settings WHERE key='machine_id'").get();
    console.log('machine_id:', mid?.value || 'NOT SET');
  } catch(e) { console.log('machine_id error:', e.message); }

  // WAL mode check
  const journalMode = db.pragma('journal_mode');
  console.log('journal_mode:', JSON.stringify(journalMode));

  db.close();
  console.log('[OK] DB fermée proprement');
} catch(err) {
  console.error('[ERREUR]', err.message);
  console.error('Stack:', err.stack);
}
