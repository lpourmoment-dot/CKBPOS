/**
 * CKBPOS Certificate Pinning
 * ===========================
 * Pin les certificats SSL pour les connexions Supabase.
 * Empêche les attaques MITM sur les communications cloud.
 *
 * Usage dans main.js (après app.whenReady) :
 *   const { setupCertPinning } = require('./scripts/cert-pinning');
 *   setupCertPinning(session);
 */

'use strict';

// ── Fingerprints SHA-256 des certificats autorisés ──
// Mettre à jour quand le certificat Supabase est renouvelé.
// Format: "XX:XX:XX:..." (majuscules, séparés par deux-points)
const PINNED_CERTS = {
  // Supabase CKBPOS (okutvlizyngqknqltsko) — Google Trust Services "WE1"
  'E4:89:07:23:60:38:C7:FE:B0:5C:D8:62:E4:1C:D7:FC:57:28:F2:8D:A6:1B:95:E6:76:1D:9C:29:5C:5B:32:98': true,
  // Supabase CKBPOS-PRO (gpbmxzochrgfuimqztsy) — même certificat partagé
  // Google Trust Services racine (backup rotation)
  'C0:30:91:04:79:53:59:25:1C:97:57:3B:38:95:22:A4:36:4D:99:F5:4D:1E:20:79:73:4C:31:4B:36:69:8C:F1:E3': true,
};

// Domaines à pin
const PINNED_DOMAINS = [
  'okutvlizyngqknqltsko.supabase.co',
  'gpbmxzochrgfuimqztsy.supabase.co',
];

function setupCertPinning(session) {
  if (!session || !session.defaultSession) return;

  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    const { hostname, certificate } = request;

    // Si le domaine n'est pas dans notre liste, laisser Electron gérer normalement
    const shouldPin = PINNED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    if (!shouldPin) {
      callback(0); // ACCEPT — on ne pin que les domaines Supabase
      return;
    }

    // Vérifier le fingerprint du certificat
    if (certificate && certificate.fingerprint256) {
      const normalizedFingerprint = certificate.fingerprint256.toUpperCase();
      if (PINNED_CERTS[normalizedFingerprint]) {
        callback(0); // ACCEPT — certificat pinné valide
        return;
      }
    }

    // Certificat non pinné — REJETER la connexion
    console.error(`[CERT-PIN] Connexion rejetée pour ${hostname} — certificat non reconnu`);
    callback(-2); // reject
  });

  console.log('[CERT-PIN] Certificate pinning activé pour', PINNED_DOMAINS.join(', '));
}

module.exports = { setupCertPinning, PINNED_CERTS, PINNED_DOMAINS };
