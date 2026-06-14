import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, audit } from '../db.js';
import { requireAuth, hasPermission } from '../middleware.js';
import { DEFAULT_ROLES, PERMISSIONS, isValidPermissionList } from '../permissions.js';
import { aiUsageSummary } from '../usage.js';
import { aiQuotaStatus } from '../quota.js';
import { listProviderConfigs, setProviderConfig } from '../providers/config.js';
import { secretsConfigured } from '../secrets.js';
import { PROVIDERS } from '../providers/index.js';

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
