// Fails when a tracked or about-to-be-committed file looks like a secret (CLAUDE.md rule 7).
// Usage: node scripts/check-secrets.mjs [root]   (default: repository root)
// Scans `git ls-files -co --exclude-standard` (tracked + untracked, not ignored); outside git it walks the tree.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BINARY = /\.(pdf|ttf|otf|woff2?|png|jpe?g|gif|ico|zip)$/i;
// Built from parts so this file does not match itself.
const PATTERNS = [
  ['private key JWK', new RegExp('"d"\\s*:\\s*"[A-Za-z0-9_-]{40,}"')],
  ['PEM private key', new RegExp('-----BEGIN ' + '[A-Z ]*' + 'PRIVATE KEY-----')],
  ['Google API key value', new RegExp('AI' + 'za[0-9A-Za-z_-]{35}')],
  ['App Check debug token', new RegExp('APPCHECK_DEBUG_TOKEN\\s*[=:]\\s*(true|["\']?[0-9A-Fa-f-]{20,})', 'i')],
];
const FORBIDDEN_NAMES = [/^\.env\.local$/, /\.private\.jwk\.json$/, /^formtwin-signing-key/, /\.(pem|key)$/];

const STAGED = process.argv.includes('--staged');

/** Staged blobs (what `git commit` would record), read from the index, not the working tree. */
function stagedEntries() {
  const names = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  return names.map((file) => [file, () => execFileSync('git', ['show', `:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 })]);
}

function listFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
    return out.split('\0').filter(Boolean);
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else files.push(relative(root, p));
      }
    };
    walk(root);
    return files;
  }
}

const problems = [];
const entries = STAGED
  ? stagedEntries()
  : listFiles().map((file) => [file, () => readFileSync(join(root, file), 'utf8')]);
for (const [file, load] of entries) {
  const name = basename(file);
  if (FORBIDDEN_NAMES.some((re) => re.test(name))) problems.push(`${file}: file name not allowed in the repository`);
  if (BINARY.test(file)) continue;
  let text;
  try {
    text = load();
  } catch {
    continue;
  }
  for (const [label, re] of PATTERNS) if (re.test(text)) problems.push(`${file}: ${label}`);
}
if (problems.length > 0) {
  for (const p of problems) console.error(`SECRET? ${p}`);
  console.error(`check-secrets: ${problems.length} problem(s). Remove the secret; never commit keys or tokens.`);
  process.exit(1);
}
console.log('check-secrets: ok');
