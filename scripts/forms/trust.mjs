// Edit forms/trust.json (docs/decisions.md 2026-11-14). Public data only; never touches private keys.
//   node scripts/forms/trust.mjs add-key <keyId>                 (needs forms/keys/<keyId>.pub.json)
//   node scripts/forms/trust.mjs retire-key <keyId> [YYYY-MM-DD] (packages made on or before that date still verify)
//   node scripts/forms/trust.mjs revoke-key <keyId>
//   node scripts/forms/trust.mjs revoke-package <packageId> "<reason>"
import { manifestSchema, manifestSigningText, trustListSchema } from '@formtwin/contracts';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson, sha256Hex } from './lib.mjs';

const FILE = join(ROOT, 'forms/trust.json');
const today = () => new Date().toISOString().slice(0, 10);
const [cmd, id, arg] = process.argv.slice(2);
const trust = trustListSchema.parse(readJson(FILE));
const key = trust.keys.find((k) => k.keyId === id);

function save() {
  trust.updatedAt = today();
  writeFileSync(FILE, `${JSON.stringify(trustListSchema.parse(trust), null, 2)}\n`);
  console.log(`forms/trust.json updated (${cmd} ${id})`);
}

switch (cmd) {
  case 'add-key':
    if (!existsSync(join(ROOT, 'forms/keys', `${id}.pub.json`))) throw new Error(`no public key forms/keys/${id}.pub.json`);
    if (key) throw new Error(`${id} is already listed (${key.status})`);
    trust.keys.push({ keyId: id, status: 'active', since: today() });
    save();
    break;
  case 'retire-key':
    if (!key || key.status !== 'active') throw new Error(`${id} is not an active key`);
    if (trust.keys.filter((k) => k.status === 'active').length < 2) throw new Error('add the new key first: retiring the last active key leaves nothing to sign with');
    if (arg !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(arg) && arg <= today())) throw new Error('retiredAt must be a date not in the future');
    key.status = 'retired';
    key.retiredAt = arg ?? today();
    save();
    break;
  case 'revoke-key':
    if (!key) throw new Error(`${id} is not listed`);
    key.status = 'revoked';
    delete key.retiredAt;
    save();
    break;
  case 'revoke-package': {
    if (!arg) throw new Error('a reason is required');
    const manifest = manifestSchema.parse(readJson(join(ROOT, 'forms/packages', id, 'manifest.json')));
    const manifestSha256 = sha256Hex(Buffer.from(manifestSigningText(manifest), 'utf8'));
    if (trust.revokedPackages.some((r) => r.packageId === id && r.manifestSha256 === manifestSha256)) throw new Error(`${id} is already revoked`);
    trust.revokedPackages.push({ packageId: id, manifestSha256, reason: arg, revokedAt: today() });
    save();
    if (Object.values(readJson(join(ROOT, 'forms/current.json'))).some((c) => c.packageId === id)) {
      console.warn(`WARNING: ${id} is the current package. Point forms/current.json to another revision (or sign a fixed one) before deploying; check:package now fails.`);
    }
    break;
  }
  default:
    console.error('Usage: node scripts/forms/trust.mjs add-key|retire-key|revoke-key|revoke-package …');
    process.exit(2);
}
