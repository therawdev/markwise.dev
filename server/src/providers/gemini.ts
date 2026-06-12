// Google Gemini provider (REST, no SDK dependency).
// Auth: GEMINI_API_KEY. Model: GEMINI_MODEL (default gemini-2.5-flash —
// available on the free tier and fast for the app's one-shot JSON tasks).
import type { AIProvider } from './types.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: 'Google Gemini',

  async available() {
    if (!process.env.GEMINI_API_KEY) return { ok: false, reason: 'GEMINI_API_KEY is not set' };
    return { ok: true };
  },

  async complete(prompt: string): Promise<string> {
    const r = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY!,
        'Content-Type': 'application/json',
      },
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
