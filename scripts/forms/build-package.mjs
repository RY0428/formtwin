// Build an UNSIGNED package manifest from a reviewed FormDef revision.
// Usage: node scripts/forms/build-package.mjs <formId> <revision> <keyId> [createdAt YYYY-MM-DD] [packaging n ≥ 2]
// Packaging 2+ adds the Latin font (IBM Plex Mono) and the id suffix -p<n> (docs/decisions.md 2026-11-21).
// Writes forms/packages/<packageId>/manifest.json (<formId>-r<rev>[-p<n>]). Sign it with sign-package.mjs.
import { adoptionHistorySchema, formDefSchema, manifestSchema } from '@formtwin/contracts';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson, sha256Hex } from './lib.mjs';

const [formId, revArg, keyId, createdAtArg, packagingArg] = process.argv.slice(2);
const packaging = packagingArg === undefined ? 1 : Number(packagingArg);
if (!Number.isInteger(packaging) || packaging < 1) throw new Error('packaging must be an integer ≥ 1');
if (!formId || !revArg || !keyId) {
  console.error('Usage: node scripts/forms/build-package.mjs <formId> <revision> <keyId> [createdAt] [packaging n]');
  process.exit(2);
}
const rev = Number(revArg);
const defPath = `forms/defs/${formId}/rev-${rev}.formdef.json`;
const histPath = `forms/history/${formId}/rev-${rev}.history.json`;
const def = formDefSchema.parse(readJson(join(ROOT, defPath)));
adoptionHistorySchema.parse(readJson(join(ROOT, histPath)));
const sourcePath = `forms/sources/${formId.replace(/^isa-/, '')}.pdf`;
const fontPath = 'apps/private-app/assets/fonts/BIZUDGothic-Regular.ttf';
const latinFontPath = 'apps/private-app/assets/fonts/IBMPlexMono-Regular.ttf';

const file = (path, role) => {
  const bytes = readFileSync(join(ROOT, path));
  return { path, role, sha256: sha256Hex(bytes), size: statSync(join(ROOT, path)).size };
};
const files = [file(sourcePath, 'sourcePdf'), file(defPath, 'formDef'), file(fontPath, 'font'), file(histPath, 'history')];
if (packaging >= 2) files.push(file(latinFontPath, 'latinFont'));
if (files[0].sha256 !== def.sourcePdfSha256) throw new Error('source PDF hash differs from the FormDef');

const manifest = manifestSchema.parse({
  manifestVersion: 1,
  packageId: `${formId}-r${rev}${packaging >= 2 ? `-p${packaging}` : ''}`,
  formId,
  formDefRevision: rev,
  schemaVersion: def.schemaVersion,
  ontologyVersion: def.ontologyVersion,
  minAppVersion: '0.1.0',
  status: 'active',
  createdAt: createdAtArg ?? new Date().toISOString().slice(0, 10),
  keyId,
  files,
});
const dir = join(ROOT, 'forms/packages', manifest.packageId);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote forms/packages/${manifest.packageId}/manifest.json (unsigned)`);
