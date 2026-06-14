// Claude SDK / Claude API provider. Gated by claudeApiEnabled() (env or admin
// toggle). Key & model resolved from the DB (admin UI / per-org) with
// ANTHROPIC_API_KEY env as fallback. Uses the official Anthropic SDK.
import Anthropic from '@anthropic-ai/sdk';
import { getSetting } from '../db.js';
import type { AIProvider, CompletionResult } from './types.js';
import { resolveRuntime } from './config.js';

const DEFAULT_MODEL = 'claude-opus-4-8';

export async function claudeApiEnabled(): Promise<boolean> {
  if (process.env.CLAUDE_API_ENABLED === 'true') return true;
  return getSetting<boolean>('claude_api_enabled', false);
}

export const claudeProvider: AIProvider = {
  id: 'claude',
  label: 'Claude SDK / Claude API',

  async available() {
    if (!(await claudeApiEnabled())) {
      return { ok: false, reason: 'Claude API is disabled (enable it in the admin panel)' };
    }
    const rt = await resolveRuntime('claude');
    if (!rt.enabled) return { ok: false, reason: 'Claude is disabled' };
    if (!rt.apiKey) return { ok: false, reason: 'No Anthropic API key — set it in the admin panel' };
    return { ok: true };
  },

  async complete(prompt: string): Promise<CompletionResult> {
    const gate = await this.available();
    if (!gate.ok) throw new Error(gate.reason);
    const rt = await resolveRuntime('claude');
    const model = rt.model || DEFAULT_MODEL;
    const client = new Anthropic({ apiKey: rt.apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') throw new Error('Claude declined the request');
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) throw new Error('Claude returned an empty response');
    return { text, model, usage: { input: response.usage?.input_tokens, output: response.usage?.output_tokens } };
  },
};
