// Turn a reviewed decision file into an immutable FormDef revision + adoption history.
// Usage: node scripts/forms/promote-forms.mjs <review.json>
// The review file is written by a human after comparing the cloud candidate (saved from
// public-app) with the original. Refuses to overwrite an existing revision.
import { adoptionHistorySchema, formDefCandidateSchema, formDefSchema } from '@formtwin/contracts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, readJson, sha256Hex } from './lib.mjs';

const reviewPath = process.argv[2];
if (!reviewPath) {
  console.error('Usage: node scripts/forms/promote-forms.mjs <review.json>');
  process.exit(2);
}
const review = readJson(reviewPath);
let candidateInfo = { analysisRunId: null, model: null, promptVersion: null, candidateSha256: null };
if (review.candidate) {
  const raw = readFileSync(join(dirname(reviewPath), review.candidate.path));
  formDefCandidateSchema.parse(JSON.parse(raw.toString('utf8')).candidate);
  candidateInfo = {
    analysisRunId: review.candidate.analysisRunId,
    model: review.candidate.model,
    promptVersion: review.candidate.promptVersion,
    candidateSha256: sha256Hex(raw),
  };
}
const def = formDefSchema.parse(review.formDef);
const history = adoptionHistorySchema.parse({
  formId: def.formId,
  formDefRevision: def.formDefRevision,
  origin: review.candidate ? 'cloud-candidate' : 'manual-layout',
  ...candidateInfo,
  changes: review.changes,
  review: review.review,
});
const defOut = join(ROOT, 'forms/defs', def.formId, `rev-${def.formDefRevision}.formdef.json`);
const histOut = join(ROOT, 'forms/history', def.formId, `rev-${def.formDefRevision}.history.json`);
for (const p of [defOut, histOut]) if (existsSync(p)) throw new Error(`revision exists (immutable): ${p}`);
mkdirSync(dirname(defOut), { recursive: true });
mkdirSync(dirname(histOut), { recursive: true });
writeFileSync(defOut, JSON.stringify(def, null, 2) + '\n');
writeFileSync(histOut, JSON.stringify(history, null, 2) + '\n');
console.log(`wrote rev ${def.formDefRevision} of ${def.formId}`);
