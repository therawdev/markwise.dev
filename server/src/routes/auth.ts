import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import QRCode from 'qrcode';
import { db, audit, getSetting } from '../db.js';
import {
  createSession, destroySession, clearAuthCookie, COOKIE, verifyToken, signMfaToken, verifyMfaToken,
} from '../auth.js';
import { requireAuth, permissionsFor } from '../middleware.js';
import { authLimiter } from '../rate-limit.js';
import { secretsConfigured, encryptSecret, decryptSecret } from '../secrets.js';
import { generateSecret, verifyTotp, otpauthUri, generateRecoveryCodes, hashRecoveryCodes, consumeRecoveryCode } from '../totp.js';
import { getEnforcedConnectionForEmail } from '../sso.js';

export const authRouter = Router();

// Consecutive password failures before an account is briefly locked.
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

/** True when any of the user's companies requires 2FA for password members. */
async function mfaRequiredByOrg(userId: number): Promise<boolean> {
  const row = await db('memberships')
    .join('companies', 'companies.id', 'memberships.company_id')
    .where('memberships.user_id', userId)
    .where('companies.mfa_required', true)
    .first();
  return !!row;
}

/** Finish a successful login: start a session and return the user payload. */
async function loginOk(req: import('express').Request, res: import('express').Response, user: any) {
  await createSession(res, user.id, { userAgent: req.headers['user-agent'] });
  res.json({ id: user.id, email: user.email, name: user.name, is_app_owner: user.is_app_owner });
}

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

  // If the email's domain is under an enforced SSO org, no password accounts.
  if (await getEnforcedConnectionForEmail(email)) {
    return res.status(403).json({ error: 'Your organization requires single sign-on — use the SSO option to sign in' });
  }

  // Email-domain auto-join: a non-invited signup whose domain matches a company is
  // added as a *pending* member and cannot sign in until an owner approves.
  const emailDomain = email.toLowerCase().split('@')[1] || '';
  const domainCompanies = !invite && emailDomain
    ? await db('companies').whereRaw('email_domains @> ?::jsonb', [JSON.stringify([emailDomain])])
    : [];
  const pending = domainCompanies.length > 0;

  const [user] = await db('users')
    .insert({
      email: email.toLowerCase(),
      password_hash: await bcrypt.hash(password, 10),
      name: name || email.split('@')[0],
      status: pending ? 'pending' : 'active',
    })
    .returning('*');
  await audit(user.id, 'user.signup', `user:${user.id}`);

  if (pending) {
    for (const co of domainCompanies) {
      const userRole = await db('roles').where({ company_id: co.id, name: 'User' }).first();
      if (userRole) await db('memberships').insert({ user_id: user.id, company_id: co.id, role_id: userRole.id, status: 'pending' });
      await audit(user.id, 'member.join_request', `company:${co.id}`, { company: co.name });
    }
    // No session is issued — the account stays pending until an owner approves it.
    return res.json({ pending: true, message: `Your account is awaiting approval by ${domainCompanies.map((c) => c.name).join(', ')}.` });
  }

  let joined: any = null;
  if (invite) {
    await db.transaction(async (trx) => {
      await trx('memberships').insert({ user_id: user.id, company_id: invite.company_id, role_id: invite.role_id });
      await trx('invites').where({ id: invite.id }).update({ used_by: user.id });
    });
    joined = await db('companies').where({ id: invite.company_id }).first();
    await audit(user.id, 'invite.accept', `company:${invite.company_id}`, { invite_id: invite.id, company: joined?.name });
  }
  await createSession(res, user.id, { userAgent: req.headers['user-agent'] });
  res.json({
    id: user.id, email: user.email, name: user.name, is_app_owner: user.is_app_owner,
    joined: joined ? { id: joined.id, name: joined.name } : null,
  });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password required' });
  const { email, password } = parsed.data;

  // Enforced SSO wins even for accounts that still have a password.
  if (await getEnforcedConnectionForEmail(email)) {
    return res.status(403).json({ error: 'Your organization requires single sign-on — use the SSO option to sign in' });
  }

  const user = await db('users').whereRaw('lower(email) = ?', email.toLowerCase()).first();
  // SSO-provisioned accounts have no password — point them at single sign-on.
  if (user && !user.password_hash) {
    return res.status(403).json({ error: 'This account uses single sign-on — use your organization’s SSO to sign in' });
  }
  // Account lockout after repeated failures.
  if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
    return res.status(429).json({ error: `Too many failed attempts — try again in ${mins} minute${mins === 1 ? '' : 's'}` });
  }

  const passwordOk = !!user && !!user.password_hash && (await bcrypt.compare(password, user.password_hash));
  if (!passwordOk) {
    if (user) {
      // Count the failure; lock the account once the threshold is crossed.
      const fails = (user.failed_logins || 0) + 1;
      const patch: Record<string, unknown> = { failed_logins: fails };
      if (fails >= LOCKOUT_THRESHOLD) {
        patch.failed_logins = 0;
        patch.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
        await audit(user.id, 'user.locked', `user:${user.id}`, { minutes: LOCKOUT_MINUTES });
      }
      await db('users').where({ id: user.id }).update(patch);
    }
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  if (user.status === 'pending') return res.status(403).json({ error: 'Your account is awaiting approval by a company owner.' });
  if (user.status !== 'active') return res.status(403).json({ error: 'Account suspended' });

  // Successful password → clear any failure/lock counters.
  if (user.failed_logins || user.locked_until) {
    await db('users').where({ id: user.id }).update({ failed_logins: 0, locked_until: null });
  }

  // Second factor: enrolled users owe a code; if an org requires 2FA and the user
  // hasn't set it up, force enrolment before the session is issued.
  if (user.mfa_enabled) {
    return res.json({ mfa_required: true, mfa_token: signMfaToken(user.id, 'mfa') });
  }
  if (await mfaRequiredByOrg(user.id)) {
    return res.json({ mfa_setup_required: true, mfa_token: signMfaToken(user.id, 'mfa_setup') });
  }

  await loginOk(req, res, user);
});

authRouter.post('/logout', async (req, res) => {
  // End the server-side session so the (still-unexpired) cookie can't be reused.
  const token = req.cookies?.[COOKIE];
  const payload = token ? verifyToken(token) : null;
  if (payload) await destroySession(payload.sid);
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
  // Company-wide events (target `company:X`) are org-administrative — invites,
  // billing, settings, provider-key changes. Only surface them to members who can
  // administer that company; a regular member must NOT see another role's admin
  // activity. Everyone still receives events directed at them personally
  // (target `user:me`), e.g. their role changing or a doc being shared with them.
  const ORG_ADMIN_PERMS = ['org:manage_members', 'org:manage_roles', 'org:settings', 'org:billing'];
  const adminCompanyIds: number[] = [];
  for (const cid of myCompanyIds) {
    if (me.is_app_owner) { adminCompanyIds.push(cid); continue; }
    const perms = await permissionsFor(me.id, cid);
    if (ORG_ADMIN_PERMS.some((p) => perms.has(p))) adminCompanyIds.push(cid);
  }
  const items = await db('audit_logs')
    .leftJoin('users', 'users.id', 'audit_logs.actor_id')
    .whereNot('audit_logs.actor_id', me.id) // never notify me about what I did
    .andWhere((b) => {
      b.where('audit_logs.target', `user:${me.id}`);
      if (adminCompanyIds.length) b.orWhereIn('audit_logs.target', adminCompanyIds.map((id) => `company:${id}`));
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

// ---- MFA (TOTP) ----
// Resolve the acting user from either a live session or a one-time 'mfa_setup'
// token (used when an org forces enrolment mid-login, before a session exists).
async function mfaActor(req: import('express').Request): Promise<{ user: any; viaSetup: boolean } | null> {
  const tok = req.cookies?.[COOKIE];
  const payload = tok ? verifyToken(tok) : null;
  if (payload) {
    const u = await db('users').where({ id: payload.uid }).first();
    if (u && u.status === 'active') return { user: u, viaSetup: false };
  }
  const setupTok = typeof req.body?.mfa_token === 'string' ? req.body.mfa_token : null;
  if (setupTok) {
    const uid = verifyMfaToken(setupTok, 'mfa_setup');
    if (uid) {
      const u = await db('users').where({ id: uid }).first();
      if (u && u.status === 'active') return { user: u, viaSetup: true };
    }
  }
  return null;
}

// Status for the settings UI.
authRouter.get('/mfa', requireAuth, async (req, res) => {
  const u = await db('users').where({ id: req.user!.id }).first();
  res.json({
    enabled: !!u.mfa_enabled,
    required: await mfaRequiredByOrg(req.user!.id), // org enforces it → can't disable
    secretsConfigured: secretsConfigured(),
    is_sso: !u.password_hash,
  });
});

// Begin enrolment: issue a fresh secret + QR. Not active until verified.
authRouter.post('/mfa/setup', async (req, res) => {
  if (!secretsConfigured()) return res.status(400).json({ error: 'Server secret storage is not configured' });
  const actor = await mfaActor(req);
  if (!actor) return res.status(401).json({ error: 'Not signed in' });
  if (actor.user.mfa_enabled) return res.status(400).json({ error: 'Two-factor is already enabled' });

  const secret = generateSecret();
  await db('users').where({ id: actor.user.id }).update({ mfa_secret_enc: encryptSecret(secret) });
  const uri = otpauthUri(secret, actor.user.email);
  const qr_svg = await QRCode.toString(uri, { type: 'svg', margin: 1, width: 200 });
  res.json({ secret, otpauth_uri: uri, qr_svg });
});

// Verify the first code and turn 2FA on; returns one-time recovery codes.
authRouter.post('/mfa/enable', async (req, res) => {
  const actor = await mfaActor(req);
  if (!actor) return res.status(401).json({ error: 'Not signed in' });
  const user = actor.user;
  if (user.mfa_enabled) return res.status(400).json({ error: 'Two-factor is already enabled' });
  if (!user.mfa_secret_enc) return res.status(400).json({ error: 'Start setup first' });

  let secret: string;
  try { secret = decryptSecret(user.mfa_secret_enc); } catch { return res.status(400).json({ error: 'Setup expired — start again' }); }
  if (!verifyTotp(secret, String(req.body?.code || ''))) return res.status(400).json({ error: 'That code is not valid — check your authenticator and try again' });

  const recovery = generateRecoveryCodes();
  await db('users').where({ id: user.id }).update({
    mfa_enabled: true,
    mfa_recovery_enc: encryptSecret(JSON.stringify(hashRecoveryCodes(recovery))),
  });
  await audit(user.id, 'user.mfa_enable', `user:${user.id}`);
  // If this completed a forced mid-login enrolment, issue the session now.
  if (actor.viaSetup) await createSession(res, user.id, { userAgent: req.headers['user-agent'] });
  res.json({ ok: true, recovery_codes: recovery });
});

// Second-factor step at login: exchange the 'mfa' token + code for a session.
authRouter.post('/mfa/verify', authLimiter, async (req, res) => {
  const uid = verifyMfaToken(String(req.body?.mfa_token || ''), 'mfa');
  if (!uid) return res.status(401).json({ error: 'Your sign-in attempt expired — start again' });
  const user = await db('users').where({ id: uid }).first();
  if (!user || !user.mfa_enabled || user.status !== 'active') return res.status(401).json({ error: 'Sign in again' });

  const code = String(req.body?.code || '').trim();
  let ok = false;
  try {
    if (user.mfa_secret_enc && verifyTotp(decryptSecret(user.mfa_secret_enc), code)) ok = true;
  } catch { /* fall through */ }
  // Recovery code fallback (single use).
  if (!ok && user.mfa_recovery_enc) {
    try {
      const remaining = consumeRecoveryCode(code, JSON.parse(decryptSecret(user.mfa_recovery_enc)));
      if (remaining) { ok = true; await db('users').where({ id: user.id }).update({ mfa_recovery_enc: encryptSecret(JSON.stringify(remaining)) }); await audit(user.id, 'user.mfa_recovery_used', `user:${user.id}`); }
    } catch { /* ignore */ }
  }
  if (!ok) return res.status(400).json({ error: 'That code is not valid' });
  await loginOk(req, res, user);
});

// Turn 2FA off — blocked while an org requires it. Re-verify with a current code.
authRouter.post('/mfa/disable', requireAuth, async (req, res) => {
  const user = await db('users').where({ id: req.user!.id }).first();
  if (!user.mfa_enabled) return res.status(400).json({ error: 'Two-factor is not enabled' });
  if (await mfaRequiredByOrg(user.id)) return res.status(403).json({ error: 'Your organization requires two-factor authentication — it can’t be turned off' });
  let ok = false;
  try { ok = !!user.mfa_secret_enc && verifyTotp(decryptSecret(user.mfa_secret_enc), String(req.body?.code || '')); } catch { /* */ }
  if (!ok) return res.status(400).json({ error: 'Enter a current authenticator code to turn off two-factor' });
  await db('users').where({ id: user.id }).update({ mfa_enabled: false, mfa_secret_enc: null, mfa_recovery_enc: null });
  await audit(user.id, 'user.mfa_disable', `user:${user.id}`);
  res.json({ ok: true });
});

// ---- active sessions: list / revoke one / revoke all others ----
authRouter.get('/sessions', requireAuth, async (req, res) => {
  const rows = await db('sessions')
    .where({ user_id: req.user!.id })
    .orderBy('last_seen', 'desc')
    .select('id', 'user_agent', 'impersonated_by', 'created_at', 'last_seen');
  res.json(rows.map((s) => ({
    id: s.id,
    user_agent: s.user_agent || '',
    impersonated: !!s.impersonated_by,
    created_at: s.created_at,
    last_seen: s.last_seen,
    current: s.id === req.sessionId,
  })));
});

authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const sid = String(req.params.id);
  const sess = await db('sessions').where({ id: sid, user_id: req.user!.id }).first();
  if (!sess) return res.status(404).json({ error: 'Session not found' });
  await db('sessions').where({ id: sid }).delete();
  res.json({ ok: true, was_current: sid === req.sessionId });
});

authRouter.post('/sessions/revoke-others', requireAuth, async (req, res) => {
  const n = await db('sessions').where({ user_id: req.user!.id }).whereNot('id', req.sessionId!).delete();
  await audit(req.user!.id, 'user.sessions_revoked', `user:${req.user!.id}`, { count: n });
  res.json({ ok: true, revoked: n });
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
