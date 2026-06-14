// AI usage aggregation over the ai_requests log. Reused for the three scopes:
// app-admin (global), per-company, and per-user.
import { db } from './db.js';

// Rough public list prices, USD per 1M tokens. Edit as prices change; est. only.
const PRICE: Record<string, { in: number; out: number }> = {
  'gemini-2.5-flash': { in: 0.075, out: 0.30 },
  'gemini-2.5-pro': { in: 1.25, out: 5 },
  haiku: { in: 0.8, out: 4 },
  'claude-haiku-4-5-20251001': { in: 0.8, out: 4 },
  'claude-opus-4-8': { in: 5, out: 25 },
};
function costOf(model: string | null, inTok: number, outTok: number): number {
  const p = model ? PRICE[model] : undefined;
  if (!p) return 0;
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
}
const num = (v: unknown) => Number(v) || 0;

export interface UsageFilter { userId?: number; companyId?: number; days?: number; }

export async function aiUsageSummary(f: UsageFilter = {}) {
  const base = () => {
    let q = db('ai_requests');
    if (f.userId != null) q = q.where('user_id', f.userId);
    if (f.companyId != null) q = q.where('company_id', f.companyId);
    if (f.days) q = q.where('created_at', '>=', db.raw(`now() - (? || ' days')::interval`, [Number(f.days)]));
    return q;
  };

  const tot = await base()
    .select(
      db.raw('count(*)::int as requests'),
      db.raw(`count(*) filter (where status='ok')::int as ok`),
      db.raw(`count(*) filter (where status='error')::int as errors`),
      db.raw('coalesce(sum(input_tokens),0)::bigint as input_tokens'),
      db.raw('coalesce(sum(output_tokens),0)::bigint as output_tokens'),
      db.raw('coalesce(round(avg(latency_ms))::int,0) as avg_latency_ms'),
    )
    .first();

  const byProvider = await base()
    .groupBy('provider')
    .select(
      'provider',
      db.raw('count(*)::int as requests'),
      db.raw(`count(*) filter (where status='ok')::int as ok`),
      db.raw('coalesce(sum(input_tokens),0)::bigint as input_tokens'),
      db.raw('coalesce(sum(output_tokens),0)::bigint as output_tokens'),
    )
    .orderBy('requests', 'desc');

  const byModelRaw = await base()
    .whereNotNull('model')
    .groupBy('model')
    .select(
      'model',
      db.raw('count(*)::int as requests'),
      db.raw('coalesce(sum(input_tokens),0)::bigint as input_tokens'),
      db.raw('coalesce(sum(output_tokens),0)::bigint as output_tokens'),
    )
    .orderBy('requests', 'desc');

  const daily = await base()
    .select(
      db.raw(`to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day`),
      db.raw('count(*)::int as requests'),
      db.raw('coalesce(sum(input_tokens),0)::bigint as input_tokens'),
      db.raw('coalesce(sum(output_tokens),0)::bigint as output_tokens'),
    )
    .groupByRaw(`date_trunc('day', created_at)`)
    .orderByRaw(`date_trunc('day', created_at) asc`);

  const byModel = byModelRaw.map((m) => {
    const i = num(m.input_tokens), o = num(m.output_tokens);
    return { model: m.model, requests: num(m.requests), input_tokens: i, output_tokens: o, est_cost_usd: +costOf(m.model, i, o).toFixed(4) };
  });
  const est_cost_usd = +byModel.reduce((s, m) => s + m.est_cost_usd, 0).toFixed(4);

  return {
    totals: {
      requests: num(tot?.requests), ok: num(tot?.ok), errors: num(tot?.errors),
      input_tokens: num(tot?.input_tokens), output_tokens: num(tot?.output_tokens),
      avg_latency_ms: num(tot?.avg_latency_ms), est_cost_usd,
    },
    byProvider: byProvider.map((p) => ({
      provider: p.provider, requests: num(p.requests), ok: num(p.ok),
      input_tokens: num(p.input_tokens), output_tokens: num(p.output_tokens),
    })),
    byModel,
    daily: daily.map((d) => ({ day: d.day, requests: num(d.requests), input_tokens: num(d.input_tokens), output_tokens: num(d.output_tokens) })),
  };
}
