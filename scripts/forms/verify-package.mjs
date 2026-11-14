// Verify a package: signature with the committed public key, then every file hash.
// Usage: node scripts/forms/verify-package.mjs <packageId>
import {
  evaluateTrust,
  keyIdForJwk,
  manifestSchema,
  manifestSignatureSchema,
  manifestSigningText,
  publicKeySchema,
  trustListSchema,
} from '@formtwin/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson, sha256Hex, verifyBytes } from './lib.mjs';

const enc = (t) => new TextEncoder().encode(t);
const packageId = process.argv[2];
if (!packageId) {
  console.error('Usage: node scripts/forms/verify-package.mjs <packageId>');
  process.exit(2);
}
const dir = join(ROOT, 'forms/packages', packageId);
const manifest = manifestSchema.parse(readJson(join(dir, 'manifest.json')));
const sig = manifestSignatureSchema.parse(readJson(join(dir, 'manifest.sig.json')));
const pub = publicKeySchema.parse(readJson(join(ROOT, 'forms/keys', `${sig.keyId}.pub.json`)));
if (sig.keyId !== manifest.keyId || pub.keyId !== sig.keyId) throw new Error('keyId mismatch');
if ((await keyIdForJwk(pub.jwk)) !== pub.keyId) throw new Error('keyId does not match the public key material');
if (!(await verifyBytes(pub.jwk, enc(manifestSigningText(manifest)), sig.signature))) throw new Error('BAD SIGNATURE');
for (const f of manifest.files) {
  if (sha256Hex(readFileSync(join(ROOT, f.path))) !== f.sha256) throw new Error(`hash mismatch: ${f.path}`);
}
// Same trust rules as the private-app start-up check (docs/decisions.md 2026-11-14).
const trust = trustListSchema.parse(readJson(join(ROOT, 'forms/trust.json')));
const decision = evaluateTrust(trust, manifest, sha256Hex(Buffer.from(manifestSigningText(manifest), 'utf8')));
console.log(`ok ${packageId}: signature by ${sig.keyId}, ${manifest.files.length} file hashes match, trust: ${decision}`);
if (process.argv.includes('--require-trusted') && decision !== 'trusted') {
  console.error(`NOT TRUSTED ${packageId}: ${decision}`);
  process.exit(1);
}
