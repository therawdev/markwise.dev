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
  /** Whether the provider can currently serve requests (key present, not disabled). */
  available(): Promise<{ ok: boolean; reason?: string }>;
  /** Generic text completion: prompt in, text + (optional) usage out. */
  complete(prompt: string): Promise<CompletionResult>;
}
