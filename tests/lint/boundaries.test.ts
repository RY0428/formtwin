import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Lints virtual files placed inside the real tree, so the same config that CI uses
// decides the result. Each case must be rejected (or accepted) for the stated rule.
const root = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: root });

async function ruleIds(relativePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${root}/${relativePath}` });
  if (result === undefined) throw new Error('no lint result');
  return result.messages.map((m) => m.ruleId ?? `fatal:${m.message}`);
}

const PRIVATE = 'apps/private-app/src/ui/__lint_fixture__.ts';
const PRIVATE_ONDEVICE = 'apps/private-app/src/ondevice/__lint_fixture__.ts';
const PUBLIC = 'apps/public-app/src/ui/__lint_fixture__.ts';
const PUBLIC_CLOUD = 'apps/public-app/src/cloud/__lint_fixture__.ts';
const DOMAIN = 'packages/domain/src/__lint_fixture__.ts';
const CONTRACTS = 'packages/contracts/src/__lint_fixture__.ts';

describe('app separation (CLAUDE.md rule 10)', () => {
  it('rejects private-app importing public-app', async () => {
    const ids = await ruleIds(PRIVATE, "import { App } from '../../../public-app/src/ui/App.tsx';\nexport { App };\n");
    expect(ids).toContain('boundaries/dependencies');
  });

  it('rejects public-app importing private-app', async () => {
    const ids = await ruleIds(PUBLIC, "import { App } from '../../../private-app/src/ui/App.tsx';\nexport { App };\n");
    expect(ids).toContain('boundaries/dependencies');
  });

  it('rejects domain importing contracts and contracts importing apps', async () => {
    expect(
      await ruleIds(DOMAIN, "import { extractionResultSchema } from '../../contracts/src/index.ts';\nexport { extractionResultSchema };\n"),
    ).toContain('boundaries/dependencies');
    expect(
      await ruleIds(CONTRACTS, "import { App } from '../../../apps/private-app/src/ui/App.tsx';\nexport { App };\n"),
    ).toContain('boundaries/dependencies');
  });

  it('allows apps to import shared packages', async () => {
    const ids = await ruleIds(PRIVATE, "import { SEMANTIC_KEYS } from '@formtwin/domain';\nexport const keys = SEMANTIC_KEYS;\n");
    expect(ids).toEqual([]);
  });
});

describe('private-app has no egress or persistence (CLAUDE.md rules 4–5)', () => {
  const forbidden: [string, string][] = [
    ['fetch', "export const r = fetch('/x');\n"],
    ['window.fetch', "export const r = window.fetch('/x');\n"],
    ['XMLHttpRequest', 'export const x = new XMLHttpRequest();\n'],
    ['WebSocket', "export const w = new WebSocket('wss://x');\n"],
    ['sendBeacon', "export const b = navigator.sendBeacon('/x');\n"],
    ['localStorage', "localStorage.setItem('k', 'v');\n"],
    ['sessionStorage', "sessionStorage.setItem('k', 'v');\n"],
    ['indexedDB', "export const r = indexedDB.open('db');\n"],
    ['caches', "export const c = caches.open('c');\n"],
    ['navigator.storage', 'export const d = navigator.storage.getDirectory();\n'],
    ['document.cookie', "document.cookie = 'a=b';\n"],
    ['dynamic import', "export const m = import('./x.ts');\n"],
  ];
  it.each(forbidden)('rejects %s', async (_name, code) => {
    expect((await ruleIds(PRIVATE, code)).length).toBeGreaterThan(0);
  });

  const forbiddenImports = [
    'firebase/firestore',
    'firebase/app-check',
    'firebase/analytics',
    'firebase/remote-config',
    '@firebase/ai',
  ];
  it.each(forbiddenImports)('rejects import of %s', async (mod) => {
    const ids = await ruleIds(PRIVATE_ONDEVICE, `import * as m from '${mod}';\nexport { m };\n`);
    expect(ids).toContain('no-restricted-imports');
  });

  it('allows firebase/ai only under src/ondevice', async () => {
    const code = "import * as ai from 'firebase/ai';\nexport { ai };\n";
    expect(await ruleIds(PRIVATE, code)).toContain('no-restricted-imports');
    expect(await ruleIds(PRIVATE_ONDEVICE, code)).not.toContain('no-restricted-imports');
  });
});

describe('public-app SDK placement', () => {
  it('allows firebase/ai and app-check only under src/cloud', async () => {
    const ai = "import * as ai from 'firebase/ai';\nexport { ai };\n";
    const appCheck = "import * as ac from 'firebase/app-check';\nexport { ac };\n";
    expect(await ruleIds(PUBLIC, ai)).toContain('no-restricted-imports');
    expect(await ruleIds(PUBLIC, appCheck)).toContain('no-restricted-imports');
    expect(await ruleIds(PUBLIC_CLOUD, ai)).not.toContain('no-restricted-imports');
    expect(await ruleIds(PUBLIC_CLOUD, appCheck)).not.toContain('no-restricted-imports');
  });

  it('rejects firestore in public-app until a reviewed need exists', async () => {
    const ids = await ruleIds(PUBLIC_CLOUD, "import * as fs from 'firebase/firestore';\nexport { fs };\n");
    expect(ids).toContain('no-restricted-imports');
  });
});
