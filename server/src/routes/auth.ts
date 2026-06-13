import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, audit, getSetting } from '../db.js';
import { setAuthCookie, clearAuthCookie } from '../auth.js';
import { requireAuth } from '../middleware.js';
import { authLimiter } from '../rate-limit.js';

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
});

authRouter.post('/signup', authLimiter, async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and a password of 8+ characters required' });
  const { email, password, name } = parsed.data;

  // A valid invite always works; otherwise public signups must be enabled.
  const inviteToken = typeof req.body?.invite_token === 'string' ? req.body.invite_token : null;
  let invite: any = null;
  if (inviteToken) {
    invite = await db('invites').where({ token: inviteToken }).first();
    if (!invite || invite.used_by || new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite is invalid or expired' });
    }
  } else if ((await getSetting<boolean>('allow_signups', true)) === false) {
    return res.status(403).json({ error: 'Signups are invite-only right now — ask a company owner for an invite link' });
  }

  const existing = await db('users').whereRaw('lower(email) = ?', email.toLowerCase()).first();
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const [user] = await db('users')
    .insert({
      email: email.toLowerCase(),
      password_hash: await bcrypt.hash(password, 10),
      name: name || email.split('@')[0],
    })
    .returning('*');

  await audit(user.id, 'user.signup', `user:${user.id}`);
  let joined: any = null;
  if (invite) {
    await db.transaction(async (trx) => {
      await trx('memberships').insert({ user_id: user.id, company_id: invite.company_id, role_id: invite.role_id });
      await trx('invites').where({ id: invite.id }).update({ used_by: user.id });
    });
    joined = await db('companies').where({ id: invite.company_id }).first();
    await audit(user.id, 'invite.accept', `company:${invite.company_id}`, { invite_id: invite.id, company: joined?.name });
  }
  setAuthCookie(res, user.id);
  res.json({
    id: user.id, email: user.email, name: user.name, is_app_owner: user.is_app_owner,
    joined: joined ? { id: joined.id, name: joined.name } : null,
  });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password required' });
  const { email, password } = parsed.data;

  const user = await db('users').whereRaw('lower(email) = ?', email.toLowerCase()).first();
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  if (user.status !== 'active') return res.status(403).json({ error: 'Account suspended' });

  setAuthCookie(res, user.id);
  res.json({ id: user.id, email: user.email, name: user.name, is_app_owner: user.is_app_owner });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const memberships = await db('memberships')
    .join('companies', 'companies.id', 'memberships.company_id')
    .join('roles', 'roles.id', 'memberships.role_id')
    .where('memberships.user_id', req.user!.id)
    .select(
      'companies.id as company_id',
      'companies.name as company_name',
      'companies.slug as company_slug',
      'companies.plan as company_plan',
      'companies.status as company_status',
      'roles.name as role_name',
      'roles.permissions'
    );
  res.json({
    id: req.user!.id,
    email: req.user!.email,
    name: req.user!.name,
    is_app_owner: req.user!.is_app_owner,
    impersonated_by: req.impersonatedBy || null,
    memberships: memberships.map((m) => ({
      company_id: m.company_id,
      company_name: m.company_name,
      company_slug: m.company_slug,
      company_plan: m.company_plan,
      company_status: m.company_status,
      role: m.role_name,
      permissions: typeof m.permissions === 'string' ? JSON.parse(m.permissions) : m.permissions,
    })),
  });
});

// ---- notifications: things OTHER people did that concern me ----
// Notifications are NOT an audit log: they exclude my own actions and only
// surface events directed at me (target user:me) or happening in my companies.
authRouter.get('/notifications', requireAuth, async (req, res) => {
  const me = req.user!;
  const myCompanyIds = (await db('memberships').where({ user_id: me.id }).select('company_id')).map((r) => r.company_id);
  const items = await db('audit_logs')
    .leftJoin('users', 'users.id', 'audit_logs.actor_id')
    .whereNot('audit_logs.actor_id', me.id) // never notify me about what I did
    .andWhere((b) => {
      b.where('audit_logs.target', `user:${me.id}`);
      if (myCompanyIds.length) b.orWhereIn('audit_logs.target', myCompanyIds.map((id) => `company:${id}`));
    })
    .orderBy('audit_logs.id', 'desc')
    .limit(15)
    .select('audit_logs.id', 'audit_logs.action', 'audit_logs.target', 'audit_logs.detail', 'audit_logs.created_at', 'users.email as actor_email');
  const seenAt = (me as any).notif_seen_at ? new Date((me as any).notif_seen_at).getTime() : 0;
  const unread = items.filter((i) => new Date(i.created_at).getTime() > seenAt).length;
  res.json({ items, unread });
});

authRouter.post('/notifications/seen', requireAuth, async (req, res) => {
  await db('users').where({ id: req.user!.id }).update({ notif_seen_at: db.fn.now() });
  res.json({ ok: true });
});

// ---- profile update ----
const profileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(200).optional(),
});

authRouter.put('/me', requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid name or email' });
  const { name, email } = parsed.data;
  if (!name && !email) return res.status(400).json({ error: 'Nothing to update' });

  const me = req.user!;
  const updates: Record<string, unknown> = {};
  const changed: string[] = [];

  if (name && name !== me.name) { updates.name = name; changed.push('name'); }
  if (email) {
    const normalized = email.toLowerCase();
    if (normalized !== me.email) {
      const conflict = await db('users').whereRaw('lower(email) = ?', normalized).whereNot('id', me.id).first();
      if (conflict) return res.status(409).json({ error: 'Another account uses this email' });
      updates.email = normalized;
      changed.push('email');
    }
  }

  if (!changed.length) {
    const user = await db('users').where({ id: me.id }).first();
    return res.json({ id: user.id, email: user.email, name: user.name, is_app_owner: user.is_app_owner });
  }

  await db('users').where({ id: me.id }).update(updates);
  await audit(me.id, 'user.update', `user:${me.id}`, { fields: changed });
  const user = await db('users').where({ id: me.id }).first();
  res.json({ id: user.id, email: user.email, name: user.name, is_app_owner: user.is_app_owner });
});

// ---- password change ----
const passwordSchema = z.object({
  current: z.string().min(1),
  password: z.string().min(8).max(200),
});

authRouter.put('/password', requireAuth, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const { current, password } = parsed.data;

  const me = req.user!;
  const user = await db('users').where({ id: me.id }).first();
  const ok = await bcrypt.compare(current, user.password_hash);
  if (!ok) return res.status(400).json({ error: 'Current password is wrong' });

  await db('users').where({ id: me.id }).update({ password_hash: await bcrypt.hash(password, 10) });
  await audit(me.id, 'user.password', `user:${me.id}`);
  res.json({ ok: true });
});

// ---- delete account ----
authRouter.delete('/me', requireAuth, async (req, res) => {
  const me = req.user!;
  if (me.is_app_owner) return res.status(400).json({ error: 'The app owner account cannot be deleted' });

  // Audit before deletion so the actor_id is still valid
  await audit(me.id, 'user.delete', `user:${me.id}`);

  await db.transaction(async (trx) => {
    // Remove invites created by this user (created_by is NOT NULL, can't null it)
    await trx('invites').where({ created_by: me.id }).delete();
    // Remove memberships
    await trx('memberships').where({ user_id: me.id }).delete();
    // Delete personal documents (company_id null, owned by me)
    await trx('documents').where({ owner_id: me.id }).whereNull('company_id').delete();
    // Delete API keys
    await trx('api_keys').where({ user_id: me.id }).delete();
    // Delete the user row
    await trx('users').where({ id: me.id }).delete();
  });

  clearAuthCookie(res);
  res.json({ ok: true });
});

// ---- API keys ----
function maskToken(token: string): string {
  return token.slice(0, 8) + '…' + token.slice(-4);
}

authRouter.get('/keys', requireAuth, async (req, res) => {
  const keys = await db('api_keys').where({ user_id: req.user!.id }).orderBy('id', 'desc');
  res.json(keys.map((k) => ({ id: k.id, token: maskToken(k.token), created_at: k.created_at })));
});

authRouter.post('/keys', requireAuth, async (req, res) => {
  const token = 'mk_live_' + randomBytes(16).toString('hex');
  const [key] = await db('api_keys')
    .insert({ user_id: req.user!.id, token })
    .returning('*');
  await audit(req.user!.id, 'user.apikey', `user:${req.user!.id}`, { action: 'created' });
  // Return full token once
  res.json({ id: key.id, token: key.token, created_at: key.created_at });
});

authRouter.delete('/keys/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const key = await db('api_keys').where({ id, user_id: req.user!.id }).first();
  if (!key) return res.status(404).json({ error: 'Key not found' });
  await db('api_keys').where({ id }).delete();
  await audit(req.user!.id, 'user.apikey', `user:${req.user!.id}`, { action: 'revoked' });
  res.json({ ok: true });
});
