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
    const planLimit = company && company.plan === 'pro' ? q.pro_monthly : q.free_monthly;
    // A per-company pool override (ai_credit_limit, set by the app owner) wins over
    // the plan default. null = no override → plan default. 0 = unlimited.
    limit = company && company.ai_credit_limit != null ? Number(company.ai_credit_limit) : planLimit;
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

// Each org member gets this many credits/month by default (1 credit = 1 successful
// generation). App-owner-configurable via the `org_member_default_credits` setting.
export const DEFAULT_MEMBER_CREDITS = 500;
export async function orgMemberDefaultCredits(): Promise<number> {
  const v = Number(await getSetting<number>('org_member_default_credits', DEFAULT_MEMBER_CREDITS));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MEMBER_CREDITS;
}

/**
 * A single member's monthly standing *within a company* — their own successful
 * completions this month vs their per-member cap. The cap is membership.ai_credit_limit
 * when set (0 = explicitly unlimited), otherwise the org default (500). Pass `defaultCap`
 * to avoid re-reading the setting when statusing many members at once.
 */
export async function aiMemberQuotaStatus(companyId: number, userId: number, defaultCap?: number): Promise<QuotaStatus> {
  const def = defaultCap != null ? defaultCap : await orgMemberDefaultCredits();
  const membership = await db('memberships').where({ company_id: companyId, user_id: userId }).first();
  const cap = membership && membership.ai_credit_limit != null ? Number(membership.ai_credit_limit) : def;
  const unlimited = !cap || cap <= 0; // 0 (explicit) = unlimited
  const row = await db('ai_usage')
    .where({ kind: 'complete', ok: true, company_id: companyId, user_id: userId })
    .where('created_at', '>=', monthStart())
    .count('id as n')
    .first();
  const used = Number((row as { n?: number | string } | undefined)?.n ?? 0);
  return { scope: 'user', limit: unlimited ? 0 : cap, used, remaining: unlimited ? -1 : Math.max(0, cap - used), unlimited };
}

export type LimitBehavior = 'block' | 'fallback';

/** Resolve what happens when a limit is hit: per-company override → global default. */
export async function limitBehaviorFor(companyId: number | null): Promise<LimitBehavior> {
  const fallbackDefault = (await getSetting<string>('ai_limit_behavior_default', 'block')) as LimitBehavior;
  const def: LimitBehavior = fallbackDefault === 'fallback' ? 'fallback' : 'block';
  if (companyId == null) return def;
  const company = await db('companies').where({ id: companyId }).first();
  const b = company?.ai_limit_behavior;
  return b === 'block' || b === 'fallback' ? b : def;
}

export interface GenGate {
  allowed: boolean;
  behavior: LimitBehavior;
  hit?: 'member' | 'company' | 'user'; // which limit blocked, when !allowed
  quota?: QuotaStatus;
}

/**
 * Whether a generation may proceed, plus the at-limit behaviour. Checks the most
 * specific limit first (a member's own cap), then the shared company pool, then
 * (for personal use) the individual monthly quota. App-owner exemption is the
 * caller's concern.
 */
export async function aiGenerationGate(userId: number, companyId: number | null): Promise<GenGate> {
  const behavior = await limitBehaviorFor(companyId);
  if (companyId == null) {
    const q = await aiQuotaStatus({ userId });
    if (!q.unlimited && q.used >= q.limit) return { allowed: false, behavior, hit: 'user', quota: q };
    return { allowed: true, behavior };
  }
  const m = await aiMemberQuotaStatus(companyId, userId);
  if (!m.unlimited && m.used >= m.limit) return { allowed: false, behavior, hit: 'member', quota: m };
  const c = await aiQuotaStatus({ companyId });
  if (!c.unlimited && c.used >= c.limit) return { allowed: false, behavior, hit: 'company', quota: c };
  return { allowed: true, behavior };
}
