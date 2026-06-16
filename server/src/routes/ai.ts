import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, hasPermission } from '../middleware.js';
import { activeProvider, providerStatus, PROVIDERS } from '../providers/index.js';
import { resolveRuntime } from '../providers/config.js';
import { aiUsageSummary } from '../usage.js';
import { aiLimiter } from '../rate-limit.js';
import { aiQuotaStatus, aiGenerationGate, aiMemberQuotaStatus } from '../quota.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.get('/status', async (_req, res) => {
  res.json(await providerStatus());
});

// The signed-in user's own AI usage.
aiRouter.get('/usage', async (req, res) => {
  res.json(await aiUsageSummary({ userId: req.user!.id, days: req.query.days ? Number(req.query.days) : undefined }));
});

// The signed-in user's monthly quota standing (personal scope, or a company's when ?company_id given).
aiRouter.get('/quota', async (req, res) => {
  const companyId = req.query.company_id ? Number(req.query.company_id) : null;
  if (companyId != null && !(await hasPermission(req.user!, companyId, 'doc:view'))) {
    return res.status(403).json({ error: 'No access' });
  }
  // A member's "personal" bar shows their company-member credit standing (since their
  // usage draws the company pool) when they belong to exactly one company.
  if (companyId == null && !req.user!.is_app_owner) {
    const ms = await db('memberships').where({ user_id: req.user!.id, status: 'active' }).select('company_id');
    if (ms.length === 1) return res.json(await aiMemberQuotaStatus(ms[0].company_id, req.user!.id));
  }
  res.json(await aiQuotaStatus(companyId != null ? { companyId } : { userId: req.user!.id }));
});

/**
 * Generic completion endpoint. The frontend's existing prompts (diagram spec,
 * slide bullets, subtitles) all flow through here; its offline parser remains
 * the fallback when this errors.
 */
aiRouter.post('/complete', aiLimiter, async (req, res) => {
  const prompt = String(req.body?.prompt || '');
  if (!prompt.trim()) return res.status(400).json({ error: 'Prompt required' });
  if (prompt.length > 20000) return res.status(413).json({ error: 'Prompt too long' });

  // A company member's usage draws the company's credits, not personal. Use the doc's
  // company when supplied; otherwise, if the user is an active member of exactly one
  // company, attribute the generation there (members have no separate personal pool).
  let companyId = req.body?.company_id ? Number(req.body.company_id) : null;
  if (companyId == null && !req.user!.is_app_owner) {
    const ms = await db('memberships').where({ user_id: req.user!.id, status: 'active' }).select('company_id');
    if (ms.length === 1) companyId = ms[0].company_id;
  }
  // Company members need the ai:generate permission; personal use is always allowed.
  if (companyId != null && !(await hasPermission(req.user!, companyId, 'ai:generate'))) {
    return res.status(403).json({ error: 'You need the AI permission in this company' });
  }

  // Monthly AI credits: block once a member's cap, the company pool, or the personal
  // quota is hit. App owners are exempt. The response carries `behavior` so the
  // frontend knows whether to show an "out of credits" message ('block') or quietly
  // use the offline parser ('fallback').
  if (!req.user!.is_app_owner) {
    const gate = await aiGenerationGate(req.user!.id, companyId);
    if (!gate.allowed) {
      const q = gate.quota!;
      const msg = gate.hit === 'member'
        ? `You've used all your AI credits this month (${q.limit}). Ask a company owner to raise your limit.`
        : gate.hit === 'company'
          ? `Your company's monthly AI credits are used up (${q.limit}). An owner can add more credits.`
          : `Monthly AI limit reached (${q.limit} this month). It resets on the 1st.`;
      return res.status(429).json({ error: msg, code: 'quota_exceeded', behavior: gate.behavior, scope: gate.hit, quota: q });
    }
  }

  // The selected provider goes first; unless failover is disabled, the other
  // available providers back it up so a flaky provider degrades to a slower
  // AI answer instead of the frontend's crude offline parser.
  const primary = await activeProvider();
  const failover = process.env.AI_FAILOVER !== 'false';
  const chain = failover
    ? [primary, ...Object.values(PROVIDERS).filter((p) => p.id !== primary.id)]
    : [primary];

  let lastErr: unknown = null;
  for (const provider of chain) {
    const gate = await provider.available(companyId);
    if (!gate.ok) { lastErr = new Error(gate.reason || 'unavailable'); continue; }
    const isFailover = provider.id !== primary.id;
    const rt = await resolveRuntime(provider.id, companyId);
    const t0 = Date.now();
    try {
      const result = await provider.complete(prompt, companyId);
      const ms = Date.now() - t0;
      await db('ai_usage').insert({ user_id: req.user!.id, company_id: companyId, provider: provider.id, kind: 'complete', ok: true });
      await db('ai_requests').insert({
        user_id: req.user!.id, company_id: companyId, provider: provider.id, model: result.model || rt.model || null,
        status: 'ok', failover: isFailover, latency_ms: ms,
        input_tokens: result.usage?.input ?? null, output_tokens: result.usage?.output ?? null,
        prompt, response: result.text,
      });
      return res.json({ text: result.text, provider: provider.id });
    } catch (e) {
      const ms = Date.now() - t0;
      lastErr = e;
      await db('ai_usage').insert({ user_id: req.user!.id, company_id: companyId, provider: provider.id, kind: 'complete', ok: false });
      await db('ai_requests').insert({
        user_id: req.user!.id, company_id: companyId, provider: provider.id, model: rt.model || null,
        status: 'error', failover: isFailover, latency_ms: ms, prompt, response: null,
        error: e instanceof Error ? String(e.message).slice(0, 2000) : 'error',
      });
    }
  }
  res.status(502).json({ error: lastErr instanceof Error ? lastErr.message : 'AI provider error' });
});
