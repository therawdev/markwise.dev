// OpenAI Codex SDK provider. The SDK wraps the bundled `codex` CLI (spawns the
// binary, JSONL over stdio). Key & model resolved from the DB (admin UI / per-org)
// with OPENAI_API_KEY / CODEX_MODEL env as fallback; without a key the CLI may
// still be authenticated via a host-level `codex login`.
import { Codex } from '@openai/codex-sdk';
import type { AIProvider, CompletionResult } from './types.js';
import { resolveRuntime } from './config.js';

let codex: Codex | null = null;
let codexKey: string | undefined;

// rebuild the client when the resolved key changes (e.g. admin updated it)
function client(apiKey?: string): Codex {
  if (!codex || codexKey !== apiKey) {
    codex = new Codex(apiKey ? { apiKey } : {});
    codexKey = apiKey;
  }
  return codex;
}

export const codexProvider: AIProvider = {
  id: 'codex',
  label: 'OpenAI Codex SDK',

  async available(companyId: number | null = null) {
    const rt = await resolveRuntime('codex', companyId);
    if (!rt.enabled) return { ok: false, reason: 'Codex is disabled' };
    if (rt.apiKey) return { ok: true };
    return { ok: true, reason: 'No OpenAI key set — relying on host `codex login` credentials' };
  },

  async complete(prompt: string, companyId: number | null = null): Promise<CompletionResult> {
    const rt = await resolveRuntime('codex', companyId);
    // A fresh thread per request: completions are stateless one-shots.
    const thread = client(rt.apiKey).startThread({
      sandboxMode: 'read-only',
      skipGitRepoCheck: true,
      // One-shot JSON tasks need little deliberation and no web access.
      // ("minimal" is rejected with a 400 by gpt-5.5 via the ChatGPT backend — use "low".)
      modelReasoningEffort: (process.env.CODEX_REASONING_EFFORT as 'low') || 'low',
      webSearchMode: 'disabled',
      ...(rt.model ? { model: rt.model } : {}),
    });
    const turn = await thread.run(prompt);
    if (!turn.finalResponse) throw new Error('Codex returned an empty response');
    const u = (turn as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    return { text: turn.finalResponse, model: rt.model, usage: u ? { input: u.input_tokens, output: u.output_tokens } : undefined };
  },
};
