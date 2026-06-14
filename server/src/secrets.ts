// App-level secret encryption for values stored in the DB (provider API keys, …).
// AES-256-GCM with a master key from env `SECRETS_KEY` (32 bytes, as 64 hex chars
// or base64). Encrypted form: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
import crypto from 'node:crypto';

let cached: Buffer | null = null;

function masterKey(): Buffer {
  if (cached) return cached;
  const raw = (process.env.SECRETS_KEY || '').trim();
  if (!raw) throw new Error('SECRETS_KEY is not set — required to encrypt/decrypt stored secrets');
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('SECRETS_KEY must decode to 32 bytes (64 hex chars, or base64 of 32 bytes)');
  }
  cached = buf;
  return buf;
}

/** True when a valid SECRETS_KEY is configured (so the admin UI can warn otherwise). */
export function secretsConfigured(): boolean {
  try { masterKey(); return true; } catch { return false; }
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(enc: string): string {
  const [v, ivb, tagb, ctb] = String(enc).split(':');
  if (v !== 'v1' || !ivb || !tagb || !ctb) throw new Error('Malformed encrypted secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivb, 'base64'));
  decipher.setAuthTag(Buffer.from(tagb, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctb, 'base64')), decipher.final()]).toString('utf8');
}

/** Never return a stored key in plaintext to the UI — show only the last 4 chars. */
export function maskKey(plaintext: string): string {
  const s = String(plaintext || '');
  if (!s) return '';
  return s.length <= 4 ? '••••' : '••••' + s.slice(-4);
}
