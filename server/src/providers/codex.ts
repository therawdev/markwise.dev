// OpenAI Codex SDK provider (active default).
// The SDK wraps the bundled `codex` CLI: it spawns the binary and exchanges
// JSONL events over stdio. Auth: CODEX_API_KEY (set from OPENAI_API_KEY here)
// or a host-level `codex login`.
import { Codex } from '@openai/codex-sdk';
import type { AIProvider } from './types.js';

let codex: Codex | null = null;

function client(): Codex {
  if (!codex) {
    codex = new Codex(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {});
  }
  return codex;
}

export const codexProvider: AIProvider = {
  id: 'codex',
  label: 'OpenAI Codex SDK',

  async available() {
    if (process.env.OPENAI_API_KEY) return { ok: true };
    // Without an explicit key the CLI may still be authenticated via `codex login`.
    return { ok: true, reason: 'No OPENAI_API_KEY set — relying on host `codex login` credentials' };
  },

  async complete(prompt: string): Promise<string> {
    // A fresh thread per request: completions are stateless one-shots.
    const thread = client().startThread({
      sandboxMode: 'read-only',
      skipGitRepoCheck: true,
    });
    const turn = await thread.run(prompt);
    if (!turn.finalResponse) throw new Error('Codex returned an empty response');
    return turn.finalResponse;
  },
};
