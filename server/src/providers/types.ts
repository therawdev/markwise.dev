export interface CompletionResult {
  /** The model's text output. */
  text: string;
  /** Token usage when the provider reports it (Gemini, Claude, Claude Code do; Codex may not). */
  usage?: { input?: number; output?: number };
  /** The model actually used, when the provider reports it. */
  model?: string;
}

export interface AIProvider {
  /** Provider id used in settings/env. */
  id: string;
  /** Human-readable name for the admin panel. */
  label: string;
  /**
   * Whether the provider can currently serve requests (key present, not disabled).
   * Pass a companyId to evaluate that company's bring-your-own-key config; omit
   * (or null) for the platform default.
   */
  available(companyId?: number | null): Promise<{ ok: boolean; reason?: string }>;
  /**
   * Generic text completion: prompt in, text + (optional) usage out. A companyId
   * routes the call through that company's BYO key/model when it has one.
   */
  complete(prompt: string, companyId?: number | null): Promise<CompletionResult>;
}
