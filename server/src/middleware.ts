import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { COOKIE, verifyToken } from './auth.js';
import type { PermissionKey } from './permissions.js';

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  is_app_owner: boolean;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      impersonatedBy?: number;
      sessionId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Not signed in' });
  // The session row must still exist — that's how revocation / "sign out
  // everywhere" take effect even though the JWT itself is still unexpired.
  const session = await db('sessions').where({ id: payload.sid }).first();
  if (!session) return res.status(401).json({ error: 'Session expired' });
  const user = await db('users').where({ id: session.user_id }).first();
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (user.status !== 'active') return res.status(403).json({ error: 'Account suspended' });
  req.user = user;
  req.sessionId = payload.sid;
  if (session.impersonated_by) req.impersonatedBy = session.impersonated_by;
  // Throttled last-seen update (best-effort; never blocks the request).
  if (!session.last_seen || Date.now() - new Date(session.last_seen).getTime() > 60_000) {
    db('sessions').where({ id: payload.sid }).update({ last_seen: db.fn.now() }).catch(() => {});
  }
  next();
}

export function requireAppOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.is_app_owner) return res.status(403).json({ error: 'App owner only' });
  next();
}

/** Resolve the permission set a user holds inside a company. App owner gets everything implicitly. */
export async function permissionsFor(userId: number, companyId: number): Promise<Set<string>> {
  const row = await db('memberships')
    .join('roles', 'roles.id', 'memberships.role_id')
    .where({ 'memberships.user_id': userId, 'memberships.company_id': companyId })
    .select('roles.permissions')
    .first();
  if (!row) return new Set();
  const perms = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
  return new Set(perms as string[]);
}

export async function hasPermission(user: AuthedUser, companyId: number, perm: PermissionKey): Promise<boolean> {
  if (user.is_app_owner) return true;
  return (await permissionsFor(user.id, companyId)).has(perm);
}

/**
 * Document-level access. Personal docs (company_id null): owner only.
 * Company docs: members holding the required permission.
 */
export async function canAccessDoc(
  user: AuthedUser,
  doc: { id?: number; owner_id: number; company_id: number | null },
  perm: PermissionKey
): Promise<boolean> {
  if (user.is_app_owner) return true;
  if (doc.owner_id === user.id) return true;
  // Per-email shares grant read-only (view) access to a specific document.
  if (perm === 'doc:view' && doc.id != null) {
    const shared = await db('doc_shares')
      .whereRaw('document_id = ? and lower(email) = ?', [doc.id, user.email.toLowerCase()])
      .first();
    if (shared) return true;
  }
  if (doc.company_id == null) return false; // personal doc, not owner, not shared
  return hasPermission(user, doc.company_id, perm);
}
