// TOTP (RFC 6238) multi-factor auth + recovery codes. Hand-rolled on node crypto
// — the algorithm is small and standard (HMAC-SHA1 over a time counter), so no
// dependency is warranted, unlike OIDC's JWKS verification.
import crypto from 'node:crypto';

const STEP = 30; // seconds
const DIGITS = 6;

// ---- base32 (RFC 4648, no padding) for the shared secret ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A fresh base32 TOTP secret (160 bits). */
export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Verify a TOTP code, tolerating ±1 step of clock drift. */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const t = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP);
  for (let i = -window; i <= window; i++) {
    // constant-time compare against each candidate
    const cand = hotp(secret, counter + i);
    if (cand.length === t.length && crypto.timingSafeEqual(Buffer.from(cand), Buffer.from(t))) return true;
  }
  return false;
}

/** otpauth:// URI for authenticator apps (and QR encoding). */
export function otpauthUri(secret: string, account: string, issuer = 'Markwise'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---- recovery codes (single-use, stored hashed) ----
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
const hashCode = (code: string) => crypto.createHash('sha256').update(code.toLowerCase().replace(/\s/g, '')).digest('hex');
export function hashRecoveryCodes(codes: string[]): string[] {
  return codes.map(hashCode);
}
/** If `code` matches an unused recovery hash, return the remaining hashes; else null. */
export function consumeRecoveryCode(code: string, hashes: string[]): string[] | null {
  const h = hashCode(code);
  const idx = hashes.indexOf(h);
  if (idx === -1) return null;
  return hashes.filter((_, i) => i !== idx);
}
