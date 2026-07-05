import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { getSetting, setSetting } from '../db/sqlite';
import { createClient } from '@supabase/supabase-js';

interface LicensePayload {
  kv: string;
  machine_id?: string;
  expires_at?: string;
  sales_limit?: number;
  features?: Record<string, boolean>;
  tier?: string;
}

interface LicenseStatus {
  valid: boolean;
  reason?: string;
  payload?: LicensePayload;
  salesUsed: number;
}

interface LicenseBundle {
  publicKeys: Record<string, string>;
  aesKey: string;
}

// Bundle de licence — chargé depuis SecureStore ou bundled avec l'app
let _bundle: LicenseBundle | null = null;

async function getBundle(): Promise<LicenseBundle | null> {
  if (_bundle) return _bundle;
  try {
    const raw = await SecureStore.getItemAsync('license_bundle');
    if (raw) {
      _bundle = JSON.parse(raw);
      return _bundle;
    }
  } catch {}
  return null;
}

export async function setBundle(bundle: LicenseBundle): Promise<void> {
  _bundle = bundle;
  await SecureStore.setItemAsync('license_bundle', JSON.stringify(bundle));
}

/**
 * Déchiffre un contenu .ckb (AES-256-CBC) puis vérifie le JWT RS256.
 * Compatible avec le format Desktop (licensing.js).
 */
export async function validateCkbContent(ckbContent: string): Promise<LicensePayload> {
  const bundle = await getBundle();
  if (!bundle) throw new Error('Bundle de licence non configuré — importez license-keys.json');

  try {
    // 1. AES-256-CBC decryption
    const encryptedBytes = base64ToBytes(ckbContent);
    const iv = encryptedBytes.slice(0, 16);
    const ciphertext = encryptedBytes.slice(16);

    // Derive AES key from hex string
    const aesKeyBytes = hexToBytes(bundle.aesKey);

    // AES-CBC decryption via expo-crypto
    // expo-crypto supports AES but we need to use the raw API
    const decrypted = await decryptAES256CBC(ciphertext, aesKeyBytes, iv);
    const jwtToken = bytesToString(decrypted);

    // 2. Parse JWT header to get kid (key version)
    const parts = jwtToken.split('.');
    if (parts.length !== 3) throw new Error('JWT invalide');

    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));
    const kv = header.kv || payload.kv;

    // 3. Verify RS256 signature
    const publicKey = bundle.publicKeys[kv || ''];
    if (!publicKey) throw new Error(`Version de clé inconnue: ${kv}`);

    // For mobile, we verify the signature using SubtleCrypto
    const valid = await verifyRS256(parts[0] + '.' + parts[1], parts[2], publicKey);
    if (!valid) throw new Error('Signature invalide');

    return payload as LicensePayload;
  } catch (e: any) {
    throw new Error(`Licence invalide: ${e.message}`);
  }
}

/**
 * Évalue le statut de la licence.
 * Mode gratuit : < 30 ventes sans licence valide.
 */
export async function evaluateLicenseStatus(
  currentMachineId: string,
  currentSalesCount: number
): Promise<LicenseStatus> {
  try {
    const payloadStr = await SecureStore.getItemAsync('license_payload');
    if (!payloadStr) {
      return {
        valid: currentSalesCount < 30,
        reason: currentSalesCount >= 30 ? 'sales_limit_reached' : 'no_license',
        salesUsed: currentSalesCount,
      };
    }

    const payload: LicensePayload = JSON.parse(payloadStr);

    if (payload.expires_at && new Date(payload.expires_at) < new Date()) {
      return { valid: false, reason: 'expired', payload, salesUsed: currentSalesCount };
    }

    if (payload.machine_id && payload.machine_id !== currentMachineId) {
      return { valid: false, reason: 'wrong_machine', payload, salesUsed: currentSalesCount };
    }

    if (payload.sales_limit != null && currentSalesCount >= payload.sales_limit) {
      return { valid: false, reason: 'sales_limit_reached', payload, salesUsed: currentSalesCount };
    }

    return { valid: true, payload, salesUsed: currentSalesCount };
  } catch {
    return { valid: currentSalesCount < 30, reason: 'no_license', salesUsed: currentSalesCount };
  }
}

/**
 * Active une licence à partir d'un contenu .ckb brut.
 */
export async function activateLicense(ckbContent: string): Promise<LicensePayload> {
  const payload = await validateCkbContent(ckbContent);
  await SecureStore.setItemAsync('license_payload', JSON.stringify(payload));
  await SecureStore.setItemAsync('license_ckb_raw', ckbContent);
  return payload;
}

/**
 * Récupère le payload licence stocké (sans validation).
 */
export async function getStoredPayload(): Promise<LicensePayload | null> {
  try {
    const raw = await SecureStore.getItemAsync('license_payload');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Incrémente le compteur de ventes.
 */
export async function incrementSalesCounter(): Promise<void> {
  const current = parseInt((await getSetting('license_sales_used')) || '0', 10);
  await setSetting('license_sales_used', String(current + 1));
}

/**
 * Récupère le nombre de ventes utilisées.
 */
export async function getSalesUsed(): Promise<number> {
  return parseInt((await getSetting('license_sales_used')) || '0', 10);
}

/**
 * Vérifie si une feature est disponible dans la licence.
 */
export function hasFeature(payload: LicensePayload | null, featureName: string): boolean {
  if (!payload) return true;
  const features = payload.features;
  if (!features) return true;
  return features[featureName] !== false;
}

/**
 * Écoute les livraisons de licence via Supabase.
 */
export async function startLicenseListener(email: string): Promise<void> {
  try {
    const url = await getSetting('supabase_url');
    const key = await getSetting('supabase_key');
    if (!url || !key) return;

    const client = createClient(url, key);

    // Check for pending delivery
    const { data: pending } = await client
      .from('license_deliveries')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('delivered', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (pending && pending.length > 0) {
      try {
        await activateLicense(pending[0].ckb_content);
        await client.from('license_deliveries').update({ delivered: true }).eq('id', pending[0].id);
      } catch (e) {
        console.error('[LICENSE] Activation échouée:', e);
      }
    }
  } catch (e) {
    console.error('[LICENSE] Listener error:', e);
  }
}

// ── Crypto Helpers ──────────────────────────────────────

async function decryptAES256CBC(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  // Use expo-crypto for AES-CBC decryption
  // Convert to base64 for the API
  const ctBase64 = bytesToBase64(ciphertext);
  const keyBase64 = bytesToBase64(key);
  const ivBase64 = bytesToBase64(iv);

  // expo-crypto doesn't have a direct AES-CBC decrypt, so we use SubtleCrypto
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw', key.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, ['decrypt']
  );
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv.buffer as ArrayBuffer }, cryptoKey, ciphertext.buffer as ArrayBuffer
  );
  return new Uint8Array(decrypted);
}

async function verifyRS256(data: string, signature: string, publicKeyPem: string): Promise<boolean> {
  try {
    // Import the public key
    const keyData = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');

    const binaryDer = base64ToBytes(keyData);

    const publicKey = await globalThis.crypto.subtle.importKey(
      'spki',
      binaryDer.buffer as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const sigBytes = base64ToBytes(signature);

    return await globalThis.crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      sigBytes.buffer as ArrayBuffer,
      dataBytes
    );
  } catch (e) {
    console.error('[LICENSE] RS256 verify error:', e);
    return false;
  }
}

// ── Base64 / Hex Helpers ───────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToString(bytes: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}
