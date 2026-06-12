import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, audit } from '../db.js';
import { setAuthCookie, clearAuthCookie } from '../auth.js';
import { requireAuth } from '../middleware.js';

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
});

authRouter.post('/signup', async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and a password of 8+ characters required' });
  const { email, password, name } = parsed.data;

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
  setAuthCookie(res, user.id);
  res.json({ id: user.id, email: user.email, name: user.name, is_app_owner: user.is_app_owner });
});

authRouter.post('/login', async (req, res) => {
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
      'roles.name as role_name',
      'roles.permissions'
    );
  res.json({
    id: req.user!.id,
    email: req.user!.email,
    name: req.user!.name,
    is_app_owner: req.user!.is_app_owner,
    memberships: memberships.map((m) => ({
      company_id: m.company_id,
      company_name: m.company_name,
      company_slug: m.company_slug,
      role: m.role_name,
      permissions: typeof m.permissions === 'string' ? JSON.parse(m.permissions) : m.permissions,
    })),
  });
});
