import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifestSigningText, type Manifest } from '@formtwin/contracts';
import { PackageError, verifyPackage, type BundledPackage } from './verifyPackage.ts';

const ROOT = new URL('../../../../', import.meta.url);
const read = (p: string) => new Uint8Array(readFileSync(new URL(p, ROOT)));
const PATHS = {
  sourcePdf: 'forms/sources/930004094.pdf',
  formDef: 'forms/defs/isa-930004094/rev-1.formdef.json',
  font: 'apps/private-app/assets/fonts/BIZUDGothic-Regular.ttf',
  history: 'forms/history/isa-930004094/rev-1.history.json',
} as const;
type Files = { -readonly [K in keyof typeof PATHS]: Uint8Array };

const hex = async (b: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');

async function makeKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const keyId = `ft-${(await hex(new TextEncoder().encode(String(jwk.x)))).slice(0, 16)}`;
  return { pair, keyId, publicKey: { keyId, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } } };
}

async function build(opts: {
  files?: Partial<Files>;
  manifest?: Partial<Manifest>;
  hashFiles?: Partial<Files>;
  /** Trust list for the generated key; default: the key is active. */
  trust?: (keyId: string, manifestSha256: string) => unknown;
} = {}): Promise<BundledPackage> {
  const key = await makeKey();
  const files: Files = {
    sourcePdf: read(PATHS.sourcePdf),
    formDef: read(PATHS.formDef),
    font: read(PATHS.font),
    history: read(PATHS.history),
    ...opts.files,
  };
  const hashed = { ...files, ...opts.hashFiles };
  const manifest: Manifest = {
    manifestVersion: 1,
    packageId: 'isa-930004094-r1',
    formId: 'isa-930004094',
    formDefRevision: 1,
    schemaVersion: 1,
    ontologyVersion: '0.0.0-provisional',
    minAppVersion: '0.1.0',
    status: 'active',
    createdAt: '2026-11-13',
    keyId: key.keyId,
    files: await Promise.all(
      (Object.keys(PATHS) as (keyof Files)[]).map(async (role) => ({
        path: PATHS[role],
        role,
        sha256: await hex(hashed[role]),
        size: hashed[role].length,
      })),
    ),
    ...opts.manifest,
  };
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key.pair.privateKey,
    new TextEncoder().encode(manifestSigningText(manifest)),
  );
  return {
    packageId: 'isa-930004094-r1',
    testKey: true,
    manifest,
    signature: { alg: 'ES256', keyId: key.keyId, signature: Buffer.from(sig).toString('base64') },
    publicKey: key.publicKey,
    trust: (opts.trust ?? ((keyId: string) => ({ schemaVersion: 1, keys: [{ keyId, status: 'active', since: '2026-11-13' }], revokedPackages: [] })))(
      key.keyId,
      await hex(new TextEncoder().encode(manifestSigningText(manifest))),
    ),
    files,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof PackageError ? e.code : `other:${String(e)}`;
  }
}

function editFormDef(edit: (d: { fields: { placement: { x: number }; transform: string }[] }) => void): Uint8Array {
  const d = JSON.parse(new TextDecoder().decode(read(PATHS.formDef)));
  edit(d);
  return new TextEncoder().encode(JSON.stringify(d));
}

describe('verifyPackage (throwaway keys)', () => {
  it('accepts an intact signed package and derives the layout', async () => {
    const v = await verifyPackage(await build());
    expect(v.layout.fields.map((f) => f.id)).toContain('residenceCardNumber');
    expect(v.formDef.formDefRevision).toBe(1);
  });

  it('refuses an unsigned package', async () => {
    const p = await build();
    expect(await code(verifyPackage({ ...p, signature: null }))).toBe('unsigned');
  });

  it('refuses a signature from another key', async () => {
    const p = await build();
    const other = await makeKey();
    expect(await code(verifyPackage({ ...p, publicKey: { ...other.publicKey, keyId: (p.publicKey as { keyId: string }).keyId } }))).toBe(
      'bad_signature',
    );
  });

  it('refuses a manifest edited after signing', async () => {
    const p = await build();
    const m = { ...(p.manifest as Manifest), formDefRevision: 2 };
    expect(await code(verifyPackage({ ...p, manifest: m }))).toBe('bad_signature');
  });

  it('refuses mismatched key ids', async () => {
    const p = await build();
    expect(await code(verifyPackage({ ...p, publicKey: { ...(p.publicKey as object), keyId: 'ft-0000000000000000' } }))).toBe(
      'key_mismatch',
    );
  });

  it('refuses a forged file (hash differs from the signed manifest)', async () => {
    const p = await build();
    const pdf = new Uint8Array(p.files.sourcePdf);
    pdf[100] = (pdf[100] ?? 0) ^ 1;
    expect(await code(verifyPackage({ ...p, files: { ...p.files, sourcePdf: pdf } }))).toBe('hash_mismatch');
  });

  it('refuses a revoked package', async () => {
    expect(await code(verifyPackage(await build({ manifest: { status: 'revoked' } })))).toBe('revoked');
  });

  it('refuses an incompatible app version or ontology', async () => {
    expect(await code(verifyPackage(await build({ manifest: { minAppVersion: '9.0.0' } })))).toBe('incompatible');
    expect(await code(verifyPackage(await build({ manifest: { ontologyVersion: '9' } })))).toBe('incompatible');
  });

  it('refuses out-of-range coordinates even when correctly signed', async () => {
    const bad = editFormDef((d) => {
      const f = d.fields[0];
      if (f) f.placement.x = 590;
    });
    expect(await code(verifyPackage(await build({ files: { formDef: bad } })))).toBe('invalid_formdef');
  });

  it('refuses a binding this app version does not implement', async () => {
    const bad = editFormDef((d) => {
      const f = d.fields[0];
      if (f) f.transform = 'name.given';
    });
    expect(await code(verifyPackage(await build({ files: { formDef: bad } })))).toBe('incompatible');
  });

  describe('trust list (key rotation and revocation)', () => {
    const list = (keys: unknown[], revokedPackages: unknown[] = []) => ({ schemaVersion: 1, keys, revokedPackages });
    it('refuses a key that is not on the list, even with a valid signature', async () => {
      expect(await code(verifyPackage(await build({ trust: () => list([]) })))).toBe('untrusted_key');
    });
    it('refuses a revoked key', async () => {
      const pkg = await build({ trust: (keyId) => list([{ keyId, status: 'revoked', since: '2026-11-13' }]) });
      expect(await code(verifyPackage(pkg))).toBe('key_revoked');
    });
    it('accepts a retired key for packages made on or before retirement, refuses later ones', async () => {
      const retired = (retiredAt: string) => (keyId: string) => list([{ keyId, status: 'retired', since: '2026-11-01', retiredAt }]);
      expect(await code(verifyPackage(await build({ trust: retired('2026-11-13') })))).toBe('ok');
      expect(await code(verifyPackage(await build({ trust: retired('2026-11-12') })))).toBe('key_retired');
    });
    it('refuses a revoked package (exact manifest hash)', async () => {
      const pkg = await build({
        trust: (keyId, sha) =>
          list([{ keyId, status: 'active', since: '2026-11-13' }], [
            { packageId: 'isa-930004094-r1', manifestSha256: sha, reason: 'test', revokedAt: '2026-11-14' },
          ]),
      });
      expect(await code(verifyPackage(pkg))).toBe('revoked');
    });
    it('a revocation of another manifest of the same id does not apply', async () => {
      const pkg = await build({
        trust: (keyId) =>
          list([{ keyId, status: 'active', since: '2026-11-13' }], [
            { packageId: 'isa-930004094-r1', manifestSha256: 'a'.repeat(64), reason: 'test', revokedAt: '2026-11-14' },
          ]),
      });
      expect(await code(verifyPackage(pkg))).toBe('ok');
    });
    it('refuses a missing or malformed trust list', async () => {
      expect(await code(verifyPackage(await build({ trust: () => null })))).toBe('malformed');
      expect(await code(verifyPackage(await build({ trust: (keyId) => list([{ keyId, status: 'retired', since: '2026-11-13' }]) })))).toBe('malformed');
    });
  });
});
