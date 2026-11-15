/**
 * Server-side credential vault helpers for OrderFlow.
 * Encryption key MUST come from process.env.CREDENTIALS_ENCRYPTION_KEY
 * (never from VITE_ or client code).
 *
 * Uses AES-256-GCM via Web Crypto / Node crypto.
 * Never return decrypted values to the frontend.
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY || '';
  if (!raw || raw.length < 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured or too short (min 32 chars)');
  }
  // Derive a 32-byte key
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptCredentials(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptCredentials(ciphertextB64: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid ciphertext');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Return a safe masked preview, e.g. "shpat_••••••••abcd" */
export function maskSecret(value: string | null | undefined, visible = 4): string {
  if (!value || value.length < visible + 2) return '••••••••';
  return value.slice(0, 4) + '••••••••' + value.slice(-visible);
}

export function isVaultConfigured(): boolean {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY || '';
  return raw.length >= 32;
}
