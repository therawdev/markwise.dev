// Claude SDK / Claude API provider — DISABLED for this session.
// Fully implemented; enable by setting CLAUDE_API_ENABLED=true (or the admin
// panel toggle) plus ANTHROPIC_API_KEY. Uses the official Anthropic SDK.
import Anthropic from '@anthropic-ai/sdk';
import { getSetting } from '../db.js';
import type { AIProvider } from './types.js';

const MODEL = 'claude-opus-4-8';

let anthropic: Anthropic | null = null;

function client(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

export async function claudeApiEnabled(): Promise<boolean> {
  if (process.env.CLAUDE_API_ENABLED === 'true') return true;
  return getSetting<boolean>('claude_api_enabled', false);
}

export const claudeProvider: AIProvider = {
  id: 'claude',
  label: 'Claude SDK / Claude API (disabled this session)',

  async available() {
    if (!(await claudeApiEnabled())) {
      return { ok: false, reason: 'Claude SDK / Claude API is disabled for this session' };
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false, reason: 'ANTHROPIC_API_KEY is not set' };
    }
    return { ok: true };
  },

  async complete(prompt: string): Promise<string> {
    const gate = await this.available();
    if (!gate.ok) throw new Error(gate.reason);
    const response = await client().messages.create({
      model: MODEL,
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
    return text;
  },
};
