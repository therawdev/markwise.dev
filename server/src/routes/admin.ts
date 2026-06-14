import { Router } from 'express';
import { db, setSetting, getSetting, audit } from '../db.js';
import { requireAuth, requireAppOwner } from '../middleware.js';
import { setAuthCookie } from '../auth.js';
import { PROVIDERS, providerStatus } from '../providers/index.js';
import { listProviderConfigs, setProviderConfig } from '../providers/config.js';
import { secretsConfigured } from '../secrets.js';
import { aiUsageSummary } from '../usage.js';
import { getQuotas, DEFAULT_QUOTAS, type QuotaConfig } from '../quota.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);

// Leaving impersonation must work for the *impersonated* (non-owner) user,
// so it sits before the app-owner guard.
adminRouter.post('/impersonate/stop', async (req, res) => {
  if (!req.impersonatedBy) return res.status(400).json({ error: 'Not impersonating anyone' });
  const owner = await db('users').where({ id: req.impersonatedBy, is_app_owner: true }).first();
  if (!owner) return res.status(400).json({ error: 'Original admin session not found' });
  setAuthCookie(res, owner.id);
  res.json({ ok: true });
});

adminRouter.use(requireAppOwner);

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

// ---- impersonation: browse Markwise as another (active, non-owner) user ----
adminRouter.post('/impersonate/:id', async (req, res) => {
  const target = await db('users').where({ id: Number(req.params.id) }).first();
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.is_app_owner) return res.status(400).json({ error: 'Cannot impersonate the app owner' });
  if (target.status !== 'active') return res.status(400).json({ error: 'User is suspended' });
  setAuthCookie(res, target.id, req.user!.id);
  await audit(req.user!.id, 'admin.impersonate', `user:${target.id}`, { email: target.email });
  res.json({ ok: true });
});

// ---- platform flags: public signups + maintenance banner ----
adminRouter.get('/platform', async (_req, res) => {
  res.json({
    allow_signups: (await getSetting<boolean>('allow_signups', true)) !== false,
    maintenance: (await getSetting<boolean>('maintenance', false)) === true,
  });
});
adminRouter.put('/platform', async (req, res) => {
  const updates: Record<string, boolean> = {};
  for (const key of ['allow_signups', 'maintenance'] as const) {
    if (typeof req.body?.[key] === 'boolean') updates[key] = req.body[key];
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  for (const [key, value] of Object.entries(updates)) {
    await setSetting(key, value);
    await audit(req.user!.id, 'admin.platform', 'settings', { [key]: value });
  }
  res.json({ ok: true });
});

// ---- daily AI call counts for the overview chart ----
adminRouter.get('/ai-usage-daily', async (_req, res) => {
  const rows = await db('ai_usage')
    .where('created_at', '>=', db.raw("now() - interval '14 days'"))
    .select(db.raw('date(created_at) as day'))
    .count('* as n')
    .groupByRaw('date(created_at)')
    .orderBy('day');
  res.json(rows.map((r: any) => ({ day: r.day, n: Number(r.n) })));
});

adminRouter.put('/users/:id/status', async (req, res) => {
  const userId = Number(req.params.id);
  const status = req.body?.status === 'suspended' ? 'suspended' : 'active';
  if (userId === req.user!.id) return res.status(400).json({ error: 'You cannot suspend yourself' });
  const target = await db('users').where({ id: userId }).first();
  if (!target) return res.status(404).json({ error: 'User not found' });
  await db('users').where({ id: userId }).update({ status });
  await audit(req.user!.id, 'admin.user_status', `user:${userId}`, {
    action: status === 'suspended' ? 'suspend' : 'activate',
    email: target.email,
  });
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
  const target = await db('companies').where({ id: companyId }).first();
  if (!target) return res.status(404).json({ error: 'Company not found' });
  await db('companies').where({ id: companyId }).update({ status });
  await audit(req.user!.id, 'admin.company_status', `company:${companyId}`, {
    action: status === 'suspended' ? 'suspend' : 'activate',
    company: target.name,
  });
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

// ---- AI provider config: API keys & models stored (encrypted) in the DB ----
adminRouter.get('/providers', async (_req, res) => {
  res.json({ secretsConfigured: secretsConfigured(), providers: await listProviderConfigs(null) });
});

adminRouter.put('/providers/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!PROVIDERS[id]) return res.status(400).json({ error: 'Unknown provider' });
  const { enabled, model, apiKey } = req.body || {};
  if (apiKey && !secretsConfigured()) {
    return res.status(400).json({ error: 'SECRETS_KEY is not configured on the server — cannot store keys' });
  }
  await setProviderConfig(id, null, {
    enabled: enabled === undefined ? undefined : !!enabled,
    model: model === undefined ? undefined : model ? String(model) : null,
    apiKey: apiKey === undefined ? undefined : apiKey ? String(apiKey) : null,
  });
  await audit(req.user!.id, 'admin.provider_config', 'provider:' + id, {
    enabled, model: model || null, keyChanged: apiKey !== undefined,
  });
  res.json({ ok: true, providers: await listProviderConfigs(null) });
});

// Live connection test: gate check, then a tiny real completion.
adminRouter.post('/providers/:id/test', async (req, res) => {
  const id = String(req.params.id);
  const p = PROVIDERS[id];
  if (!p) return res.status(400).json({ error: 'Unknown provider' });
  const gate = await p.available();
  if (!gate.ok) return res.json({ ok: false, reason: gate.reason });
  try {
    const out = await p.complete('Reply with only the word: ok');
    res.json({ ok: true, sample: String(out.text).trim().slice(0, 100) });
  } catch (e) {
    res.json({ ok: false, reason: e instanceof Error ? e.message : 'request failed' });
  }
});

// ---- AI quotas (monthly hard limits per plan / individual) ----
adminRouter.get('/quotas', async (_req, res) => {
  res.json(await getQuotas());
});

adminRouter.put('/quotas', async (req, res) => {
  const next: QuotaConfig = { ...DEFAULT_QUOTAS };
  for (const k of ['free_monthly', 'pro_monthly', 'user_monthly'] as const) {
    if (req.body?.[k] !== undefined) {
      const n = Math.floor(Number(req.body[k]));
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: `${k} must be a non-negative number (0 = unlimited)` });
      next[k] = n;
    } else {
      next[k] = (await getQuotas())[k];
    }
  }
  await setSetting('ai_quotas', next);
  await audit(req.user!.id, 'admin.quotas', 'settings', next as unknown as Record<string, unknown>);
  res.json(next);
});

// ---- AI usage (global, across the whole platform) ----
adminRouter.get('/ai-usage', async (req, res) => {
  res.json(await aiUsageSummary({ days: req.query.days ? Number(req.query.days) : undefined }));
});

// ---- AI request log: full prompts / responses for review ----
adminRouter.get('/ai-requests', async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  let q = db('ai_requests')
    .leftJoin('users', 'users.id', 'ai_requests.user_id')
    .leftJoin('companies', 'companies.id', 'ai_requests.company_id')
    .orderBy('ai_requests.id', 'desc');
  if (req.query.provider) q = q.where('ai_requests.provider', String(req.query.provider));
  if (req.query.status) q = q.where('ai_requests.status', String(req.query.status));
  const rows = await q.limit(limit).offset(offset).select(
    'ai_requests.id', 'ai_requests.created_at', 'ai_requests.provider', 'ai_requests.model',
    'ai_requests.status', 'ai_requests.failover', 'ai_requests.latency_ms',
    db.raw('left(ai_requests.prompt, 140) as prompt_preview'),
    'ai_requests.error', 'users.email as user_email', 'companies.name as company_name',
  );
  const [{ count }] = await db('ai_requests').count('* as count');
  res.json({ total: Number(count), rows });
});

adminRouter.get('/ai-requests/:id', async (req, res) => {
  const row = await db('ai_requests')
    .leftJoin('users', 'users.id', 'ai_requests.user_id')
    .leftJoin('companies', 'companies.id', 'ai_requests.company_id')
    .where('ai_requests.id', Number(req.params.id))
    .select('ai_requests.*', 'users.email as user_email', 'companies.name as company_name')
    .first();
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

adminRouter.get('/audit', async (req, res) => {
  const logs = await db('audit_logs')
    .leftJoin('users', 'users.id', 'audit_logs.actor_id')
    .orderBy('audit_logs.id', 'desc')
    .limit(Math.min(Number(req.query.limit) || 100, 500))
    .select('audit_logs.*', 'users.email as actor_email');
  res.json(logs);
});
