/**
 * CKBPOS Integrity Check
 * ======================
 * Vérifie l'intégrité SHA-256 des fichiers critiques au démarrage.
 * Le manifest est généré par scripts/generate-integrity.js avant le build.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFEST_NAME = 'integrity-manifest.json';

function loadManifest(appDir) {
  const manifestPath = path.join(appDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch { return null; }
}

function computeHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Vérifie l'intégrité de tous les fichiers listés dans le manifest.
 * @param {string} appDir - Répertoire de l'application
 * @returns {{ ok: boolean, tampered: string[], missing: string[] }}
 */
function verifyIntegrity(appDir) {
  const manifest = loadManifest(appDir);
  if (!manifest) return { ok: true, tampered: [], missing: [] }; // Pas de manifest = skip

  const tampered = [];
  const missing = [];

  for (const [relativePath, expectedHash] of Object.entries(manifest.files || {})) {
    const fullPath = path.join(appDir, relativePath);
    try {
      if (!fs.existsSync(fullPath)) {
        missing.push(relativePath);
        continue;
      }
      const actualHash = computeHash(fullPath);
      if (actualHash !== expectedHash) {
        tampered.push(relativePath);
      }
    } catch {
      tampered.push(relativePath);
    }
  }

  return { ok: tampered.length === 0 && missing.length === 0, tampered, missing };
}

module.exports = { verifyIntegrity, computeHash };
