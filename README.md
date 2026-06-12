# Markwise — Write. Visualize. Present.

Turn text into visuals. Markwise is a document editor where you highlight a passage
and AI turns it into a diagram — ~70 diagram types, 26 render styles, a freeform
canvas board, a presentation builder with 200+ slide layouts, and export to
PNG / SVG / PDF / Word / Markdown / PPTX.

Now a fullstack app: accounts, companies with role-based access control, an
application-owner admin panel, and a pluggable AI provider layer.

## Quick start

```bash
# Requires Node 18+ and PostgreSQL
createdb markwise   # or use the credentials in server/.env.example

cd server
cp .env.example .env   # fill in DATABASE_URL and AI keys
npm install
npm run migrate
npm run seed           # prints the app-owner login once
npm run dev            # → http://localhost:3000
```

Sign in at `http://localhost:3000/login.html`. The dashboard lives at `/docs.html`,
the org settings at `/org.html?id=…`, and the owner panel at `/admin.html`.

### Run with Docker

```bash
# App + PostgreSQL in one command. Optional: export CODEX_AUTH_JSON / APP_OWNER_PASSWORD first.
docker compose up --build   # → http://localhost:3000
```

The image runs migrations and the seed on boot (both idempotent) and restores
Codex CLI credentials from the `CODEX_AUTH_JSON` env var (the contents of
`~/.codex/auth.json` after a `codex login` on any machine).

### Deploy on Render

[render.yaml](render.yaml) is a Render blueprint: a Docker web service plus
managed PostgreSQL. Create a Blueprint in the Render dashboard, point it at
this repo, and set the two secrets it asks for: `APP_OWNER_PASSWORD` (seeded
admin) and `CODEX_AUTH_JSON` (Codex CLI auth — rotate anytime by re-running
`codex login` and updating the var).

## Features

- **Editor** — write a doc, select text, hit ✦ Visualize; pick from live diagram
  previews; click any element to recolor, resize, or edit it in place
- **Canvas** — every visual as a draggable card on a pannable, zoomable board
- **Present** — build a deck from the document; 50 themes, 200+ slide layouts,
  full-screen present mode, PPTX/PDF export
- **Companies & RBAC** — default Owner/User roles plus custom roles with
  per-permission checkboxes; single-use invite links
- **Admin panel** — users, companies, AI usage, audit log, AI provider switch
- **AI providers** — OpenAI Codex SDK (default), Claude Code headless CLI, and
  Claude SDK/API (currently disabled by policy toggle). No key? The built-in
  offline parser still generates diagrams deterministically.

## Development

See [CLAUDE.md](CLAUDE.md) for architecture, conventions, and the RBAC model.
The original Claude Design handoff bundle is preserved in `chats/` and `project/`.
