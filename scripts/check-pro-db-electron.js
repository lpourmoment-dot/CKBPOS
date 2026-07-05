// Script vérification DB PRO — exécuter via Electron (better-sqlite3 compat)
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.env.APPDATA, 'ckbpos-pro', 'ckbpos.db');
console.log('=== Vérification DB PRO ===');
console.log('DB path:', dbPath);
console.log('Exists:', fs.existsSync(dbPath));

if (fs.existsSync(dbPath)) {
  const stat = fs.statSync(dbPath);
  console.log('Size:', stat.size, 'bytes');
  console.log('Last modified:', stat.mtime.toISOString());

  // First 16 bytes
  const fd = fs.openSync(dbPath, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  console.log('First 16 bytes (hex):', buf.toString('hex'));
  console.log('First 16 bytes (ascii):', buf.toString('ascii'));
  console.log('Is SQLite:', buf.toString('hex') === '53514c69746520666f726d6174203300');

  // WAL files
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  console.log('WAL exists:', fs.existsSync(walPath), fs.existsSync(walPath) ? '(' + fs.statSync(walPath).size + ' bytes)' : '');
  console.log('SHM exists:', fs.existsSync(shmPath), fs.existsSync(shmPath) ? '(' + fs.statSync(shmPath).size + ' bytes)' : '');

  try {
    const db = new Database(dbPath, { readonly: true });
    console.log('\n[OK] Database ouverte en lecture seule');

    const integrity = db.pragma('integrity_check');
    console.log('integrity_check:', JSON.stringify(integrity));

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    console.log('Tables (' + tables.length + '):', tables.map(t => t.name).join(', '));

    try {
      const count = db.prepare("SELECT COUNT(*) as c FROM ventes").get();
      console.log('Ventes:', count.c);
    } catch(e) { console.log('Ventes error:', e.message); }

    try {
      const sv = db.prepare("SELECT * FROM schema_version").get();
      console.log('schema_version:', JSON.stringify(sv));
    } catch(e) { console.log('schema_version error:', e.message); }

    try {
      const mid = db.prepare("SELECT value FROM settings WHERE key='machine_id'").get();
      console.log('machine_id:', mid?.value || 'NOT SET');
    } catch(e) { console.log('machine_id error:', e.message); }

    const journalMode = db.pragma('journal_mode');
    console.log('journal_mode:', JSON.stringify(journalMode));

    db.close();
    console.log('\n[OK] DB fermée proprement');
  } catch(err) {
    console.error('\n[ERREUR] Cannot open DB:', err.message);
  }
}

process.exit(0);
