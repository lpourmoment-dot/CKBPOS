// licensing.js — CKBPOS (cote client)
//
// Valide les fichiers .ckb generes par CKBPOS-ADMIN.
// Ne contient JAMAIS de cle privee — uniquement les cles PUBLIQUES RSA
// (verification de signature) + la cle AES partagee (dechiffrement).
//
// Le fichier license-keys.json (a la racine du projet, a cote de package.json)
// est genere depuis CKBPOS-ADMIN (onglet "Cles & Securite" -> "Exporter le bundle").
// Il NE DOIT JAMAIS contenir de cle privee.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BUNDLE_PATH = path.join(__dirname, 'license-keys.json');

function loadBundle() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error('license-keys.json manquant — exporter le bundle depuis CKBPOS-ADMIN');
  }
  return JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
}

function aesDecrypt(b64, aesKeyHex) {
  const key = Buffer.from(aesKeyHex, 'hex');
  const data = Buffer.from(b64, 'base64');
  const iv = data.subarray(0, 16);
  const encrypted = data.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Valide le contenu brut d'un fichier .ckb.
 * Retourne le payload decode si valide, leve une exception sinon.
 */
function validateCkbContent(ckbContent) {
  const bundle = loadBundle();
  const token = aesDecrypt(ckbContent, bundle.aesKey);
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error('Fichier de licence invalide ou corrompu');

  const kv = decoded.payload.kv;
  const publicKey = bundle.publicKeys[kv];
  if (!publicKey) throw new Error(`Version de cle inconnue: ${kv} — mettre a jour license-keys.json`);

  const verified = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  return verified;
}

/**
 * Determine le statut d'une licence a partir de son payload.
 */
function evaluateStatus(payload, currentMachineId, currentSalesCount) {
  if (!payload) return { valid: false, reason: 'no_license' };

  if (payload.expires_at && new Date(payload.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  if (payload.machine_id && payload.machine_id !== currentMachineId) {
    return { valid: false, reason: 'wrong_machine' };
  }

  if (payload.sales_limit != null && currentSalesCount >= payload.sales_limit) {
    return { valid: false, reason: 'sales_limit_reached' };
  }

  return { valid: true, payload };
}

function getSupabaseConfig() {
  const bundle = loadBundle();
  return { url: bundle.supabaseUrl, anonKey: bundle.supabaseAnonKey };
}

module.exports = { validateCkbContent, evaluateStatus, getSupabaseConfig, loadBundle };
