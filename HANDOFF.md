# Session handoff — state & next steps

> Context document for the next working session (human or agent).
> Written 2026-06-12 at the end of the initial build session;
> updated 2026-06-12 (second session) after Phase 2.
> Architecture and conventions live in [CLAUDE.md](CLAUDE.md) — read that first.

## Where the project stands

Everything below is implemented, smoke-tested, and pushed to `main`:

- **Markwise app** (renamed from Glyph): editor, canvas, presentations — the full
  Claude Design prototype, served by the backend.
- **Fullstack backend** (`server/`): Express + TS + Knex + PostgreSQL. Auth
  (JWT cookie), RBAC (app owner / individual users / companies with default
  Owner+User roles and custom roles from a permission catalog), single-use
  invite links, document CRUD, admin API with audit log, AI usage metering.
- **Frontend pages**: `login` / `signup` / `docs` (dashboard) / `org` (members,
  invite links, role builder) / `admin` (stats, suspension, AI provider switch).
  Editor persistence is API-backed (debounced PUT with save indicator).
- **AI provider layer** (`server/src/providers/`):
  - `codex` — OpenAI Codex SDK, **active default**. No API key by design — auth
    comes from Codex CLI login (ChatGPT subscription). See "Codex auth" below.
  - `claude_code` — Claude Code headless CLI, available.
  - `claude` — Claude SDK/API, implemented but **disabled by policy** (gate:
    `CLAUDE_API_ENABLED` env or admin toggle + `ANTHROPIC_API_KEY`). Do not
    enable without the owner's say-so.
- **SessionStart hook** (`.claude/hooks/session-start.sh`): restores Codex CLI
  credentials from the `CODEX_AUTH_JSON` env var, installs server deps, starts
  Postgres, migrates, seeds. Runs automatically in Claude Code web sessions.

Seeded app owner: `admin@markwise.dev` / `markwise-admin-2026` (re-seeded per
container by the hook; change for production).

## Decisions made (don't re-litigate)

- Stack: Node + Express + TypeScript, Knex, **PostgreSQL** (user-chosen).
- Invites: link/code based, no email sending yet (user-chosen).
- Codex authenticates via **ChatGPT login (`codex login`), not an API key**
  (user-explicit). The SDK wraps the bundled `codex` CLI.
- Claude SDK/API stays **disabled** until the owner flips it.

## Done in the second session (2026-06-12)

1. **Codex auth** — `codex login --device-auth` completed in the `markwise`
   environment (network egress to openai.com now works). The user holds the
   minified `auth.json` to store as the `CODEX_AUTH_JSON` environment variable
   so the SessionStart hook restores it in future sessions.
2. **Live AI verified end-to-end** — POST `/api/ai/complete` with the
   diagram-spec prompt from `app/ai.jsx`: Codex returned valid JSON passing the
   frontend `sanitize()` shape on the first attempt (10 items, correct `best`
   types per the rank-change rule). **No prompt tuning was needed.** ~22s
   per completion (Codex CLI startup overhead).
3. **Phase 2 shipped**:
   - `Dockerfile` + `docker-compose.yml` (app + Postgres). Entrypoint restores
     `CODEX_AUTH_JSON`, migrates, seeds, starts the server. Verified by running
     the image against Postgres (health + login OK).
   - GitHub Actions CI (`.github/workflows/ci.yml`): server typecheck + Docker
     build. `tsx` moved to runtime deps; `npm run typecheck` added.
   - Security: helmet (CSP off — browser-compiled JSX needs it), rate limits
     (login/signup 20/15min per IP; AI 30/min per user), `trust proxy`.
   - Real share links: `documents.share_token`, POST/DELETE
     `/api/docs/:id/share` (gated by `doc:share`, audited), public
     `GET /api/shared/:token`, read-only viewer `share.html` (sanitizes author
     HTML), ShareModal rewired from the fake URL to create/copy/revoke.
   - **Render** chosen as the host: `render.yaml` blueprint (Docker web service
     + managed Postgres). Secrets to set in the dashboard: `APP_OWNER_PASSWORD`,
     `CODEX_AUTH_JSON`.

## Pending — in order

1. **Deploy**: user creates the Render Blueprint from `render.yaml` and sets the
   two secrets. `db.ts` honors `DATABASE_SSL=true` if an external DB URL is used.
2. **Phase 2 leftovers**: password reset flow.
3. **Phase 3**: plans/billing with AI quotas (schema groundwork exists:
   `companies.plan`, `ai_usage`), server-side document versioning, email invites.

## Gotchas

- The GitHub PAT used in the build session was exposed in conversation and
  should be revoked; use a fresh token / environment credential for pushes.
- The Codex `auth.json` was shared in the second session's conversation so the
  user could save it as `CODEX_AUTH_JSON`; the user can rotate it by re-running
  `codex login` whenever needed.
- `interact.jsx` overrides the `Diagram` component defined in `diagrams-b.jsx`
  (script order in `index.html` matters) — change rendering there, not in
  diagrams-b.
