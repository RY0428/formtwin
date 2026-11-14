// Post-build check of apps/private-app/dist (architecture.md §4.2-1, §13).
// Fails when the built bundle contains markers of Firebase services or
// runtime APIs the private app must not use. A pass is a supporting check only;
// it does not prove the absence of egress (network tests do that).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../apps/private-app/dist/', import.meta.url).pathname;

const FORBIDDEN = [
  ['axe-core', 'axe-core (test-only accessibility checker)'],
  ['firestore.googleapis.com', 'Firestore endpoint'],
  ['firebaseappcheck.googleapis.com', 'App Check endpoint'],
  ['recaptcha', 'reCAPTCHA'],
  ['google-analytics.com', 'Analytics'],
  ['googletagmanager.com', 'Analytics'],
  ['firebaseremoteconfig.googleapis.com', 'Remote Config endpoint'],
  ['navigator.sendBeacon', 'Beacon'],
  ['localStorage.setItem', 'localStorage write'],
  ['sessionStorage.setItem', 'sessionStorage write'],
  ['serviceWorker.register', 'Service worker'],
  ['testKey:!0', 'E2E throwaway signing key'],
  ['testKey: true', 'E2E throwaway signing key'],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let failures = 0;
for (const file of walk(dist)) {
  if (!/\.(js|mjs|html|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [needle, label] of FORBIDDEN) {
    if (text.includes(needle)) {
      console.error(`FORBIDDEN ${label}: "${needle}" in ${file.slice(dist.length)}`);
      failures += 1;
    }
  }
  if (file.endsWith('.html') && /<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) {
    console.error(`FORBIDDEN inline <script> in ${file.slice(dist.length)}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`check-private-bundle: ${failures} problem(s)`);
  process.exit(1);
}
console.log('check-private-bundle: ok');
