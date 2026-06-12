import { Router } from 'express';
import { db, setSetting, audit } from '../db.js';
import { requireAuth, requireAppOwner } from '../middleware.js';
import { PROVIDERS, providerStatus } from '../providers/index.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAppOwner);

adminRouter.get('/stats', async (_req, res) => {
  const [users] = await db('users').count('* as n');
  const [companies] = await db('companies').count('* as n');
  const [docs] = await db('documents').count('* as n');
  const [aiCalls] = await db('ai_usage').count('* as n');
  res.json({
    users: Number(users.n),
    companies: Number(companies.n),
    documents: Number(docs.n),
    ai_calls: Number(aiCalls.n),
    ai: await providerStatus(),
  });
});

adminRouter.get('/users', async (_req, res) => {
  const users = await db('users')
    .select('id', 'email', 'name', 'is_app_owner', 'status', 'created_at')
    .orderBy('id');
  res.json(users);
});

adminRouter.put('/users/:id/status', async (req, res) => {
  const userId = Number(req.params.id);
  const status = req.body?.status === 'suspended' ? 'suspended' : 'active';
  if (userId === req.user!.id) return res.status(400).json({ error: 'You cannot suspend yourself' });
  await db('users').where({ id: userId }).update({ status });
  await audit(req.user!.id, 'admin.user_status', `user:${userId}`, { status });
  res.json({ ok: true });
});

adminRouter.get('/companies', async (_req, res) => {
  const companies = await db('companies')
    .leftJoin('memberships', 'memberships.company_id', 'companies.id')
    .groupBy('companies.id')
    .orderBy('companies.id')
    .select('companies.*')
    .count('memberships.id as member_count');
  res.json(companies);
});

adminRouter.put('/companies/:id/status', async (req, res) => {
  const companyId = Number(req.params.id);
  const status = req.body?.status === 'suspended' ? 'suspended' : 'active';
  await db('companies').where({ id: companyId }).update({ status });
  await audit(req.user!.id, 'admin.company_status', `company:${companyId}`, { status });
  res.json({ ok: true });
});

// ---- AI provider controls ----
adminRouter.put('/ai-provider', async (req, res) => {
  const id = String(req.body?.provider || '');
  if (!PROVIDERS[id]) return res.status(400).json({ error: 'Unknown provider' });
  if (id === 'claude') {
    const gate = await PROVIDERS.claude.available();
    if (!gate.ok) return res.status(400).json({ error: gate.reason });
  }
  await setSetting('ai_provider', id);
  await audit(req.user!.id, 'admin.ai_provider', 'settings', { provider: id });
  res.json(await providerStatus());
});

adminRouter.put('/claude-enabled', async (req, res) => {
  const enabled = req.body?.enabled === true;
  await setSetting('claude_api_enabled', enabled);
  await audit(req.user!.id, 'admin.claude_toggle', 'settings', { enabled });
  res.json({ ok: true, enabled });
});

adminRouter.get('/audit', async (req, res) => {
  const logs = await db('audit_logs')
    .leftJoin('users', 'users.id', 'audit_logs.actor_id')
    .orderBy('audit_logs.id', 'desc')
    .limit(Math.min(Number(req.query.limit) || 100, 500))
    .select('audit_logs.*', 'users.email as actor_email');
  res.json(logs);
});
