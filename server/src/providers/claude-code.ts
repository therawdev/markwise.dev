// Claude Code provider (available).
// Uses the Claude Code CLI in headless mode: `claude -p "<prompt>" --output-format json`.
// Requires the `claude` CLI installed and authenticated on the host.
import { execFile } from 'node:child_process';
import type { AIProvider } from './types.js';

const BIN = process.env.CLAUDE_CODE_BIN || 'claude';

function run(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(BIN, args, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`claude CLI failed: ${stderr || err.message}`));
      resolve(stdout);
    });
    if (input != null && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

export const claudeCodeProvider: AIProvider = {
  id: 'claude_code',
  label: 'Claude Code (headless CLI)',

  async available() {
    try {
      await run(['--version']);
      return { ok: true };
    } catch {
      return { ok: false, reason: `\`${BIN}\` CLI not found or not working on this host` };
    }
  },

  async complete(prompt: string): Promise<string> {
    // Prompt goes via stdin to avoid argv length limits and shell-quoting issues.
    const out = await run(['-p', '--output-format', 'json'], prompt);
    const parsed = JSON.parse(out);
    if (parsed.is_error) throw new Error(`Claude Code error: ${parsed.result || 'unknown'}`);
    return String(parsed.result || '');
  },
};
