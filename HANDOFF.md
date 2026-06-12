# Session handoff — state & next steps

> Context document for the next working session (human or agent).
> Written 2026-06-12 at the end of the initial build session.
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

## Pending — in order

1. **Codex auth bootstrap** (user-side, then verify):
   - The default web environment was not editable (placeholder env id), so the
     user is creating a new environment named `markwise` with Custom network
     access allowing: `auth.openai.com`, `api.openai.com`, `*.openai.com`,
     `chatgpt.com`, `*.chatgpt.com`.
   - Credential: either the user runs `codex login` locally and stores
     `~/.codex/auth.json` contents as the `CODEX_AUTH_JSON` environment
     variable (preferred — the hook restores it automatically), or run
     `codex login --device-auth` in-session (binary:
     `server/node_modules/.bin/codex`) and relay the code to the user.
   - **Then verify live AI end-to-end**: sign in, open a doc, select text,
     Visualize — confirm Codex returns a valid diagram spec for the prompt in
     `app/ai.jsx`. The prompts were written for Claude; tune for Codex output
     quality if needed.
2. **Phase 2 (agreed roadmap)**: deployment (Dockerfile + compose + CI;
   hosting target not yet chosen — ask), security hardening (rate limiting on
   auth/AI, helmet, password reset), real share links (the Share button is
   still the prototype's fake modal; implement a public read-only view gated
   by `doc:share`).
3. **Phase 3**: plans/billing with AI quotas (schema groundwork exists:
   `companies.plan`, `ai_usage`), server-side document versioning, email invites.

## Gotchas

- The GitHub PAT used in the build session was exposed in conversation and
  should be revoked; use a fresh token / environment credential for pushes.
- This sandbox blocked `api.openai.com` egress — AI calls fail gracefully into
  the frontend's offline parser, which is the expected no-key behavior.
- `interact.jsx` overrides the `Diagram` component defined in `diagrams-b.jsx`
  (script order in `index.html` matters) — change rendering there, not in
  diagrams-b.
