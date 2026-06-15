// OIDC single sign-on: discovery, PKCE, the authorization-code exchange, and
// id_token verification. Plain fetch for discovery/token (like the Gemini
// provider), with `jose` for the security-critical JWKS signature + claim
// checks. Per-company config lives in sso_connections (see migrate.ts).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { db } from './db.js';
import { decryptSecret } from './secrets.js';

const STATE_SECRET = process.env.JWT_SECRET || 'markwise-dev-secret';
export const SSO_STATE_COOKIE = 'mw_sso';

export interface SsoConnection {
  id: number;
  company_id: number;
  type: string;
  issuer: string;
  client_id: string;
  client_secret_enc: string | null;
  allowed_domains: string[];
  default_role_id: number | null;
  enabled: boolean;
  enforced: boolean;
}

function normalize(row: any): SsoConnection {
  return {
    ...row,
    allowed_domains: typeof row.allowed_domains === 'string' ? JSON.parse(row.allowed_domains) : (row.allowed_domains || []),
    enabled: !!row.enabled,
    enforced: !!row.enforced,
  };
}

export async function getConnectionByCompany(companyId: number): Promise<SsoConnection | null> {
  const row = await db('sso_connections').where({ company_id: companyId }).first();
  return row ? normalize(row) : null;
}

/** First enabled connection whose allowed_domains contains the email's domain. */
export async function getEnabledConnectionForEmail(email: string): Promise<SsoConnection | null> {
  const domain = String(email).toLowerCase().split('@')[1];
  if (!domain) return null;
  const rows = await db('sso_connections').where({ enabled: true });
  for (const r of rows) {
    const c = normalize(r);
    if (c.allowed_domains.map((d) => String(d).toLowerCase()).includes(domain)) return c;
  }
  return null;
}

// ---- OIDC discovery (cached per issuer for an hour) ----
interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}
const discoveryCache = new Map<string, { doc: Discovery; at: number }>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function discover(issuer: string): Promise<Discovery> {
  const hit = discoveryCache.get(issuer);
  if (hit && Date.now() - hit.at < 3600_000) return hit.doc;
  const url = issuer.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`OIDC discovery failed (${r.status}) for ${url}`);
  const doc = (await r.json()) as Discovery;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error('OIDC discovery document is missing required endpoints');
  }
  discoveryCache.set(issuer, { doc, at: Date.now() });
  return doc;
}

function jwksFor(doc: Discovery) {
  let set = jwksCache.get(doc.jwks_uri);
  if (!set) { set = createRemoteJWKSet(new URL(doc.jwks_uri)); jwksCache.set(doc.jwks_uri, set); }
  return set;
}

// ---- PKCE ----
const b64url = (b: Buffer) => b.toString('base64url');
export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// ---- transaction state (signed cookie; no server-side store) ----
export interface SsoState { companyId: number; nonce: string; verifier: string; next?: string; }
export function signState(s: SsoState): string {
  return jwt.sign(s, STATE_SECRET, { expiresIn: '10m' });
}
export function verifyState(token: string): SsoState | null {
  try { return jwt.verify(token, STATE_SECRET) as SsoState; } catch { return null; }
}

export function buildAuthUrl(doc: Discovery, conn: SsoConnection, redirectUri: string, state: string, nonce: string, challenge: string): string {
  const u = new URL(doc.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', conn.client_id);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export async function exchangeCode(doc: Discovery, conn: SsoConnection, code: string, redirectUri: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: conn.client_id,
    code_verifier: verifier,
  });
  if (conn.client_secret_enc) body.set('client_secret', decryptSecret(conn.client_secret_enc));
  const r = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!r.ok || !data.id_token) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error || r.status}`);
  }
  return data.id_token;
}

export interface SsoIdentity { email: string; name?: string; sub: string; emailVerified: boolean; }
export async function verifyIdToken(doc: Discovery, conn: SsoConnection, idToken: string, nonce: string): Promise<SsoIdentity> {
  const { payload } = await jwtVerify(idToken, jwksFor(doc), { issuer: doc.issuer, audience: conn.client_id });
  const p = payload as JWTPayload & { email?: string; email_verified?: boolean; name?: string; nonce?: string };
  if (p.nonce !== nonce) throw new Error('OIDC nonce mismatch');
  if (!p.email) throw new Error('The identity provider did not return an email address');
  return {
    email: String(p.email).toLowerCase(),
    name: p.name ? String(p.name) : undefined,
    sub: String(p.sub),
    emailVerified: p.email_verified !== false, // treat absent as verified (many IdPs omit it)
  };
}
