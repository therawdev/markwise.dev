import jwt from 'jsonwebtoken';
import type { Response } from 'express';

const SECRET = process.env.JWT_SECRET || 'markwise-dev-secret';
export const COOKIE = 'mw_token';

export function signToken(userId: number, impersonatedBy?: number): string {
  const payload: { uid: number; imp?: number } = { uid: userId };
  if (impersonatedBy) payload.imp = impersonatedBy;
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { uid: number; imp?: number } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { uid: number; imp?: number };
    return payload && payload.uid ? payload : null;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, userId: number, impersonatedBy?: number) {
  res.cookie(COOKIE, signToken(userId, impersonatedBy), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE);
}
