import { createHash, webcrypto } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * `import pkg from 'virtual:form-package'` → the signed public form package, bundled as bytes
 * at build time (no runtime fetch; architecture.md §3.1, §8.2).
 *
 * - Production/dev: reads forms/packages/<id>/manifest.json + manifest.sig.json and the committed
 *   public key forms/keys/<keyId>.pub.json. If the package is not signed yet, the module says so and
 *   the app refuses to start entry (it never falls back to unsigned data).
 * - `--mode e2e` only: signs an in-memory manifest with a throwaway key generated for this build.
 *   That key is never written anywhere; the E2E bundle is never deployed.
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FORM_ID = 'isa-930004094';
/** forms/current.json names the revision this app bundles; changing it needs a signed package. */
const CURRENT = (JSON.parse(readFileSync(fileURLToPath(new URL('../../forms/current.json', import.meta.url)), 'utf8')) as Record<
  string,
  { revision: number; packageId: string }
>)[FORM_ID];
if (
  !CURRENT ||
  !Number.isInteger(CURRENT.revision) ||
  !new RegExp(`^${FORM_ID}-r${CURRENT.revision}(-p[2-9]|-p[1-9][0-9])?$`).test(CURRENT.packageId)
) {
  throw new Error('forms/current.json: invalid entry for ' + FORM_ID);
}
const PACKAGE_ID = CURRENT.packageId;
const DEFAULT_FILES = {
  sourcePdf: 'forms/sources/930004094.pdf',
  formDef: `forms/defs/${FORM_ID}/rev-${CURRENT.revision}.formdef.json`,
  font: 'apps/private-app/assets/fonts/BIZUDGothic-Regular.ttf',
  history: `forms/history/${FORM_ID}/rev-${CURRENT.revision}.history.json`,
  latinFont: 'apps/private-app/assets/fonts/IBMPlexMono-Regular.ttf',
} as const;
type Role = keyof typeof DEFAULT_FILES;

const VIRTUAL = 'virtual:form-package';
const RESOLVED = '\0' + VIRTUAL;

const read = (p: string) => readFileSync(ROOT + p);
const json = (p: string): unknown => JSON.parse(read(p).toString('utf8'));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const e = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${e.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
}

function bytesExpr(b: Buffer): string {
  return `b(${JSON.stringify(b.toString('base64'))})`;
}

async function ephemeralPackage() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const keyId = `ft-${sha(Buffer.from(JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y }))).slice(0, 16)}`;
  const def = json(DEFAULT_FILES.formDef) as { formDefRevision: number; ontologyVersion: string; formId: string };
  const manifest = {
    manifestVersion: 1,
    packageId: PACKAGE_ID,
    formId: def.formId,
    formDefRevision: def.formDefRevision,
    schemaVersion: 1,
    ontologyVersion: def.ontologyVersion,
    minAppVersion: '0.1.0',
    status: 'active',
    createdAt: '2026-11-13',
    keyId,
    files: (Object.keys(DEFAULT_FILES) as Role[]).map((role) => {
      const b = read(DEFAULT_FILES[role]);
      return { path: DEFAULT_FILES[role], role, sha256: sha(b), size: b.length };
    }),
  };
  const sig = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    new TextEncoder().encode(canonical(manifest)),
  );
  return {
    manifest,
    signature: { alg: 'ES256', keyId, signature: Buffer.from(sig).toString('base64') },
    publicKey: { keyId, jwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } },
    // The E2E build trusts only its own throwaway key.
    trust: { schemaVersion: 1, updatedAt: '2026-11-14', keys: [{ keyId, status: 'active', since: '2026-11-13' }], revokedPackages: [] },
  };
}

function committedPackage() {
  const dir = `forms/packages/${PACKAGE_ID}/`;
  if (!existsSync(ROOT + dir + 'manifest.json') || !existsSync(ROOT + dir + 'manifest.sig.json')) return null;
  const manifest = json(dir + 'manifest.json') as { keyId: string };
  const keyPath = `forms/keys/${manifest.keyId}.pub.json`;
  if (!existsSync(ROOT + keyPath)) return null;
  // Fail closed with a clear message: a signed package is never bundled without its trust list.
  if (!existsSync(ROOT + 'forms/trust.json')) throw new Error('forms/trust.json is missing: the signed package cannot be trusted (docs/forms/key-rotation.md)');
  return { manifest, signature: json(dir + 'manifest.sig.json'), publicKey: json(keyPath), trust: json('forms/trust.json') };
}

export function formPackagePlugin(mode: string): Plugin {
  return {
    name: 'formtwin-form-package',
    enforce: 'pre',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      const ephemeral = mode === 'e2e';
      const signed = ephemeral ? await ephemeralPackage() : committedPackage();
      const manifestFiles = (signed?.manifest as { files?: { role: Role; path: string }[] } | undefined)?.files;
      // A signed package bundles exactly its manifest's files; the defaults apply to the E2E build
      // (all roles) and to an unsigned package (entry is refused anyway).
      const paths: Partial<Record<Role, string>> = manifestFiles ? {} : { ...DEFAULT_FILES };
      for (const f of manifestFiles ?? []) paths[f.role] = f.path;
      const files = (Object.keys(paths) as Role[]).map((r) => `${r}: ${bytesExpr(read(paths[r] as string))}`).join(',\n  ');
      return `const b = (s) => { const t = atob(s); const a = new Uint8Array(t.length); for (let i = 0; i < t.length; i += 1) a[i] = t.charCodeAt(i); return a; };
export default {
  packageId: ${JSON.stringify(PACKAGE_ID)},
  testKey: ${JSON.stringify(ephemeral)},
  manifest: ${JSON.stringify(signed?.manifest ?? null)},
  signature: ${JSON.stringify(signed?.signature ?? null)},
  publicKey: ${JSON.stringify(signed?.publicKey ?? null)},
  trust: ${JSON.stringify(signed?.trust ?? null)},
  files: {
  ${files}
  },
};`;
    },
  };
}
