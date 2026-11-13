import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adoptionHistorySchema,
  canonicalJson,
  formDefSchema,
  manifestSchema,
  manifestSigningText,
  type Manifest,
} from '@formtwin/contracts';
// @ts-expect-error -- plain .mjs helper without types
import { ROOT, assertOutsideRepo, keyIdFor, sha256Hex, signBytes, verifyBytes } from '../../scripts/forms/lib.mjs';

const enc = (t: string) => new TextEncoder().encode(t);
const read = (p: string) => readFileSync(join(ROOT as string, p));

async function throwawayKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { priv, pub, keyId: (await keyIdFor(pub)) as string };
}

function manifestFor(keyId: string): Manifest {
  const file = (path: string, role: Manifest['files'][number]['role']) => {
    const b = read(path);
    return { path, role, sha256: sha256Hex(b) as string, size: b.length };
  };
  return manifestSchema.parse({
    manifestVersion: 1,
    packageId: 'isa-930004094-r1',
    formId: 'isa-930004094',
    formDefRevision: 1,
    schemaVersion: 1,
    ontologyVersion: '0.0.0-provisional',
    minAppVersion: '0.1.0',
    status: 'active',
    createdAt: '2026-11-13',
    keyId,
    files: [
      file('forms/sources/930004094.pdf', 'sourcePdf'),
      file('forms/defs/isa-930004094/rev-1.formdef.json', 'formDef'),
      file('apps/private-app/assets/fonts/BIZUDGothic-Regular.ttf', 'font'),
      file('forms/history/isa-930004094/rev-1.history.json', 'history'),
    ],
  });
}

describe('committed form revision 1', () => {
  it('FormDef and history validate, and the FormDef points at the approved source hash', () => {
    const def = formDefSchema.parse(JSON.parse(read('forms/defs/isa-930004094/rev-1.formdef.json').toString()));
    adoptionHistorySchema.parse(JSON.parse(read('forms/history/isa-930004094/rev-1.history.json').toString()));
    expect(def.sourcePdfSha256).toBe(sha256Hex(read('forms/sources/930004094.pdf')));
  });
});

describe('manifest signing (throwaway key, test only)', () => {
  it('verifies an untouched manifest', async () => {
    const k = await throwawayKey();
    const m = manifestFor(k.keyId);
    const sig = await signBytes(k.priv, enc(manifestSigningText(m)));
    expect(await verifyBytes(k.pub, enc(manifestSigningText(m)), sig)).toBe(true);
  });

  it('rejects a changed manifest, a changed file hash, and another key', async () => {
    const k = await throwawayKey();
    const other = await throwawayKey();
    const m = manifestFor(k.keyId);
    const sig = await signBytes(k.priv, enc(manifestSigningText(m)));
    const revoked = { ...m, status: 'revoked' as const };
    const forged = { ...m, files: m.files.map((f, i) => (i === 0 ? { ...f, sha256: '0'.repeat(64) } : f)) };
    expect(await verifyBytes(k.pub, enc(manifestSigningText(revoked)), sig)).toBe(false);
    expect(await verifyBytes(k.pub, enc(manifestSigningText(forged)), sig)).toBe(false);
    expect(await verifyBytes(other.pub, enc(manifestSigningText(m)), sig)).toBe(false);
  });

  it('canonical bytes do not depend on key order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 'x' }] })).toBe('{"a":[{"c":"x","d":2}],"b":1}');
  });
});

describe('private key location guard', () => {
  it('refuses paths inside the repository and accepts the temp dir', () => {
    expect(() => assertOutsideRepo(join(ROOT as string, 'forms/keys/x.private.jwk.json'))).toThrow();
    expect(() => assertOutsideRepo(join(tmpdir(), 'formtwin-signing-test.json'))).not.toThrow();
  });
});
