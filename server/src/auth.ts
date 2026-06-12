import jwt from 'jsonwebtoken';
import type { Response } from 'express';

const SECRET = process.env.JWT_SECRET || 'markwise-dev-secret';
export const COOKIE = 'mw_token';

export function signToken(userId: number): string {
  return jwt.sign({ uid: userId }, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, SECRET) as { uid: number };
    return payload.uid;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, userId: number) {
  res.cookie(COOKIE, signToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE);
}
