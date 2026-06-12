import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, hasPermission } from '../middleware.js';
import { activeProvider, providerStatus, PROVIDERS } from '../providers/index.js';
import { aiLimiter } from '../rate-limit.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.get('/status', async (_req, res) => {
  res.json(await providerStatus());
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

  // Company members need the ai:generate permission; personal use is always allowed.
  const companyId = req.body?.company_id ? Number(req.body.company_id) : null;
  if (companyId != null && !(await hasPermission(req.user!, companyId, 'ai:generate'))) {
    return res.status(403).json({ error: 'You need the AI permission in this company' });
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
    const gate = await provider.available();
    if (!gate.ok) { lastErr = new Error(gate.reason || 'unavailable'); continue; }
    try {
      const text = await provider.complete(prompt);
      await db('ai_usage').insert({
        user_id: req.user!.id,
        company_id: companyId,
        provider: provider.id,
        kind: 'complete',
        ok: true,
      });
      return res.json({ text, provider: provider.id });
    } catch (e) {
      lastErr = e;
      await db('ai_usage').insert({
        user_id: req.user!.id,
        company_id: companyId,
        provider: provider.id,
        kind: 'complete',
        ok: false,
      });
    }
  }
  res.status(502).json({ error: lastErr instanceof Error ? lastErr.message : 'AI provider error' });
});
