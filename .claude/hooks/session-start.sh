#!/bin/bash
# Markwise — Claude Code on the web session setup (user-approved).
# 1. Restores Codex CLI credentials from the CODEX_AUTH_JSON env var
# 2. Installs server dependencies
# 3. Starts PostgreSQL and prepares the markwise database (migrate + seed)
set -euo pipefail

# Web sessions only — local machines manage their own setup.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# --- 1. Codex CLI auth (ChatGPT-subscription login, no API key) ---
# Store the contents of ~/.codex/auth.json from an authenticated machine in
# the environment env var CODEX_AUTH_JSON; every session restores it here.
if [ -n "${CODEX_AUTH_JSON:-}" ]; then
  mkdir -p "$HOME/.codex"
  printf '%s' "$CODEX_AUTH_JSON" > "$HOME/.codex/auth.json"
  chmod 600 "$HOME/.codex/auth.json"
  echo "Codex CLI credentials restored to ~/.codex/auth.json"
else
  echo "CODEX_AUTH_JSON not set — Codex CLI will be unauthenticated (offline parser fallback still works)"
fi

# --- 2. Server dependencies ---
cd "$REPO/server"
npm install --no-audit --no-fund

# --- 3. Database (best-effort: the session is still usable if this fails) ---
if command -v service > /dev/null 2>&1 || command -v pg_ctlcluster > /dev/null 2>&1; then
  (service postgresql start || pg_ctlcluster 16 main start || true) > /dev/null 2>&1 || true
  sleep 2
  su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='markwise'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "psql -c \"CREATE USER markwise WITH PASSWORD 'markwise_dev';\"" 2>/dev/null || true
  su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='markwise'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "psql -c 'CREATE DATABASE markwise OWNER markwise;'" 2>/dev/null || true
  if [ ! -f .env ]; then
    cp .env.example .env
  fi
  npm run migrate || echo "WARN: migrations failed — check PostgreSQL"
  npm run seed || echo "WARN: seed failed"
else
  echo "WARN: PostgreSQL tooling not found — skipping database setup"
fi

echo "Markwise session setup complete."
