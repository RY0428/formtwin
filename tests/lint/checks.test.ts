import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url).pathname;
const run = (script: string, dir: string) => {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts', script), dir], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? '') };
  }
};

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function fixture(files: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), 'formtwin-check-'));
  mkdirSync(join(dir, 'deploy/private'), { recursive: true });
  cpSync(join(ROOT, 'deploy/private/headers.mjs'), join(dir, 'deploy/private/headers.mjs'));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  return dir;
}

const okApps = {
  'apps/private-app/src/a.ts': 'x(InferenceMode.ONLY_ON_DEVICE);',
  'apps/public-app/src/b.ts': 'x(InferenceMode.ONLY_IN_CLOUD);',
};

describe('check-invariants', () => {
  it('passes a clean tree', () => {
    expect(run('check-invariants.mjs', fixture(okApps)).ok).toBe(true);
  });
  it.each([
    ['a PREFER mode', { 'apps/private-app/src/c.ts': 'InferenceMode.PREFER_IN_CLOUD' }, 'PREFER'],
    ['PREFER in another public file', { 'apps/public-app/src/c.ts': 'InferenceMode.PREFER_IN_CLOUD' }, 'PREFER'],
    ['PREFER_ON_DEVICE in the explainer', { 'apps/public-app/src/cloud/fieldExplainer.ts': 'InferenceMode.PREFER_ON_DEVICE' }, 'PREFER'],
    ['the explainer file name in private-app', { 'apps/private-app/src/cloud/fieldExplainer.ts': 'InferenceMode.PREFER_IN_CLOUD' }, 'PREFER'],
    ['cloud mode in private-app', { 'apps/private-app/src/c.ts': 'InferenceMode.ONLY_IN_CLOUD' }, 'must not use'],
    ['guarantee wording', { 'apps/private-app/src/c.ts': "const s = 'Zero leak: nothing remains on this device';" }, 'guarantee'],
  ])('fails on %s', (_n, extra, msg) => {
    const r = run('check-invariants.mjs', fixture({ ...okApps, ...extra }));
    expect(r.ok).toBe(false);
    expect(r.out).toContain(msg);
  });
  it('allows only InferenceMode.PREFER_IN_CLOUD in the public field explainer', () => {
    const r = run('check-invariants.mjs', fixture({ ...okApps, 'apps/public-app/src/cloud/fieldExplainer.ts': 'x(InferenceMode.PREFER_IN_CLOUD);' }));
    expect(r.ok).toBe(true);
  });
  it('allows a negated guarantee and comments', () => {
    const r = run(
      'check-invariants.mjs',
      fixture({ ...okApps, 'apps/private-app/src/c.ts': "// zero leak is forbidden wording\nconst s = 'This app cannot guarantee deletion';" }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('check-secrets', () => {
  it('passes a clean tree', () => {
    expect(run('check-secrets.mjs', fixture({ 'a.json': '{"x":1}' })).ok).toBe(true);
  });
  it.each([
    ['a private JWK', { 'k.json': JSON.stringify({ kty: 'EC', d: 'A'.repeat(43) }) }],
    ['a PEM key', { 'k.txt': ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') }],
    ['an API key value', { 'c.ts': `const k = '${'AI' + 'za' + 'B'.repeat(35)}';` }],
    ['an .env.local file', { 'apps/x/.env.local': 'A=1' }],
    ['an App Check debug token under another name', { '.env.dev': 'VITE_APPCHECK_DEBUG' + '_TOKEN=123E4567-E89B-12D3-A456-426614174000' }],
  ])('fails on %s', (_n, files) => {
    expect(run('check-secrets.mjs', fixture(files)).ok).toBe(false);
  });
});
