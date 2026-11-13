// Sign a package manifest with the developer's private key (kept outside the repository).
// Usage: FORMTWIN_SIGNING_KEY=<path> node scripts/forms/sign-package.mjs <packageId>
import { manifestSchema, manifestSigningText } from '@formtwin/contracts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, assertOutsideRepo, readJson, signBytes } from './lib.mjs';

const enc = (t) => new TextEncoder().encode(t);
const packageId = process.argv[2];
const keyPath = process.env.FORMTWIN_SIGNING_KEY;
if (!packageId || !keyPath) {
  console.error('Usage: FORMTWIN_SIGNING_KEY=<path> node scripts/forms/sign-package.mjs <packageId>');
  process.exit(2);
}
assertOutsideRepo(keyPath);
const { keyId, jwk } = readJson(keyPath);
const dir = join(ROOT, 'forms/packages', packageId);
const manifest = manifestSchema.parse(readJson(join(dir, 'manifest.json')));
if (manifest.keyId !== keyId) throw new Error(`manifest keyId ${manifest.keyId} != key ${keyId}`);
const signature = await signBytes(jwk, enc(manifestSigningText(manifest)));
writeFileSync(join(dir, 'manifest.sig.json'), JSON.stringify({ alg: 'ES256', keyId, signature }, null, 2) + '\n');
console.log(`signed forms/packages/${packageId}/manifest.json with ${keyId}`);
