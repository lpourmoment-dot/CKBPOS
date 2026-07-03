#!/usr/bin/env node
/**
 * CKBPOS Integrity Manifest Generator
 * ====================================
 * Génère integrity-manifest.json avec les SHA-256 des fichiers critiques.
 * À exécuter AVANT electron-builder (dans le script predist ou manuellement).
 *
 * Usage: node scripts/generate-integrity.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

const CRITICAL_FILES = [
  'main.js',
  'preload.js',
  'license-ipc.js',
  'licensing.js',
  'license-keys.json',
  'database/db.js',
  'database/driveSync.js',
  'src/utils/adaptive-print.js',
  'src/utils/printer-detect.js',
  'src/utils/escpos.js',
];

function computeHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function main() {
  const manifest = { version: 1, generated: new Date().toISOString(), files: {} };
  let errors = 0;

  for (const file of CRITICAL_FILES) {
    const fullPath = path.join(ROOT, file);
    try {
      if (fs.existsSync(fullPath)) {
        manifest.files[file] = computeHash(fullPath);
        console.log(`  OK  ${file}`);
      } else {
        console.error(`  MISS  ${file}`);
        errors++;
      }
    } catch (err) {
      console.error(`  ERR  ${file}: ${err.message}`);
      errors++;
    }
  }

  const outPath = path.join(ROOT, 'integrity-manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nManifest écrit: ${outPath}`);
  console.log(`${Object.keys(manifest.files).length} fichiers scannés, ${errors} erreur(s)`);

  process.exit(errors > 0 ? 1 : 0);
}

main();
