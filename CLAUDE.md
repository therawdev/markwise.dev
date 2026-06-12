# Markwise — Write. Visualize. Present.

> **Continuing previous work?** Read [HANDOFF.md](HANDOFF.md) for the current
> project state, decisions already made, and the pending task list.

Fullstack text-to-visuals workspace: a document editor where selected text becomes
diagrams (~70 types, 26 render styles), with a canvas board, presentation builder,
multi-tenant RBAC, and a pluggable AI provider layer.

## Run it

```bash
# 1. PostgreSQL must be running with the markwise database
#    (see server/.env / DATABASE_URL; defaults to markwise:markwise_dev@localhost)
cd server
cp .env.example .env        # then fill in keys
npm install
npm run migrate             # creates tables (idempotent)
npm run seed                # creates the app-owner account (prints credentials once)
npm run dev                 # http://localhost:3000
```

The Express server serves both the API (`/api/*`) and the static frontend (repo root).

## Architecture

```
index.html        the editor app (React 18 + Babel-standalone, no build step)
app/*.jsx         editor modules, loaded as <script type="text/babel"> in order
app/api.js        plain-JS API client + auth boot + window.claude.complete bridge
login.html, signup.html, docs.html, org.html, admin.html
                  vanilla-JS pages styled by assets/site.css
server/src/       Express + TypeScript + Knex (PostgreSQL)
  routes/         auth, orgs (roles/invites), docs, ai, admin
  providers/      AI provider layer (see below)
  permissions.ts  permission catalog + default roles — single source of truth
  middleware.ts   requireAuth / requireAppOwner / hasPermission / canAccessDoc
```

### Frontend notes

- The editor has **no build step** — JSX compiles in the browser via Babel standalone.
  Script order in `index.html` matters: `draw` → `icons` → `diagrams-a..l` → `interact`
  (which **overrides** the `Diagram` component from diagrams-b) → panels → `main`.
- The editor boots through `MarkwiseAPI.boot()` (app/api.js): requires a session
  cookie and a `?doc=<id>` query param, else redirects to login/dashboard.
- Document persistence is a debounced `PUT /api/docs/:id` with `{title, blocks}`.
  `blocks` is the same JSON shape the prototype kept in localStorage.
- All AI prompts in `app/ai.jsx` call `window.claude.complete(prompt)` — that is a
  bridge in `app/api.js` to `POST /api/ai/complete`. On any error the frontend falls
  back to its deterministic offline parser, so the app works with zero AI keys.

### AI provider layer (`server/src/providers/`)

| id | What | Status |
|---|---|---|
| `gemini` | **Google Gemini** via plain REST (`generativelanguage.googleapis.com`), no SDK. Auth: `GEMINI_API_KEY`; model: `GEMINI_MODEL` (default `gemini-2.5-flash`, free tier). | **Active default** |
| `codex` | OpenAI **Codex SDK** (`@openai/codex-sdk`). The SDK spawns the bundled `codex` CLI and talks JSONL over stdio. Auth: `OPENAI_API_KEY` (passed as `CODEX_API_KEY` to the CLI) or a host-level `codex login`. | Available (first failover) |
| `claude_code` | **Claude Code** headless CLI: `claude -p --output-format json` with the prompt on stdin. Needs the `claude` CLI authenticated on the host. Model: `CLAUDE_CODE_MODEL` (default `haiku`). | Available |
| `claude` | **Claude SDK / Claude API** via `@anthropic-ai/sdk`, model `claude-opus-4-8`, adaptive thinking. | **Disabled this session** — gate: `CLAUDE_API_ENABLED=true` (env) or the admin-panel toggle, plus `ANTHROPIC_API_KEY` |

Switch the active provider in the admin panel (persisted in the `settings` table)
or with the `AI_PROVIDER` env var. The disabled gate is enforced server-side in
`providers/claude.ts` — selecting `claude` while disabled returns an error.
If the active provider errors, `/api/ai/complete` fails over to the other
available providers in the `PROVIDERS` order (disable with `AI_FAILOVER=false`);
the response's `provider` field names who actually answered.

### RBAC model

- **App owner** (`users.is_app_owner`) — platform super admin; bypasses all checks;
  only account that can use `/api/admin/*` and `admin.html`.
- **Individual users** — personal docs (`documents.company_id IS NULL`) are owner-only.
- **Companies** — every company is seeded with two non-deletable system roles:
  `Owner` (all permissions, immutable) and `User` (doc:* + ai:generate). Org owners
  can create **custom roles** picking any subset of the catalog in `permissions.ts`.
  Members hold exactly one role per company. Invites are single-use 7-day links
  (`/docs.html?invite=<token>`).
- Enforcement: `hasPermission(user, companyId, perm)` and `canAccessDoc(user, doc, perm)`
  in `middleware.ts`. Add new permissions to `permissions.ts` only — the role-builder
  UI and the seeded roles read from that catalog.

## Conventions

- Schema changes go in `server/src/migrate.ts` (guarded `hasTable` blocks, idempotent).
- Mutating admin/org actions write to `audit_logs` via `audit()` in `db.ts`.
- AI calls are metered per user/company in `ai_usage`.
- The frontend pages are dependency-free vanilla JS; keep them that way.
- Design tokens (colors, radii) live in `assets/site.css` and the inline CSS in
  `index.html` — they must stay visually consistent.

## Seeded admin

`npm run seed` creates the app owner from `APP_OWNER_EMAIL` / `APP_OWNER_PASSWORD`
(defaults: `admin@markwise.dev`, random password printed once).
