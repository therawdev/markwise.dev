import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, audit } from '../db.js';
import { requireAuth, hasPermission } from '../middleware.js';
import { DEFAULT_ROLES, PERMISSIONS, isValidPermissionList } from '../permissions.js';
import { aiUsageSummary } from '../usage.js';
import { aiQuotaStatus, aiMemberQuotaStatus, limitBehaviorFor, orgMemberDefaultCredits } from '../quota.js';
import { listProviderConfigs, setProviderConfig } from '../providers/config.js';
import { secretsConfigured, encryptSecret } from '../secrets.js';
import { PROVIDERS } from '../providers/index.js';
import { getConnectionByCompany, discover } from '../sso.js';

export const orgsRouter = Router();

// Public: what an invite link points at, for the invite landing page.
// No auth — the viewer typically has no account yet. Exposes only company
// name + role + state, nothing else.
orgsRouter.get('/invites/:token/info', async (req, res) => {
  const invite = await db('invites').where({ token: req.params.token }).first();
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  const company = await db('companies').where({ id: invite.company_id }).first();
  const role = await db('roles').where({ id: invite.role_id }).first();
  const usedBy = invite.used_by ? await db('users').where({ id: invite.used_by }).first() : null;
  const state = invite.used_by ? 'used' : new Date(invite.expires_at) < new Date() ? 'expired' : 'active';
  res.json({
    company: company ? company.name : null,
    company_id: invite.company_id,
    role: role ? role.name : null,
    state,
    used_by_email: usedBy ? usedBy.email : null,
    expires_at: invite.expires_at,
  });
});

orgsRouter.use(requireAuth);

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) ||
    'company-' + Date.now().toString(36)
  );
}

/** The shared permission catalog, for the role-builder UI. */
orgsRouter.get('/permissions', (_req, res) => res.json(PERMISSIONS));

// A company's AI usage (any member who can view the org; app owner always).
orgsRouter.get('/:id/ai-usage', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'doc:view')) && !req.user!.is_app_owner) {
    return res.status(403).json({ error: 'No access' });
  }
  res.json(await aiUsageSummary({ companyId, days: req.query.days ? Number(req.query.days) : undefined }));
});

// ---- per-company AI provider config (bring-your-own-key) ----
// A company can store its own provider key/model (encrypted); its members' AI
// calls use it, falling back to the platform default when unset. Gated by
// org:settings since a BYO key is a company-level setting.
async function canManageProviders(req: import('express').Request, companyId: number): Promise<boolean> {
  return req.user!.is_app_owner || (await hasPermission(req.user!, companyId, 'org:settings'));
}

orgsRouter.get('/:id/providers', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await canManageProviders(req, companyId))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  res.json({ secretsConfigured: secretsConfigured(), providers: await listProviderConfigs(companyId) });
});

orgsRouter.put('/:id/providers/:provider', async (req, res) => {
  const companyId = Number(req.params.id);
  const provider = String(req.params.provider);
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Unknown provider' });
  if (!(await canManageProviders(req, companyId))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  const { model, apiKey } = req.body || {};
  if (apiKey && !secretsConfigured()) {
    return res.status(400).json({ error: 'Key storage is not configured on the server — contact the platform admin' });
  }
  await setProviderConfig(provider, companyId, {
    model: model === undefined ? undefined : model ? String(model) : null,
    apiKey: apiKey === undefined ? undefined : apiKey ? String(apiKey) : null,
  });
  await audit(req.user!.id, 'company.provider_config', `company:${companyId}`, {
    provider, model: model || null, keyChanged: apiKey !== undefined,
  });
  res.json({ ok: true, providers: await listProviderConfigs(companyId) });
});

// Live test using the company's resolved config (its key if set, else platform default).
orgsRouter.post('/:id/providers/:provider/test', async (req, res) => {
  const companyId = Number(req.params.id);
  const provider = String(req.params.provider);
  const p = PROVIDERS[provider];
  if (!p) return res.status(400).json({ error: 'Unknown provider' });
  if (!(await canManageProviders(req, companyId))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  const gate = await p.available(companyId);
  if (!gate.ok) return res.json({ ok: false, reason: gate.reason });
  try {
    const out = await p.complete('Reply with only the word: ok', companyId);
    res.json({ ok: true, sample: String(out.text).trim().slice(0, 100) });
  } catch (e) {
    res.json({ ok: false, reason: e instanceof Error ? e.message : 'request failed' });
  }
});

// ---- per-company OIDC single sign-on (org:settings) ----
function ssoCallbackUrl(req: import('express').Request): string {
  const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return base + '/api/sso/callback';
}

orgsRouter.get('/:id/sso', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await canManageProviders(req, companyId))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  const conn = await getConnectionByCompany(companyId);
  const company = await db('companies').where({ id: companyId }).first();
  res.json({
    secretsConfigured: secretsConfigured(),
    sso_allowed: !!company?.sso_allowed, // platform-admin gate
    callback_url: ssoCallbackUrl(req), // register this at the IdP
    connection: conn ? {
      type: conn.type, issuer: conn.issuer, client_id: conn.client_id,
      allowed_domains: conn.allowed_domains, default_role_id: conn.default_role_id,
      enabled: conn.enabled, enforced: conn.enforced, has_secret: !!conn.client_secret_enc,
    } : null,
  });
});

const ssoSchema = z.object({
  issuer: z.string().url().max(300),
  client_id: z.string().min(1).max(300),
  client_secret: z.string().max(600).optional(), // omit to keep existing
  allowed_domains: z.array(z.string().max(255)).max(50).optional(),
  default_role_id: z.number().int().nullable().optional(),
  enabled: z.boolean().optional(),
  enforced: z.boolean().optional(),
});

orgsRouter.put('/:id/sso', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await canManageProviders(req, companyId))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  const parsed = ssoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid issuer URL and client ID are required' });
  const d = parsed.data;
  if (d.client_secret && !secretsConfigured()) {
    return res.status(400).json({ error: 'Key storage is not configured on the server — contact the platform admin' });
  }
  // The org can only switch SSO on once the platform admin has allowed it.
  if (d.enabled) {
    const company = await db('companies').where({ id: companyId }).first();
    if (!company?.sso_allowed) return res.status(403).json({ error: 'Single sign-on must be enabled for your organization by the platform admin first' });
  }
  // A custom default role must belong to this company.
  if (d.default_role_id != null) {
    const role = await db('roles').where({ id: d.default_role_id, company_id: companyId }).first();
    if (!role) return res.status(400).json({ error: 'Default role not found in this company' });
  }
  const domains = (d.allowed_domains || [])
    .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
    .filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s));

  const existing = await getConnectionByCompany(companyId);
  const row: Record<string, unknown> = {
    company_id: companyId, type: 'oidc', issuer: d.issuer.replace(/\/$/, ''), client_id: d.client_id,
    allowed_domains: JSON.stringify(domains),
    default_role_id: d.default_role_id ?? existing?.default_role_id ?? null,
    enabled: d.enabled ?? existing?.enabled ?? false,
    enforced: d.enforced ?? existing?.enforced ?? false,
    updated_at: db.fn.now(),
  };
  if (d.client_secret !== undefined) row.client_secret_enc = d.client_secret ? encryptSecret(d.client_secret) : null;

  if (existing) await db('sso_connections').where({ company_id: companyId }).update(row);
  else await db('sso_connections').insert(row);
  await audit(req.user!.id, 'company.sso_config', `company:${companyId}`, {
    issuer: row.issuer, enabled: row.enabled, enforced: row.enforced, secretChanged: d.client_secret !== undefined,
  });
  res.json({ ok: true });
});

orgsRouter.delete('/:id/sso', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await canManageProviders(req, companyId))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  await db('sso_connections').where({ company_id: companyId }).delete();
  await audit(req.user!.id, 'company.sso_delete', `company:${companyId}`);
  res.json({ ok: true });
});

// Validate the issuer's OIDC discovery document before the org enables SSO.
orgsRouter.post('/:id/sso/test', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await canManageProviders(req, companyId))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  const issuer = String(req.body?.issuer || '');
  if (!/^https:\/\//.test(issuer)) return res.json({ ok: false, reason: 'Issuer must be an https URL' });
  try {
    const doc = await discover(issuer);
    res.json({ ok: true, authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint });
  } catch (e) {
    res.json({ ok: false, reason: e instanceof Error ? e.message : 'Discovery failed' });
  }
});

// ---- org security: require 2FA for password members (org:settings) ----
orgsRouter.put('/:id/security', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await canManageProviders(req, companyId))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  const mfaRequired = req.body?.mfa_required === true;
  await db('companies').where({ id: companyId }).update({ mfa_required: mfaRequired });
  await audit(req.user!.id, 'company.security', `company:${companyId}`, { mfa_required: mfaRequired });
  res.json({ ok: true, mfa_required: mfaRequired });
});

// ---- create a company; creator becomes Owner with system roles seeded ----
orgsRouter.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Company name required' });

  let slug = slugify(name);
  if (await db('companies').where({ slug }).first()) slug = `${slug}-${Date.now().toString(36)}`;

  const company = await db.transaction(async (trx) => {
    const [company] = await trx('companies').insert({ name, slug }).returning('*');
    const roles = await trx('roles')
      .insert(
        DEFAULT_ROLES.map((r) => ({
          company_id: company.id,
          name: r.name,
          is_system: true,
          permissions: JSON.stringify(r.permissions),
        }))
      )
      .returning('*');
    const ownerRole = roles.find((r: any) => r.name === 'Owner')!;
    // The app owner is the platform admin, not a tenant: creating a company
    // must not enroll them as its Owner member. Regular creators do become Owner.
    if (!req.user!.is_app_owner) {
      await trx('memberships').insert({ user_id: req.user!.id, company_id: company.id, role_id: ownerRole.id });
    }
    return company;
  });

  await audit(req.user!.id, 'company.create', `company:${company.id}`, { name });
  res.json(company);
});

// ---- company detail: members + roles ----
orgsRouter.get('/:id', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'doc:view')) && !req.user!.is_app_owner) {
    return res.status(403).json({ error: 'Not a member of this company' });
  }
  const company = await db('companies').where({ id: companyId }).first();
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const members = await db('memberships')
    .join('users', 'users.id', 'memberships.user_id')
    .join('roles', 'roles.id', 'memberships.role_id')
    .where('memberships.company_id', companyId)
    .select('users.id', 'users.name', 'users.email', 'roles.name as role', 'roles.id as role_id');

  const roles = await db('roles').where({ company_id: companyId }).orderBy('id');
  res.json({
    ...company,
    members,
    roles: roles.map((r) => ({
      ...r,
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions,
    })),
  });
});

// ---- roles: create / update / delete (custom roles only) ----
const roleSchema = z.object({ name: z.string().min(1).max(60), permissions: z.array(z.string()) });

orgsRouter.post('/:id/roles', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'org:manage_roles'))) {
    return res.status(403).json({ error: 'You need the manage-roles permission' });
  }
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success || !isValidPermissionList(parsed.data.permissions)) {
    return res.status(400).json({ error: 'Role needs a name and a valid permission list' });
  }
  try {
    const [role] = await db('roles')
      .insert({
        company_id: companyId,
        name: parsed.data.name,
        is_system: false,
        permissions: JSON.stringify(parsed.data.permissions),
      })
      .returning('*');
    await audit(req.user!.id, 'role.create', `role:${role.id}`, { company_id: companyId, name: role.name });
    res.json(role);
  } catch {
    res.status(409).json({ error: 'A role with this name already exists' });
  }
});

orgsRouter.put('/:id/roles/:roleId', async (req, res) => {
  const companyId = Number(req.params.id);
  const roleId = Number(req.params.roleId);
  if (!(await hasPermission(req.user!, companyId, 'org:manage_roles'))) {
    return res.status(403).json({ error: 'You need the manage-roles permission' });
  }
  const role = await db('roles').where({ id: roleId, company_id: companyId }).first();
  if (!role) return res.status(404).json({ error: 'Role not found' });

  const parsed = roleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role payload' });
  const patch: Record<string, unknown> = {};
  // System roles keep their name; Owner keeps its permissions (so an org can't lock itself out).
  if (parsed.data.name && !role.is_system) patch.name = parsed.data.name;
  if (parsed.data.permissions) {
    if (!isValidPermissionList(parsed.data.permissions)) return res.status(400).json({ error: 'Invalid permissions' });
    if (role.is_system && role.name === 'Owner') return res.status(400).json({ error: 'The Owner role cannot be changed' });
    patch.permissions = JSON.stringify(parsed.data.permissions);
  }
  await db('roles').where({ id: roleId }).update(patch);
  await audit(req.user!.id, 'role.update', `role:${roleId}`, patch);
  res.json({ ok: true });
});

orgsRouter.delete('/:id/roles/:roleId', async (req, res) => {
  const companyId = Number(req.params.id);
  const roleId = Number(req.params.roleId);
  if (!(await hasPermission(req.user!, companyId, 'org:manage_roles'))) {
    return res.status(403).json({ error: 'You need the manage-roles permission' });
  }
  const role = await db('roles').where({ id: roleId, company_id: companyId }).first();
  if (!role) return res.status(404).json({ error: 'Role not found' });
  if (role.is_system) return res.status(400).json({ error: 'Default roles cannot be deleted' });
  const inUse = await db('memberships').where({ role_id: roleId }).first();
  if (inUse) return res.status(400).json({ error: 'Role is assigned to members — reassign them first' });
  await db('roles').where({ id: roleId }).delete();
  await audit(req.user!.id, 'role.delete', `role:${roleId}`);
  res.json({ ok: true });
});

// ---- members ----
orgsRouter.put('/:id/members/:userId', async (req, res) => {
  const companyId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!(await hasPermission(req.user!, companyId, 'org:manage_members'))) {
    return res.status(403).json({ error: 'You need the manage-members permission' });
  }
  const role = await db('roles').where({ id: Number(req.body?.role_id), company_id: companyId }).first();
  if (!role) return res.status(400).json({ error: 'Invalid role' });
  await db('memberships').where({ company_id: companyId, user_id: userId }).update({ role_id: role.id });
  await audit(req.user!.id, 'member.role_change', `user:${userId}`, { company_id: companyId, role: role.name });
  res.json({ ok: true });
});

orgsRouter.delete('/:id/members/:userId', async (req, res) => {
  const companyId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!(await hasPermission(req.user!, companyId, 'org:manage_members'))) {
    return res.status(403).json({ error: 'You need the manage-members permission' });
  }
  if (userId === req.user!.id) return res.status(400).json({ error: 'You cannot remove yourself' });
  await db('memberships').where({ company_id: companyId, user_id: userId }).delete();
  await audit(req.user!.id, 'member.remove', `user:${userId}`, { company_id: companyId });
  res.json({ ok: true });
});

// ---- invites (link/code based) ----
orgsRouter.post('/:id/invites', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'org:manage_members'))) {
    return res.status(403).json({ error: 'You need the manage-members permission' });
  }
  const role = await db('roles').where({ id: Number(req.body?.role_id), company_id: companyId }).first();
  if (!role) return res.status(400).json({ error: 'Invalid role' });

  const token = crypto.randomBytes(18).toString('base64url');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const [created] = await db('invites')
    .insert({
      company_id: companyId,
      role_id: role.id,
      token,
      created_by: req.user!.id,
      expires_at: expires,
    })
    .returning('id');
  const inviteId = typeof created === 'object' ? created.id : created;
  await audit(req.user!.id, 'invite.create', `company:${companyId}`, { invite_id: inviteId, role: role.name });
  res.json({ token, expires_at: expires.toISOString() });
});

// ---- list invites: the org Owner / app owner see all, other managers only their own ----
orgsRouter.get('/:id/invites', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'org:manage_members'))) {
    return res.status(403).json({ error: 'You need the manage-members permission' });
  }
  const mine = await db('memberships')
    .join('roles', 'roles.id', 'memberships.role_id')
    .where({ 'memberships.company_id': companyId, 'memberships.user_id': req.user!.id })
    .select('roles.name as role')
    .first();
  const seeAll = req.user!.is_app_owner || (mine && mine.role === 'Owner');
  let q = db('invites')
    .leftJoin('users as ju', 'ju.id', 'invites.used_by')
    .leftJoin('users as cu', 'cu.id', 'invites.created_by')
    .join('roles', 'roles.id', 'invites.role_id')
    .where('invites.company_id', companyId)
    .orderBy('invites.id', 'desc')
    .select(
      'invites.id', 'invites.token', 'invites.expires_at', 'invites.created_at', 'invites.used_by',
      'invites.role_id', 'roles.name as role', 'ju.email as used_by_email', 'cu.email as created_by_email'
    );
  if (!seeAll) q = q.where('invites.created_by', req.user!.id);
  res.json(await q);
});

// ---- delete an invite (revokes the link; same visibility scoping as the list) ----
orgsRouter.delete('/:id/invites/:inviteId', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'org:manage_members'))) {
    return res.status(403).json({ error: 'You need the manage-members permission' });
  }
  const invite = await db('invites').where({ id: Number(req.params.inviteId), company_id: companyId }).first();
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  const mine = await db('memberships')
    .join('roles', 'roles.id', 'memberships.role_id')
    .where({ 'memberships.company_id': companyId, 'memberships.user_id': req.user!.id })
    .select('roles.name as role')
    .first();
  const seeAll = req.user!.is_app_owner || (mine && mine.role === 'Owner');
  if (!seeAll && invite.created_by !== req.user!.id) {
    return res.status(403).json({ error: 'You can only delete invites you created' });
  }
  const role = await db('roles').where({ id: invite.role_id }).first();
  await db('invites').where({ id: invite.id }).delete();
  await audit(req.user!.id, 'invite.delete', `company:${companyId}`, {
    invite_id: invite.id,
    role: role ? role.name : invite.role_id,
    state: invite.used_by ? 'used' : new Date(invite.expires_at) < new Date() ? 'expired' : 'active',
  });
  res.json({ ok: true });
});

// ---- company activity: the audit trail scoped to one company ----
orgsRouter.get('/:id/activity', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'doc:view')) && !req.user!.is_app_owner) {
    return res.status(403).json({ error: 'Not a member of this company' });
  }
  const logs = await db('audit_logs')
    .leftJoin('users', 'users.id', 'audit_logs.actor_id')
    .where('audit_logs.target', `company:${companyId}`)
    .orWhere('audit_logs.detail', '@>', JSON.stringify({ company_id: companyId }))
    .orderBy('audit_logs.id', 'desc')
    .limit(200)
    .select('audit_logs.*', 'users.email as actor_email');
  res.json(logs);
});

// ---- company: rename ----
orgsRouter.put('/:id', async (req, res) => {
  const companyId = Number(req.params.id);
  const company = await db('companies').where({ id: companyId }).first();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!req.user!.is_app_owner && !(await hasPermission(req.user!, companyId, 'org:settings'))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Company name required' });
  await db('companies').where({ id: companyId }).update({ name });
  await audit(req.user!.id, 'company.update', `company:${companyId}`, { name });
  res.json({ ok: true });
});

// ---- company: delete ----
orgsRouter.delete('/:id', async (req, res) => {
  const companyId = Number(req.params.id);
  const company = await db('companies').where({ id: companyId }).first();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!req.user!.is_app_owner && !(await hasPermission(req.user!, companyId, 'org:settings'))) {
    return res.status(403).json({ error: 'You need the company settings permission' });
  }
  const companyName = company.name;
  await db.transaction(async (trx) => {
    // Docs become personal (company_id = null)
    await trx('documents').where({ company_id: companyId }).update({ company_id: null });
    // Memberships, invites, roles cascade via DB ON DELETE CASCADE (or explicit)
    await trx('memberships').where({ company_id: companyId }).delete();
    await trx('invites').where({ company_id: companyId }).delete();
    await trx('roles').where({ company_id: companyId }).delete();
    await trx('companies').where({ id: companyId }).delete();
  });
  await audit(req.user!.id, 'company.delete', `company:${companyId}`, { name: companyName });
  res.json({ ok: true });
});

// ---- company: update plan ----
orgsRouter.put('/:id/plan', async (req, res) => {
  const companyId = Number(req.params.id);
  const company = await db('companies').where({ id: companyId }).first();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!req.user!.is_app_owner && !(await hasPermission(req.user!, companyId, 'org:billing'))) {
    return res.status(403).json({ error: 'You need the billing permission' });
  }
  const plan = String(req.body?.plan || '').trim();
  if (plan !== 'free' && plan !== 'pro') return res.status(400).json({ error: 'Plan must be free or pro' });
  await db('companies').where({ id: companyId }).update({ plan });
  await audit(req.user!.id, 'billing.update', `company:${companyId}`, { plan });
  res.json({ ok: true });
});

// ---- company: usage ----
orgsRouter.get('/:id/usage', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'doc:view')) && !req.user!.is_app_owner) {
    return res.status(403).json({ error: 'Not a member of this company' });
  }
  const docsCount = await db('documents')
    .where({ company_id: companyId })
    .whereNull('deleted_at')
    .count('id as count')
    .first();
  // Successful completions this month, matching the quota the server enforces.
  const quota = await aiQuotaStatus({ companyId });
  res.json({
    docs: Number((docsCount as any)?.count ?? 0),
    ai_month: quota.used,
    ai_limit: quota.limit, // 0 = unlimited
  });
});

// ---- AI credits: the company's monthly pool + each member's allocation. The org
// owner (org:billing) distributes credits per member; the app owner tops up the pool.
orgsRouter.get('/:id/credits', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'org:billing')) && !req.user!.is_app_owner) {
    return res.status(403).json({ error: 'You need the billing permission' });
  }
  const company = await db('companies').where({ id: companyId }).first();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const pool = await aiQuotaStatus({ companyId });
  const def = await orgMemberDefaultCredits();
  const members = await db('memberships')
    .join('users', 'users.id', 'memberships.user_id')
    .join('roles', 'roles.id', 'memberships.role_id')
    .where('memberships.company_id', companyId)
    .select('users.id', 'users.name', 'users.email', 'roles.name as role', 'memberships.ai_credit_limit');
  const rows = [];
  for (const m of members) {
    const st = await aiMemberQuotaStatus(companyId, m.id, def);
    rows.push({
      user_id: m.id, name: m.name, email: m.email, role: m.role,
      limit: st.limit, used: st.used, remaining: st.remaining, unlimited: st.unlimited,
      custom: m.ai_credit_limit != null,
    });
  }
  const value = company.ai_limit_behavior === 'block' || company.ai_limit_behavior === 'fallback' ? company.ai_limit_behavior : null;
  res.json({
    pool: { used: pool.used, limit: pool.limit, remaining: pool.remaining, unlimited: pool.unlimited },
    default_member_credits: def,
    behavior: { value, effective: await limitBehaviorFor(companyId), can_org_set: !!company.org_can_set_limit_behavior },
    members: rows,
    // App-owner-only raw controls (pool top-up, behaviour, delegation).
    ...(req.user!.is_app_owner ? { admin: {
      plan: company.plan,
      ai_credit_limit: company.ai_credit_limit == null ? null : Number(company.ai_credit_limit),
      ai_limit_behavior: value,
      org_can_set_limit_behavior: !!company.org_can_set_limit_behavior,
    } } : {}),
  });
});

// App owner only: top up the company pool, set behaviour directly, and delegate the
// behaviour choice to the org owner.
orgsRouter.put('/:id/admin-credits', async (req, res) => {
  if (!req.user!.is_app_owner) return res.status(403).json({ error: 'App owner only' });
  const companyId = Number(req.params.id);
  const company = await db('companies').where({ id: companyId }).first();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const patch: Record<string, unknown> = {};
  if (req.body?.ai_credit_limit !== undefined) {
    const v = req.body.ai_credit_limit;
    if (v === null || v === '') patch.ai_credit_limit = null;
    else {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'ai_credit_limit must be a non-negative number or null' });
      patch.ai_credit_limit = n;
    }
  }
  if (req.body?.ai_limit_behavior !== undefined) {
    const b = req.body.ai_limit_behavior;
    if (b !== null && b !== 'block' && b !== 'fallback') return res.status(400).json({ error: 'ai_limit_behavior must be "block", "fallback", or null' });
    patch.ai_limit_behavior = b;
  }
  if (req.body?.org_can_set_limit_behavior !== undefined) {
    patch.org_can_set_limit_behavior = !!req.body.org_can_set_limit_behavior;
  }
  if (Object.keys(patch).length) {
    await db('companies').where({ id: companyId }).update(patch);
    await audit(req.user!.id, 'admin.company_credits', `company:${companyId}`, patch);
  }
  res.json({ ok: true });
});

// The signed-in member's own credit standing in this company (for their bar).
orgsRouter.get('/:id/my-credits', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'doc:view')) && !req.user!.is_app_owner) {
    return res.status(403).json({ error: 'Not a member of this company' });
  }
  res.json(await aiMemberQuotaStatus(companyId, req.user!.id));
});

// Set a member's monthly credit cap (null = org default, 0 = unlimited).
const memberCreditsSchema = z.object({ limit: z.number().int().min(0).max(1_000_000).nullable() });
orgsRouter.put('/:id/members/:userId/credits', async (req, res) => {
  const companyId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!(await hasPermission(req.user!, companyId, 'org:billing'))) {
    return res.status(403).json({ error: 'You need the billing permission' });
  }
  const parsed = memberCreditsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'limit must be a non-negative integer or null' });
  const membership = await db('memberships').where({ company_id: companyId, user_id: userId }).first();
  if (!membership) return res.status(404).json({ error: 'Not a member of this company' });
  await db('memberships').where({ company_id: companyId, user_id: userId }).update({ ai_credit_limit: parsed.data.limit });
  await audit(req.user!.id, 'member.credits', `user:${userId}`, { company_id: companyId, limit: parsed.data.limit });
  res.json(await aiMemberQuotaStatus(companyId, userId));
});

// Org owner sets the at-limit behaviour — only when the app owner has delegated it.
const behaviorSchema = z.object({ behavior: z.enum(['block', 'fallback']) });
orgsRouter.put('/:id/limit-behavior', async (req, res) => {
  const companyId = Number(req.params.id);
  if (!(await hasPermission(req.user!, companyId, 'org:billing'))) {
    return res.status(403).json({ error: 'You need the billing permission' });
  }
  const company = await db('companies').where({ id: companyId }).first();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!company.org_can_set_limit_behavior) {
    return res.status(403).json({ error: 'The app owner has not enabled this control for your company' });
  }
  const parsed = behaviorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'behavior must be "block" or "fallback"' });
  await db('companies').where({ id: companyId }).update({ ai_limit_behavior: parsed.data.behavior });
  await audit(req.user!.id, 'company.limit_behavior', `company:${companyId}`, { behavior: parsed.data.behavior });
  res.json({ behavior: parsed.data.behavior });
});

// Accept an invite (any signed-in user).
orgsRouter.post('/invites/:token/accept', async (req, res) => {
  const invite = await db('invites').where({ token: req.params.token }).first();
  if (!invite || invite.used_by || new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Invite is invalid or expired' });
  }
  const already = await db('memberships').where({ user_id: req.user!.id, company_id: invite.company_id }).first();
  if (already) return res.status(409).json({ error: 'You are already a member of this company' });

  await db.transaction(async (trx) => {
    await trx('memberships').insert({
      user_id: req.user!.id,
      company_id: invite.company_id,
      role_id: invite.role_id,
    });
    await trx('invites').where({ id: invite.id }).update({ used_by: req.user!.id });
  });
  const company = await db('companies').where({ id: invite.company_id }).first();
  await audit(req.user!.id, 'invite.accept', `company:${invite.company_id}`, { invite_id: invite.id, company: company.name });
  res.json({ ok: true, company });
});
