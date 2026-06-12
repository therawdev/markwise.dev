# Markwise — single image serving the API and the static frontend.
# The server runs TypeScript directly via tsx (no build step), matching dev.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Server dependencies first so code changes don't bust the npm layer.
# tsx is a runtime dependency; the Codex CLI binary ships via @openai/codex-sdk.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
