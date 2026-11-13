// Verify every signed package, and report whether the package named in forms/current.json is signed.
// An unsigned current package is reported (the production app then refuses entry) but does not fail
// the check, so the maintainer can sign it after review. A bad signature or hash always fails.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson } from './lib.mjs';

const dir = join(ROOT, 'forms/packages');
let failed = false;
for (const id of readdirSync(dir)) {
  if (!existsSync(join(dir, id, 'manifest.sig.json'))) continue;
  try {
    process.stdout.write(execFileSync(process.execPath, [join(ROOT, 'scripts/forms/verify-package.mjs'), id], { encoding: 'utf8' }));
  } catch {
    console.error(`FAILED ${id}`);
    failed = true;
  }
}
for (const [formId, cur] of Object.entries(readJson(join(ROOT, 'forms/current.json')))) {
  const signed = existsSync(join(dir, cur.packageId, 'manifest.sig.json'));
  console.log(`current ${formId}: ${cur.packageId} ${signed ? 'signed' : 'UNSIGNED — production builds refuse entry until the maintainer signs it'}`);
}
if (failed) process.exit(1);
