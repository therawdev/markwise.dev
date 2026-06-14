// Monthly AI quotas — admin-configurable hard limits enforced on /api/ai/complete,
// on top of the per-minute burst rate limiter (rate-limit.ts). A "unit" is one
// successful completion (an AI visual), counted from ai_usage for the current
// calendar month so it matches the billing meter that resets on the 1st.
import { db, getSetting } from './db.js';

export interface QuotaConfig {
  free_monthly: number; // company on the free plan
  pro_monthly: number;  // company on the pro plan
  user_monthly: number; // individual (personal, no company) usage
}

// 0 (or negative) means unlimited. Defaults mirror the billing UI (free = 100).
export const DEFAULT_QUOTAS: QuotaConfig = { free_monthly: 100, pro_monthly: 0, user_monthly: 50 };

export async function getQuotas(): Promise<QuotaConfig> {
  const stored = await getSetting<Partial<QuotaConfig>>('ai_quotas', {});
  return { ...DEFAULT_QUOTAS, ...(stored || {}) };
}

const monthStart = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
};

export interface QuotaStatus {
  scope: 'company' | 'user';
  limit: number;     // 0 = unlimited
  used: number;      // successful completions this month
  remaining: number; // limit - used (clamped at 0); -1 when unlimited
  unlimited: boolean;
}

/**
 * The monthly quota standing for a subject — either a company (`{ companyId }`)
 * or an individual's personal usage (`{ userId }`). Computed purely from data;
 * the caller decides any bypass (e.g. app owners skip enforcement).
 */
export async function aiQuotaStatus(
  subject: { companyId: number } | { userId: number },
  quotas?: QuotaConfig,
): Promise<QuotaStatus> {
  const q = quotas || (await getQuotas());
  const counter = db('ai_usage')
    .where({ kind: 'complete', ok: true })
    .where('created_at', '>=', monthStart());

  let limit: number;
  let scope: QuotaStatus['scope'];
  if ('companyId' in subject) {
    scope = 'company';
    const company = await db('companies').where({ id: subject.companyId }).first();
    limit = company && company.plan === 'pro' ? q.pro_monthly : q.free_monthly;
    counter.where({ company_id: subject.companyId });
  } else {
    scope = 'user';
    limit = q.user_monthly;
    counter.where({ user_id: subject.userId }).whereNull('company_id');
  }

  const unlimited = !limit || limit <= 0;
  const row = await counter.count('id as n').first();
  const used = Number((row as { n?: number | string } | undefined)?.n ?? 0);
  return { scope, limit: unlimited ? 0 : limit, used, remaining: unlimited ? -1 : Math.max(0, limit - used), unlimited };
}
