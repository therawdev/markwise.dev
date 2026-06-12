import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, audit } from '../db.js';
import { requireAuth, hasPermission } from '../middleware.js';
import { DEFAULT_ROLES, PERMISSIONS, isValidPermissionList } from '../permissions.js';

export const orgsRouter = Router();
orgsRouter.use(requireAuth);

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) ||
    'company-' + Date.now().toString(36)
  );
}

/** The shared permission catalog, for the role-builder UI. */
orgsRouter.get('/permissions', (_req, res) => res.json(PERMISSIONS));

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
    await trx('memberships').insert({ user_id: req.user!.id, company_id: company.id, role_id: ownerRole.id });
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
  await db('invites').insert({
    company_id: companyId,
    role_id: role.id,
    token,
    created_by: req.user!.id,
    expires_at: expires,
  });
  await audit(req.user!.id, 'invite.create', `company:${companyId}`, { role: role.name });
  res.json({ token, expires_at: expires.toISOString() });
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
  await audit(req.user!.id, 'invite.accept', `company:${invite.company_id}`);
  res.json({ ok: true, company });
});
