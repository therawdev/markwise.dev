import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { db } from './db.js';

const SECRET = process.env.JWT_SECRET || 'markwise-dev-secret';
export const COOKIE = 'mw_token';

export interface TokenPayload { uid: number; sid: string; imp?: number }

export function signToken(userId: number, sid: string, impersonatedBy?: number): string {
  const payload: TokenPayload = { uid: userId, sid };
  if (impersonatedBy) payload.imp = impersonatedBy;
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, SECRET) as TokenPayload;
    return payload && payload.uid && payload.sid ? payload : null;
  } catch {
    return null;
  }
}

function writeCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
}

/**
 * Start a session: insert a row (so it can be listed/revoked) and set the cookie.
 * The JWT carries the session id; requireAuth rejects tokens whose row is gone.
 */
export async function createSession(
  res: Response,
  userId: number,
  opts: { impersonatedBy?: number; userAgent?: string } = {},
): Promise<string> {
  const sid = randomBytes(18).toString('base64url');
  await db('sessions').insert({
    id: sid,
    user_id: userId,
    impersonated_by: opts.impersonatedBy ?? null,
    user_agent: (opts.userAgent || '').slice(0, 300),
  });
  writeCookie(res, signToken(userId, sid, opts.impersonatedBy));
  return sid;
}

export async function destroySession(sid: string): Promise<void> {
  await db('sessions').where({ id: sid }).delete();
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE);
}

// ---- short-lived MFA challenge token (between password step and 2FA step) ----
// purpose 'mfa' = enrolled user owes a code; 'mfa_setup' = org requires 2FA and
// the user must enrol now. Not a session: only the /api/auth/mfa/* steps accept it.
export function signMfaToken(userId: number, purpose: 'mfa' | 'mfa_setup'): string {
  return jwt.sign({ uid: userId, mfa: purpose }, SECRET, { expiresIn: '10m' });
}
export function verifyMfaToken(token: string, purpose: 'mfa' | 'mfa_setup'): number | null {
  try {
    const p = jwt.verify(token, SECRET) as { uid?: number; mfa?: string };
    return p && p.uid && p.mfa === purpose ? p.uid : null;
  } catch {
    return null;
  }
}
