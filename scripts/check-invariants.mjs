// Static checks of the project's absolute rules that lint does not cover (CLAUDE.md rules 2, 4, 9).
// Usage: node scripts/check-invariants.mjs [root]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const problems = [];

function sources(dir) {
  const out = [];
  const walk = (d) => {
    let names;
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n) && !/\.e2e\.ts$/.test(n)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(root, p);

// Rule 2: fixed inference modes. The only PREFER_* allowed is InferenceMode.PREFER_IN_CLOUD in the public
// field explainer (docs/decisions.md 2026-11-14); private-app has no exception.
const PREFER_EXCEPTION = { file: 'apps/public-app/src/cloud/fieldExplainer.ts', mode: 'InferenceMode.PREFER_IN_CLOUD' };
const PREFER = /PREFER_ON_DEVICE|PREFER_IN_CLOUD|prefer_on_device|prefer_in_cloud/;
for (const [app, must, mustNot] of [
  ['private-app', 'ONLY_ON_DEVICE', 'ONLY_IN_CLOUD'],
  ['public-app', 'ONLY_IN_CLOUD', 'ONLY_ON_DEVICE'],
]) {
  const files = sources(join(root, 'apps', app, 'src'));
  let found = false;
  for (const f of files) {
    const t = read(f);
    if (PREFER.test(t)) {
      const allowed =
        rel(f) === PREFER_EXCEPTION.file &&
        [...t.matchAll(new RegExp(PREFER.source, 'g'))].every((m) => t.slice(m.index - 'InferenceMode.'.length, m.index + m[0].length) === PREFER_EXCEPTION.mode);
      if (!allowed) problems.push(`${rel(f)}: PREFER_* inference mode`);
    }
    if (t.includes(`InferenceMode.${mustNot}`)) problems.push(`${rel(f)}: ${app} must not use InferenceMode.${mustNot}`);
    if (t.includes(`InferenceMode.${must}`)) found = true;
  }
  if (files.length > 0 && !found) problems.push(`${app}: InferenceMode.${must} not found`);
}

// Rule 9: no guarantee wording in the apps (negations such as "cannot guarantee" are fine).
const GUARANTEE =
  /zero[- ](pii[- ])?leak|leak[- ]free|nothing (is )?(left|remains)|no data (ever )?leaves|100\s?% (private|secure|safe)|guarantees? (that )?(your )?(data|privacy|deletion)|completely (private|secure|safe)|端末に残るもの|漏えいゼロ/i;
for (const app of ['private-app', 'public-app']) {
  for (const f of sources(join(root, 'apps', app, 'src'))) {
    for (const [i, line] of read(f).split('\n').entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // comments may name the forbidden wording
      if (GUARANTEE.test(line) && !/cannot guarantee|can't guarantee|does not guarantee|not guaranteed/i.test(line)) {
        problems.push(`${rel(f)}:${i + 1}: guarantee wording`);
      }
    }
  }
}

// Rule 4: private connect-src is data: only.
try {
  const { privateCsp } = await import(pathToFileURL(join(root, 'deploy/private/headers.mjs')).href);
  const connect = privateCsp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('connect-src'));
  if (connect !== 'connect-src data:') problems.push(`deploy/private/headers.mjs: connect-src must be exactly "data:" (is "${connect}")`);
} catch (e) {
  problems.push(`deploy/private/headers.mjs: cannot read privateCsp (${e instanceof Error ? e.message : e})`);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`INVARIANT ${p}`);
  console.error(`check-invariants: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-invariants: ok');
