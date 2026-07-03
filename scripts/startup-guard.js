/**
 * CKBPOS Startup Guard
 * ====================
 * Validates critical files exist AND their integrity (SHA-256 hash)
 * BEFORE main.js loads any modules.
 * Only runs when the app is packaged (app.isPackaged === true).
 * 
 * If files are missing or tampered, shows a professional Electron dialog
 * and exits gracefully — never crashes with a Node.js exception.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Critical files that must exist in the app directory.
 */
const CRITICAL_FILES = [
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

function loadManifest(appDir) {
  const manifestPath = path.join(appDir, 'integrity-manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { return null; }
}

/**
 * Check if critical files exist AND verify SHA-256 integrity.
 */
function checkStartupFiles(app) {
  if (!app.isPackaged) return { ok: true, missing: [], tampered: [] };

  let appDir;
  try { appDir = path.dirname(app.getPath('exe')); }
  catch {
    try { appDir = process.resourcesPath || path.dirname(process.execPath); }
    catch { return { ok: true, missing: [], tampered: [] }; }
  }

  const missing = [];
  const tampered = [];

  // Vérifier l'existence des fichiers
  for (const file of CRITICAL_FILES) {
    try {
      if (!fs.existsSync(path.join(appDir, file))) missing.push(file);
    } catch { missing.push(file); }
  }

  // Vérifier l'intégrité via le manifest SHA-256
  const manifest = loadManifest(appDir);
  if (manifest && manifest.files) {
    for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
      const fullPath = path.join(appDir, relativePath);
      try {
        if (!fs.existsSync(fullPath)) continue;
        const actualHash = computeHash(fullPath);
        if (actualHash !== expectedHash) tampered.push(relativePath);
      } catch { tampered.push(relativePath); }
    }
  }

  return { ok: missing.length === 0 && tampered.length === 0, missing, tampered };
}

/**
 * Show a professional error dialog and exit the application.
 */
function showStartupError(app, missing, tampered) {
  let dialog;
  try { dialog = require('electron').dialog; }
  catch { app.exit(1); return; }

  const missingList = (missing || []).map(f => `  • ${f}`).join('\n');
  const tamperedList = (tampered || []).map(f => `  • ${f}`).join('\n');

  const sections = [];
  if (missingList) sections.push('Fichiers introuvables :\n' + missingList);
  if (tamperedList) sections.push('Fichiers modifiés (intégrité compromise) :\n' + tamperedList);

  const detail = [
    'CKBPOS a détecté une anomalie de sécurité.',
    '',
    ...sections,
    '',
    '──────────────────────────────',
    '',
    'Cause probable :',
    tamperedList
      ? 'L\'application a été modifiée non autorisée.'
      : 'L\'installation est corrompue ou incomplète.',
    '',
    'Solution :',
    '1. Désinstallez CKBPOS depuis les Paramètres Windows',
    '2. Téléchargez la dernière version depuis GitHub Releases',
    '3. Réinstallez l\'application',
    '',
    'Si le problème persiste, contactez le support CKBPOS.',
  ].join('\n');

  try {
    dialog.showMessageBoxSync(app, {
      type: 'error',
      title: 'CKBPOS — Erreur de sécurité',
      message: tamperedList ? 'Intégrité compromise' : 'Fichiers critiques manquants',
      detail,
      buttons: ['Quitter'],
      defaultId: 0,
      noLink: true,
    });
  } catch { console.error('CKBPOS Startup Error:', detail); }

  app.exit(1);
}

module.exports = { checkStartupFiles, showStartupError, CRITICAL_FILES };
