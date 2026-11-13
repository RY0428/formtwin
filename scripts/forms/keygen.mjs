// Generate the package signing key ON THE DEVELOPER'S MACHINE (never in CI or the repo).
// Usage: node scripts/forms/keygen.mjs <private-key-path-outside-repo>
// Writes the private JWK to that path (mode 0600) and the public key to forms/keys/<keyId>.pub.json.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, assertOutsideRepo, keyIdFor, subtle } from './lib.mjs';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/forms/keygen.mjs <private-key-path-outside-repo>');
  process.exit(2);
}
assertOutsideRepo(out);
if (existsSync(out)) {
  console.error(`Refusing to overwrite ${out}`);
  process.exit(2);
}
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await subtle.exportKey('jwk', pair.privateKey);
const pub = await subtle.exportKey('jwk', pair.publicKey);
const keyId = await keyIdFor(pub);
// Public key first: if anything fails, no orphan private key is left behind.
mkdirSync(join(ROOT, 'forms/keys'), { recursive: true });
const pubPath = join(ROOT, 'forms/keys', `${keyId}.pub.json`);
writeFileSync(pubPath, JSON.stringify({ keyId, jwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } }, null, 2) + '\n');
writeFileSync(out, JSON.stringify({ keyId, jwk: priv }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(`keyId ${keyId}`);
console.log(`private key: ${out} (keep it safe; never commit it)`);
console.log(`public key:  forms/keys/${keyId}.pub.json (commit this)`);
