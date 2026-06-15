# Markwise — Platform Roadmap

> **Focus for the next 2–3 phases: platform, not core editor features.**
> The document/diagram editor is mature (text→visual, ~91 types, deck builder,
> exports, RBAC). The next phases harden Markwise as a multi-tenant **platform**:
> AI control & observability, enterprise identity, and governance/billing/ops.
> Status: **proposed — awaiting approval.**

---

## Where the platform stands today (reusable plumbing)

| Area | Today | Gap |
|---|---|---|
| AI provider keys & models | **`process.env` only** (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `*_MODEL`). `settings` table stores only the active provider id + claude gate. | No UI to set/rotate keys; no encryption; no per-org keys. |
| AI usage | `ai_usage` = `{user_id, company_id, provider, kind:'complete', ok, created_at}` | No tokens/cost/model/latency/feature/doc; no prompt/response/figure capture; no dashboards; no quotas. |
| Auth | Password + session cookie; RBAC (roles/memberships/invites), app-owner | No SSO/OIDC/SAML, no SCIM, no MFA, no session management. |
| Admin | `admin.html` (switch provider, claude gate); `audit_logs` + `audit()` | No log/usage/secrets UIs; audit not surfaced. |
| API access | `api_keys` = `{user_id, token, created_at}` | No scopes/names/last-used; no public API or webhooks. |
| Billing | `ai_usage` rows only | No plans, quotas, invoicing, or limit enforcement. |

---

## Phase P1 — AI Control Plane *(keys-in-DB, observability, usage, quotas)*

**Goal:** the app admin manages AI from the UI, sees every request, and can act on
cost/quality. Directly covers your asks: keys-in-DB, detailed usage, request/response/image logs.

**1. Provider config & secrets in the DB (managed from admin UI)**
- New `provider_configs` (or extend `settings`): per provider — `enabled`, `api_key` (encrypted), `model`, `base_url`, extra JSON; plus active provider + failover order.
- **Encryption at rest**: app-level AES-256-GCM using a master key from env (`SECRETS_KEY`). Keys are write-only from the UI (masked, show last-4); never returned in plaintext.
- Admin UI (`admin.html`): provider cards → set/rotate key, choose model, enable/disable, **Test connection**, set active + failover order. Replaces env-only.
- Backward-compatible: fall back to `process.env` when a DB value is unset.
- **Per-org BYO-key** *(in P1)*: a company stores its own provider key (encrypted), used for its members' calls; falls back to the platform key when unset.

**2. AI request & figure log (for review → prompt improvements)**
- New `ai_requests` table: `user_id, company_id, doc_id, feature (generate|reshape|condense|deck), provider, model, status (ok|failover|error), latency_ms, input_tokens, output_tokens, est_cost_usd, prompt, response, source_excerpt, error, created_at`.
- Capture in `POST /api/ai/complete` (replaces the thin `ai_usage` insert). Token counts from provider responses where available (Gemini/Claude), estimated otherwise.
- **App-admin Log Viewer** (`admin.html`): searchable/filterable table → open a request to see prompt + response + the resulting figure spec; flag/annotate entries to drive prompt tuning; CSV export.
- **Store the full prompt + response** (no retention window for now — kept indefinitely for review; redaction/retention can be added later).

**3. Detailed usage dashboards (individual · company · app admin)**
- Aggregations by provider/model/feature over time: requests, tokens, est. cost, success/failover rate.
- Three scopes: **user** (own usage, in settings) · **company** (org owners see members) · **global** (app admin).

**4. Quotas & rate limits**
- Admin-configurable limits per user/company/plan (requests/tokens/cost per period); soft warning + hard block; rate-limit `/api/ai/complete`.

**Deliverables:** migrations (`provider_configs`, `ai_requests`, quota fields) · secrets-encryption util · capture/metering middleware in `routes/ai.ts` · admin: Providers, AI Logs, Usage, Quotas pages · user/org usage views.

> **Status: P1 complete.** Provider keys-in-DB, AI request log, and usage
> dashboards shipped earlier. Now also done: **per-org BYO keys** are wired end
> to end (`companyId` threads through every provider so a company's members'
> calls use its key; managed from the org **AI keys** tab), and **monthly
> quotas** (`quota.ts`) hard-block `/api/ai/complete` past an admin-configurable
> per-plan / per-user limit (admin **Quotas** tab; the org billing meter reflects
> the live limit). App owners are exempt; the per-minute burst limiter still applies.

---

## Phase P2 — Enterprise Identity *(SSO, provisioning, account security)*

**Goal:** orgs log in with their IdP and are provisioned automatically. **P2 builds OIDC; SAML 2.0 and SCIM are deferred to the backlog.**

- **OIDC SSO** *(P2)*: generic OIDC + presets (Google, Microsoft Entra, Okta). Per-org IdP config in org/admin UI; JIT user provisioning; link to existing accounts by email.
- **Org access policy** *(P2)*: domain capture / auto-join by verified email domain; **enforced SSO** (disable password login for an org).
- **Account security** *(P2)*: MFA (TOTP) for password accounts; session management (list/revoke sessions); login rate-limit + lockout.
- **SAML 2.0 SSO** → **backlog (future)**: per-org SP metadata + ACS endpoint, IdP metadata import, attribute → role mapping.
- **SCIM 2.0 provisioning** → **backlog (future)**: auto create/update/deactivate users & groups from the IdP; token-protected SCIM endpoints.

**Deliverables (P2):** `sso_connections` (org, type, config), `user_mfa`, `sessions` tables · OIDC auth flow + callbacks · org admin "Single sign-on" page · enforced-SSO middleware. Build the auth layer **provider-agnostic** (`type: oidc | saml`) so SAML/SCIM slot in later without a rewrite.

> **Status: OIDC SSO shipped (first slice of P2).** Generic OIDC with discovery,
> authorization-code + PKCE, and `jose`-verified id_tokens (`server/src/sso.ts`).
> `sso_connections` table (`type` already `oidc|saml`-ready); client secret stored
> AES-256-GCM encrypted. Per-org **Single sign-on** tab configures issuer/client/
> secret/allowed-domains/default-role, with a discovery Test and the callback URL
> to register at the IdP. Login start + `/api/sso/callback` JIT-provision the user
> (or link by email) and enrol them in the company; the login page offers SSO by
> email domain. Password login is rejected for SSO-only accounts.
> **Still open in P2:** the `enforced` flag is stored but not yet enforced; MFA,
> session management, and login lockout are not built; SAML/SCIM remain backlog.

---

## Phase P3 — Governance, Billing & Platform Ops

**Goal:** the trust, money, and operability layer.

- **Audit & compliance**: surface `audit_logs` in admin (filter by actor/action/target/date, export); expand coverage; data export + account/org deletion (GDPR); retention settings.
- **Billing (Stripe)**: plans + seats + metered AI usage → invoices; enforce plan limits (ties to P1 quotas); budgets + cost alerts.
- **Public API & webhooks**: scope/name/last-used/revoke on `api_keys`; rate-limited public API; webhooks (`doc.updated`, `comment.created`, `usage.threshold`).
- **White-label & workspace settings**: per-org branding (logo/accent/custom domain), default provider/features.
- **Ops**: structured logging + error tracking, `/health`/status, background job queue for heavy AI/export, secret rotation, notification center (`notif_seen_at` exists) + transactional email.

**Deliverables:** `plans`, `subscriptions` tables · Stripe integration · API-key & webhook management UI · audit/compliance pages · ops scaffolding.

---

## Cross-cutting (woven into every phase)

- **Security**: encryption-at-rest for all secrets, audit of secret access, secret rotation.
- **Tests**: API integration tests (auth, RBAC, AI routes, SSO callbacks, quotas) + a thin frontend smoke harness — *there are zero tests today and a single in-browser JSX typo breaks the whole app*, so this is high-value insurance.

---

## Phase P4 — Developer Platform & Extensibility

**Goal:** let other systems (and customers) build on Markwise.
- **Public REST API** with OpenAPI/Swagger docs — text→visual generation, docs CRUD, exports.
- **Webhooks** — signed payloads, retries, delivery log + replay (`doc.updated`, `comment.created`, `usage.threshold`, `member.added`).
- **Scoped API keys** — name, scopes, expiry, last-used, per-key rate limits, revoke (extends today's bare `api_keys`).
- **Embeds & SDK** — embed a live/static diagram via iframe/script; thin JS SDK; "generate via API."
- **Org brand kit / shared asset library** (logos, colors, fonts) → feeds white-label, templates, and exports. Needs object storage (S3) + CDN.

---

## Expanded platform backlog (themed — fold into P1–P4 as stretch)

**AI platform depth → extends P1**
- **Prompt management & versioning** — edit prompts as versioned templates from admin; ship improvements without a code deploy; A/B test; track quality per version. *(Turns "review logs → improve prompts" into a real, closed loop.)*
- **Eval & quality scoring** — rate logged outputs, build an eval set, regression-test prompt changes against it.
- **Model routing rules** — choose model by feature/org/cost (cheap for `reshape`, strong for `generate`); per-org policies.
- **Response caching / dedup** — cache identical prompt→response to cut cost & latency.
- **Content moderation / safety** — screen prompts & outputs; block secret/PII leakage.
- **Streaming (SSE)** for long generations; **pre-flight cost estimate** shown to the user; per-request token/budget circuit breakers.
- **Provider health monitor** — latency/error/uptime per provider, auto-disable + alert (extends current failover).

**Security & trust → extends P2**
- IP allowlist / network policy per org; session & SSO-enforcement policies.
- Anomaly detection (unusual login, mass export/delete) + alerts.
- Secret rotation schedules + secret-access audit; field-level encryption of document content (not just secrets).
- Brute-force / credential-stuffing protection; CSP + security headers; dependency scanning; `security.txt`.

**Compliance & data lifecycle → extends P3**
- Data residency / region per org; retention policies per data type (docs, AI logs, comments); legal hold.
- Tamper-evident / immutable audit log; backups + point-in-time restore (DR); DPA/ToS acceptance + consent records.

**Billing depth → extends P3**
- Usage-based line items (AI tokens); tiers / add-ons / coupons / trials; self-serve upgrade-downgrade; dunning; Stripe Tax / invoices / receipts; MRR & churn dashboard; per-org budget caps + overage policy.

**Ops & reliability → cross-cutting**
- Error tracking (Sentry) + structured logs + correlation IDs; metrics dashboard (req/err/latency/DB).
- Background job queue (AI / export / email) with retries + dead-letter.
- Feature-flag system (gradual rollout, kill switches) managed from admin; maintenance / read-only mode; status page; health probes; zero-downtime migrations.

**Org & tenant management → extends P3**
- App-admin org lifecycle (create / suspend / delete, trials, per-org feature flags); cross-org membership + org switcher; bulk user import / invite; org provisioning defaults.

**Admin & support tooling → extends P1/P3**
- **Audited impersonation** ("log in as user" for support); user/org lookup, unlock, reset, resend invite; cross-org admin search; centralized system-settings UI; admin broadcast / announcement banner.

**Notifications & comms → cross-cutting**
- In-app notification center (`notif_seen_at` already exists) + transactional email + Slack/webhook targets; weekly digest emails (usage/activity); admin-editable email templates.

---

## Decisions (locked — 2026-06-14)

1. **Secrets encryption** ✅ App-level **AES-256-GCM** with a `SECRETS_KEY` env master key (keys write-only from UI, masked, never returned in plaintext).
2. **SSO** ✅ **Build OIDC in P2** (Google / Microsoft / Okta). **SAML 2.0 + SCIM → backlog (future).** Build P2's auth layer **provider-agnostic** (one `sso_connections` table, `type: oidc | saml`, normalized to the same user-mapping path) so SAML slots in later without a rewrite.
3. **Per-org BYO AI key** ✅ In **P1**.
4. **Billing** ✅ **Stripe**, in **P3**.
5. **AI log content & retention** ✅ Store the **full prompt + response**; **no retention window for now** (kept for review; redaction/retention can be added later).

---

## Recommended sequence
**P1 → P2 → P3.** P1 delivers the most immediate value to you as app admin (keys-in-UI,
visibility into every AI call, usage & cost), is largely self-contained, and its
quota/usage primitives feed P3 billing. P2 unlocks enterprise customers. P3 is the
trust/monetization layer.
