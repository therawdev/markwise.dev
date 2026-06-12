import { getSetting } from '../db.js';
import type { AIProvider } from './types.js';
import { codexProvider } from './codex.js';
import { geminiProvider } from './gemini.js';
import { claudeCodeProvider } from './claude-code.js';
import { claudeProvider } from './claude.js';

// Object order doubles as the failover order in routes/ai.ts:
// gemini (free tier) → codex → claude_code → claude.
export const PROVIDERS: Record<string, AIProvider> = {
  gemini: geminiProvider,
  codex: codexProvider,
  claude_code: claudeCodeProvider,
  claude: claudeProvider,
};

export const DEFAULT_PROVIDER = 'gemini';

/** Active provider: admin-panel setting wins, then AI_PROVIDER env, then codex. */
export async function activeProvider(): Promise<AIProvider> {
  const id = await getSetting<string>('ai_provider', process.env.AI_PROVIDER || DEFAULT_PROVIDER);
  return PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER];
}

export async function providerStatus() {
  const active = await activeProvider();
  const all = await Promise.all(
    Object.values(PROVIDERS).map(async (p) => ({
      id: p.id,
      label: p.label,
      active: p.id === active.id,
      ...(await p.available()),
    }))
  );
  return { active: active.id, providers: all };
}
