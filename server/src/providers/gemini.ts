// Google Gemini provider (REST, no SDK dependency). Key & model are resolved from
// the DB (admin UI / per-org) with GEMINI_API_KEY / GEMINI_MODEL env as fallback.
import type { AIProvider } from './types.js';
import { resolveRuntime } from './config.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: 'Google Gemini',

  async available() {
    const rt = await resolveRuntime('gemini');
    if (!rt.enabled) return { ok: false, reason: 'Gemini is disabled' };
    if (!rt.apiKey) return { ok: false, reason: 'No Gemini API key — set it in the admin panel' };
    return { ok: true };
  },

  async complete(prompt: string): Promise<string> {
    const rt = await resolveRuntime('gemini');
    if (!rt.apiKey) throw new Error('No Gemini API key configured');
    const model = rt.model || DEFAULT_MODEL;
    const r = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': rt.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Gemini API ${r.status}: ${body.slice(0, 300)}`);
    }
    const data = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('');
    if (!text) throw new Error('Gemini returned an empty response');
    return text;
  },
};
