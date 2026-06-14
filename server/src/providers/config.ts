// Resolves a provider's runtime config (API key, model, enabled) from the DB,
// falling back to environment variables for backward compatibility.
// Resolution order for the key: company BYO row → global row → env var.
import { db } from '../db.js';
import { decryptSecret, encryptSecret, maskKey, secretsConfigured } from '../secrets.js';

export interface ProviderRuntime {
  enabled: boolean;
  apiKey?: string;
  model?: string;
  source: 'company' | 'global' | 'env' | 'none';
}

// provider id → env var names used as the fallback (and to know which providers take a key)
const ENV: Record<string, { key?: string; model?: string }> = {
  gemini: { key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL' },
  codex: { key: 'OPENAI_API_KEY', model: 'CODEX_MODEL' },
  claude: { key: 'ANTHROPIC_API_KEY' },
  claude_code: { model: 'CLAUDE_CODE_MODEL' },
};

const envKey = (p: string) => (ENV[p]?.key ? process.env[ENV[p].key!] : undefined);
const envModel = (p: string) => (ENV[p]?.model ? process.env[ENV[p].model!] : undefined);

function getRow(provider: string, companyId: number | null) {
  return db('provider_configs').where({ provider, company_id: companyId }).first();
}

export async function resolveRuntime(provider: string, companyId: number | null = null): Promise<ProviderRuntime> {
  let enabled = true;
  let apiKey: string | undefined;
  let model: string | undefined = envModel(provider);
  let source: ProviderRuntime['source'] = 'none';

  const global = await getRow(provider, null);
  if (global) {
    if (global.enabled === false) enabled = false;
    if (global.model) model = global.model;
    if (global.api_key_enc && secretsConfigured()) {
      try { apiKey = decryptSecret(global.api_key_enc); source = 'global'; } catch { /* corrupt — ignore */ }
    }
  }
  // A company's own key/model overrides the platform default for its members.
  if (companyId != null) {
    const comp = await getRow(provider, companyId);
    if (comp) {
      if (comp.enabled === false) enabled = false;
      if (comp.model) model = comp.model;
      if (comp.api_key_enc && secretsConfigured()) {
        try { apiKey = decryptSecret(comp.api_key_enc); source = 'company'; } catch { /* ignore */ }
      }
    }
  }
  if (!apiKey) { const ek = envKey(provider); if (ek) { apiKey = ek; source = 'env'; } }
  return { enabled, apiKey, model, source };
}

export async function setProviderConfig(
  provider: string,
  companyId: number | null,
  patch: { enabled?: boolean; model?: string | null; apiKey?: string | null },
): Promise<void> {
  const existing = await getRow(provider, companyId);
  const data: Record<string, unknown> = { updated_at: db.fn.now() };
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  if (patch.model !== undefined) data.model = patch.model || null;
  if (patch.apiKey !== undefined) data.api_key_enc = patch.apiKey ? encryptSecret(patch.apiKey) : null;
  if (existing) {
    await db('provider_configs').where({ id: existing.id }).update(data);
  } else {
    await db('provider_configs').insert({
      provider,
      company_id: companyId,
      enabled: patch.enabled ?? true,
      model: patch.model ?? null,
      api_key_enc: patch.apiKey ? encryptSecret(patch.apiKey) : null,
    });
  }
}

/** Admin/UI view of every provider's config — keys are masked, never returned in plaintext. */
export async function listProviderConfigs(companyId: number | null = null) {
  return Promise.all(
    Object.keys(ENV).map(async (provider) => {
      const rt = await resolveRuntime(provider, companyId);
      return {
        provider,
        enabled: rt.enabled,
        model: rt.model || null,
        needsKey: !!ENV[provider].key,
        hasKey: !!rt.apiKey,
        keyMasked: rt.apiKey ? maskKey(rt.apiKey) : '',
        keySource: rt.source, // company | global | env | none
      };
    }),
  );
}
