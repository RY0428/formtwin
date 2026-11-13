// Post-build check of apps/public-app/dist (production build).
// Fails when the bundle contains the E2E fake analyzer, an App Check debug-token hook,
// a PREFER inference mode, or inline scripts. Supporting check only.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../apps/public-app/dist/', import.meta.url).pathname;

const FORBIDDEN = [
  ['e2e-fake-model', 'E2E fake analyzer'],
  ['fake.invalid', 'E2E fake analyzer'],
  ['e2e-dummy', 'E2E dummy config'],
  ['FIREBASE_APPCHECK_DEBUG_TOKEN = true', 'App Check debug token enabled'],
];
const REQUIRED = [
  ['only_in_cloud', 'ONLY_IN_CLOUD mode'],
  ['gemini-3.5-flash-lite', 'pinned cloud model'],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let failures = 0;
const seen = new Set();
for (const file of walk(dist)) {
  if (!/\.(js|mjs|html|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [needle, label] of FORBIDDEN) {
    if (text.includes(needle)) {
      console.error(`FORBIDDEN ${label}: "${needle}" in ${file.slice(dist.length)}`);
      failures += 1;
    }
  }
  for (const [needle] of REQUIRED) if (text.includes(needle)) seen.add(needle);
  if (file.endsWith('.html') && /<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) {
    console.error(`FORBIDDEN inline <script> in ${file.slice(dist.length)}`);
    failures += 1;
  }
}
for (const [needle, label] of REQUIRED) {
  if (!seen.has(needle)) {
    console.error(`MISSING ${label}: "${needle}"`);
    failures += 1;
  }
}
if (failures > 0) {
  console.error(`check-public-bundle: ${failures} problem(s)`);
  process.exit(1);
}
console.log('check-public-bundle: ok');
