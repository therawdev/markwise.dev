export interface AIProvider {
  /** Provider id used in settings/env. */
  id: string;
  /** Human-readable name for the admin panel. */
  label: string;
  /** Whether the provider can currently serve requests (key present, not disabled). */
  available(): Promise<{ ok: boolean; reason?: string }>;
  /** Generic text completion: prompt in, raw model text out. */
  complete(prompt: string): Promise<string>;
}
