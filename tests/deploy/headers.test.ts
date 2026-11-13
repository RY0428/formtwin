import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { privateCsp, privateHeaders } from '../../deploy/private/headers.mjs';
import { publicHeaders } from '../../deploy/public/headers.mjs';

interface HostingSite {
  target: string;
  public: string;
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const firebaseJson = JSON.parse(
  readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'),
) as { hosting: HostingSite[] };

function siteHeaders(target: string): Record<string, string> {
  const site = firebaseJson.hosting.find((s) => s.target === target);
  if (site === undefined) throw new Error(`missing hosting target ${target}`);
  const all = site.headers.find((h) => h.source === '**');
  if (all === undefined) throw new Error(`missing ** headers for ${target}`);
  return Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
}

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split(';').map((d) => {
      const [name = '', ...values] = d.trim().split(/\s+/);
      return [name, values.join(' ')];
    }),
  );
}

describe('firebase.json matches deploy/*/headers.mjs', () => {
  it('private-app', () => {
    expect(siteHeaders('private')).toMatchObject(privateHeaders);
  });
  it('public-app', () => {
    expect(siteHeaders('public')).toMatchObject(publicHeaders);
  });
  it('apps deploy from separate build outputs', () => {
    const dirs = firebaseJson.hosting.map((s) => s.public);
    expect(new Set(dirs).size).toBe(dirs.length);
  });
});

describe('private-app CSP invariants (architecture.md §3.2)', () => {
  const d = directives(privateCsp);
  it.each([
    ['connect-src', 'data:'],
    ['default-src', "'none'"],
    ['form-action', "'none'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['frame-ancestors', "'none'"],
  ])('%s is %s', (name, value) => {
    expect(d.get(name)).toBe(value);
  });

  it('has no remote origins, inline or eval sources', () => {
    expect(privateCsp).not.toMatch(/https?:|wss?:|\*|'unsafe-/);
  });

  it('allows data: only in connect-src (SDK image conversion)', () => {
    for (const [name, value] of d) {
      if (name !== 'connect-src') expect(value).not.toContain('data:');
    }
  });

  it('has no CSP reporting endpoint', () => {
    expect(d.has('report-uri')).toBe(false);
    expect(d.has('report-to')).toBe(false);
  });
});

describe('public-app HTML caching', () => {
  it('revalidates the HTML entry so a new deploy is picked up (assets are content-hashed)', () => {
    const site = firebaseJson.hosting.find((s) => s.target === 'public');
    const html = site?.headers.filter((h) => h.source === '/index.html' || h.source === '/') ?? [];
    expect(html).toHaveLength(2);
    for (const h of html) expect(h.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' });
  });
});

describe('public-app CSP host list is pinned (only documented/observed hosts, docs/spikes/spike-b.md)', () => {
  it('connect-src, script-src and frame-src match exactly', () => {
    const d = directives(siteHeaders('public')['Content-Security-Policy'] ?? '');
    expect(d.get('connect-src')).toBe(
      "'self' https://firebasevertexai.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.google.com/recaptcha/",
    );
    expect(d.get('script-src')).toBe("'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/");
    expect(d.get('frame-src')).toBe('https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/');
    expect(d.get('default-src')).toBe("'none'");
  });
});
