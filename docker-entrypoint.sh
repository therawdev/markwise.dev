#!/bin/sh
# Boot sequence for the Markwise container:
# 1. restore Codex CLI credentials (ChatGPT login, no API key) from CODEX_AUTH_JSON
# 2. migrate + seed (both idempotent)
# 3. start the server
set -e

if [ -n "${CODEX_AUTH_JSON:-}" ]; then
  mkdir -p "$HOME/.codex"
  printf '%s' "$CODEX_AUTH_JSON" > "$HOME/.codex/auth.json"
  chmod 600 "$HOME/.codex/auth.json"
  echo "Codex CLI credentials restored to ~/.codex/auth.json"
else
  echo "CODEX_AUTH_JSON not set — Codex provider will be unauthenticated (frontend falls back to the offline parser)"
fi

cd /app/server
node_modules/.bin/tsx src/migrate.ts
node_modules/.bin/tsx src/seed.ts
exec node_modules/.bin/tsx src/index.ts
