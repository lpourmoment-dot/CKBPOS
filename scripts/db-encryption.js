/**
 * CKBPOS Database Encryption
 * ===========================
 * Chiffre/déchiffre le fichier SQLite au repos via AES-256-GCM.
 * La clé est dérivée de informations hardware (hostname + MAC) —
 * PAS besoin du machine_id stocké en BDD (résout le chicken-and-egg).
 *
 * Usage dans main.js (AVANT le require de database/db.js):
 *   const { preDecryptDb, setupExitEncryption } = require('./scripts/db-encryption');
 *   const _dbPath = require('path').join(require('electron').app.getPath('userData'), 'ckbpos.db');
 *   preDecryptDb(_dbPath);
 *   // ... plus tard, après app.whenReady:
 *   setupExitEncryption(_dbPath);
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const MAGIC_HEADER = Buffer.from('CKBPOS-ENC-v1');
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT = 'CKBPOS-DB-ENCRYPTION-SALT-v1';

/**
 * Génère une empreinte hardware stable (pas de machine_id BDD nécessaire).
 * Basée sur: hostname + premier MAC address non-locale.
 */
function getHardwareFingerprint() {
  const hostname = os.hostname();
  const interfaces = os.networkInterfaces();
  let mac = '00:00:00:00:00:00';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        mac = iface.mac;
        break;
      }
    }
    if (mac !== '00:00:00:00:00:00') break;
  }
  return hostname + ':' + mac;
}

function deriveKey() {
  const fingerprint = getHardwareFingerprint();
  return crypto.pbkdf2Sync(fingerprint, SALT, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

function encryptBuffer(plaintext, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC_HEADER, iv, tag, encrypted]);
}

function decryptBuffer(encryptedBuf, key) {
  if (encryptedBuf.length < MAGIC_HEADER.length + 16 + 16 + 1) {
    throw new Error('Fichier trop petit');
  }
  const header = encryptedBuf.subarray(0, MAGIC_HEADER.length);
  if (!header.equals(MAGIC_HEADER)) throw new Error('Pas chiffré');
  const iv = encryptedBuf.subarray(MAGIC_HEADER.length, MAGIC_HEADER.length + 16);
  const tag = encryptedBuf.subarray(MAGIC_HEADER.length + 16, MAGIC_HEADER.length + 32);
  const encrypted = encryptedBuf.subarray(MAGIC_HEADER.length + 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function isEncrypted(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(MAGIC_HEADER.length);
    fs.readSync(fd, buf, 0, MAGIC_HEADER.length, 0);
    fs.closeSync(fd);
    return buf.equals(MAGIC_HEADER);
  } catch { return false; }
}

/**
 * Déchiffre la BDD AVANT ouverture. À appeler au tout début de main.js.
 */
function preDecryptDb(dbPath) {
  if (!fs.existsSync(dbPath)) return;
  if (!isEncrypted(dbPath)) return;
  try {
    const key = deriveKey();
    const encrypted = fs.readFileSync(dbPath);
    const decrypted = decryptBuffer(encrypted, key);
    fs.writeFileSync(dbPath, decrypted);
    console.log('[DB-ENC] Base de données déchiffrée au démarrage');
  } catch (err) {
    console.error('[DB-ENC] Erreur déchiffrement:', err.message);
  }
}

/**
 * Chiffre la BDD à l'arrêt. À appeler dans before-quit.
 */
function encryptDbOnExit(dbPath) {
  if (!fs.existsSync(dbPath)) return;
  if (isEncrypted(dbPath)) return;
  try {
    const key = deriveKey();
    const plaintext = fs.readFileSync(dbPath);
    const encrypted = encryptBuffer(plaintext, key);
    fs.writeFileSync(dbPath, encrypted);
    console.log('[DB-ENC] Base de données chiffrée à l\'arrêt');
  } catch (err) {
    console.error('[DB-ENC] Erreur chiffrement:', err.message);
  }
}

/**
 * Configure le chiffrement à l'arrêt. À appeler dans app.whenReady().
 */
function setupExitEncryption(dbPath) {
  const { app } = require('electron');
  app.on('before-quit', () => {
    encryptDbOnExit(dbPath);
  });
}

module.exports = { preDecryptDb, encryptDbOnExit, setupExitEncryption, isEncrypted };
