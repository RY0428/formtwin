// Claude Code PreToolUse hook (Bash): before `git commit` or `git push`, run the secret scan.
// Exit code 2 blocks the tool call and shows stderr to Claude.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const command = String(input?.tool_input?.command ?? '');
// Any git invocation that commits or pushes (also `git -C dir commit`, `git -c k=v push`).
if (!/\bgit\b[^|;&\n]*\b(commit|push)\b/.test(command)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
try {
  // Working tree (tracked + untracked) and the staged blobs that the commit would record.
  for (const args of [[root], [root, '--staged']]) {
    execFileSync(process.execPath, [join(root, 'scripts/check-secrets.mjs'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  }
} catch (e) {
  process.stderr.write(String(e.stderr ?? e.stdout ?? e));
  process.stderr.write('\nBlocked by .claude/hooks/pre-commit-secrets.mjs: remove the secret before committing (CLAUDE.md rule 7).\n');
  process.exit(2);
}
process.exit(0);
