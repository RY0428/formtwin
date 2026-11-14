#!/usr/bin/env node
// Release inventory (M11): what a deploy contains, for the submission record and for rollback.
//   npm run build && npm run release:inventory      → docs/releases/<commit>.json + summary
// Public data only: commit, versions, package/trust state, file hashes of both builds, hosting headers.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { evaluateTrust, manifestSchema, manifestSigningText, trustListSchema } from '@formtwin/contracts';

const ROOT = new URL('..', import.meta.url).pathname;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no') !== '';

const lock = json('package-lock.json').packages;
const ver = (name) => lock[`node_modules/${name}`]?.version ?? null;
const versions = Object.fromEntries(
  ['firebase', '@firebase/ai', '@firebase/app-check', 'react', 'vite', 'pdf-lib', 'pdfjs-dist', 'zod', '@playwright/test'].map((n) => [n, ver(n)]),
);

const trust = trustListSchema.parse(json('forms/trust.json'));
const packages = Object.entries(json('forms/current.json')).map(([formId, cur]) => {
  const dir = `forms/packages/${cur.packageId}`;
  if (!existsSync(join(ROOT, dir, 'manifest.sig.json'))) return { formId, packageId: cur.packageId, signed: false };
  const manifest = manifestSchema.parse(json(`${dir}/manifest.json`));
  const manifestSha256 = sha(Buffer.from(manifestSigningText(manifest), 'utf8'));
  return {
    formId,
    packageId: cur.packageId,
    signed: true,
    keyId: manifest.keyId,
    keyStatus: trust.keys.find((k) => k.keyId === manifest.keyId)?.status ?? 'not listed',
    manifestSha256,
    trust: evaluateTrust(trust, manifest, manifestSha256),
  };
});

function files(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return null;
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.push({ path: relative(abs, p), size: statSync(p).size, sha256: sha(readFileSync(p)) });
    }
  };
  walk(abs);
  return out;
}
const builds = Object.fromEntries(
  ['public-app', 'private-app'].map((app) => {
    const list = files(`apps/${app}/dist`);
    // The build stamps its commit into the bundle (__APP_COMMIT__); a different stamp means a stale dist.
    const stamped = list?.some((f) => f.path.endsWith('.js') && readFileSync(join(ROOT, `apps/${app}/dist`, f.path), 'utf8').includes(commit)) ?? false;
    return [app, list === null ? { built: false } : { built: true, matchesCommit: stamped, files: list }];
  }),
);

const firebase = json('firebase.json');
const hosting = (Array.isArray(firebase.hosting) ? firebase.hosting : [firebase.hosting]).map((h) => ({
  target: h.target,
  csp: h.headers?.flatMap((x) => x.headers).find((x) => x.key === 'Content-Security-Policy')?.value ?? null,
}));

const inventory = {
  generatedAt: new Date().toISOString(),
  commit,
  dirty,
  node: process.version,
  versions,
  trustListSha256: sha(readFileSync(join(ROOT, 'forms/trust.json'))),
  packages,
  firebaseJsonSha256: sha(readFileSync(join(ROOT, 'firebase.json'))),
  hosting,
  builds,
};
mkdirSync(join(ROOT, 'docs/releases'), { recursive: true });
const out = join(ROOT, 'docs/releases', `${commit}${dirty ? '-dirty' : ''}.json`);
writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`release inventory: ${relative(ROOT, out)}`);
console.log(`commit ${commit}${dirty ? ' (uncommitted changes)' : ''}; packages: ${packages.map((p) => `${p.packageId} ${p.signed ? p.trust : 'UNSIGNED'}`).join(', ')}`);
for (const [app, b] of Object.entries(builds)) {
  console.log(`${app}: ${b.built ? `${b.files.length} files${b.matchesCommit ? '' : ' — WARNING: dist is not stamped with this commit (rebuild)'}` : 'not built'}`);
}
const problems = packages.filter((p) => !p.signed || p.trust !== 'trusted').length + Object.values(builds).filter((b) => !b.built || !b.matchesCommit).length;
if (problems > 0) process.exitCode = 1;
