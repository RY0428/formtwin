// Scores an extraction run against a set's ground truth (docs/eval/protocol.md).
// Usage: node scripts/eval/score.mjs data/eval/<set>/manifest.json data/eval/results/<run>.json
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [manifestPath, resultsPath] = process.argv.slice(2);
if (!manifestPath || !resultsPath) {
  console.error('usage: score.mjs <manifest.json> <results.json>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
const truthByFile = new Map(manifest.cases.map((c) => [c.file, c.groundTruth]));

export const FIELDS = ['fullName', 'residenceCardNumber', 'periodOfStayExpiry'];

// Allowed normalization (protocol §3). Original-notation match is reported separately.
const collapse = (s) => s.trim().replace(/\s+/g, ' ');
function normDate(s) {
  const t = s.trim();
  const m = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/.exec(t) ?? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}
const toPrinted = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${y}年${m}月${d}日`;
};
const normalize = { fullName: collapse, residenceCardNumber: (s) => s.trim(), periodOfStayExpiry: normDate };
const original = { fullName: (t) => t, residenceCardNumber: (t) => t, periodOfStayExpiry: toPrinted };

const stats = Object.fromEntries(
  FIELDS.map((f) => [f, { n: 0, exactOriginal: 0, exactNormalized: 0, unread: 0, wrong: 0, emptyTruth: 0, emptyTruthProposed: 0 }]),
);
const times = { first: [], warm: [] };
let timeouts = 0;
const wrongList = [];

for (const run of results.runs) {
  const truth = truthByFile.get(run.file);
  if (!truth) throw new Error(`no ground truth for ${run.file} in ${basename(manifestPath)}`);
  if (run.timedOut) timeouts += 1;
  else (run.pageFirstRun ? times.first : times.warm).push(run.extractMs);
  for (const f of FIELDS) {
    const s = stats[f];
    const want = truth[f];
    const got = run.timedOut ? null : (run.fields?.[f] ?? null);
    if (want === null || want === undefined) {
      s.emptyTruth += 1;
      if (got !== null && got !== '') s.emptyTruthProposed += 1;
      continue;
    }
    s.n += 1;
    if (got === null || got === '') {
      s.unread += 1;
      continue;
    }
    if (got === original[f](want)) s.exactOriginal += 1;
    const ng = normalize[f](got);
    const nw = normalize[f](want);
    if (ng !== null && ng === nw) s.exactNormalized += 1;
    else {
      s.wrong += 1;
      wrongList.push(`${run.file} ${f}: got "${got}", truth "${want}"`);
    }
  }
}

const pct = (a, n) => (n === 0 ? '-' : `${a}/${n} (${Math.round((100 * a) / n)}%)`);
const p = (arr, q) => {
  if (arr.length === 0) return '-';
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
};

console.log(`# Score: ${results.run} (set: ${results.set})\n`);
console.log('Per field (denominator N = runs whose ground truth has a value; timeouts count as unread):\n');
for (const f of FIELDS) {
  const s = stats[f];
  console.log(`- ${f}: N=${s.n}; exact original ${pct(s.exactOriginal, s.n)}; exact normalized ${pct(s.exactNormalized, s.n)}; unread ${pct(s.unread, s.n)}; wrong ${pct(s.wrong, s.n)}${s.emptyTruth ? `; empty-truth proposed ${pct(s.emptyTruthProposed, s.emptyTruth)}` : ''}`);
}
console.log(`\nTiming (ms): first run after page load n=${times.first.length} p50=${p(times.first, 0.5)} p95=${p(times.first, 0.95)}; warm n=${times.warm.length} p50=${p(times.warm, 0.5)} p95=${p(times.warm, 0.95)}; timeouts=${timeouts}`);
if (wrongList.length) console.log(`\nWrong candidates:\n${wrongList.map((w) => `- ${w}`).join('\n')}`);
if (Array.isArray(results.pdfChecks)) {
  const checked = results.pdfChecks.filter((p) => Array.isArray(p.misfills));
  const mis = checked.flatMap((p) => p.misfills.map((m) => `${p.file} ${m}`));
  console.log(`\nPDF after confirmation: ${checked.length} PDFs compared; mis-fills ${mis.length}${mis.length ? `\n${mis.map((m) => `- ${m}`).join('\n')}` : ''}`);
}

// Card number as offered for one-click adoption (release2 protocol, decision 2026-11-14 option A):
// a candidate is offered only when it matches the card format.
{
  const FORMAT = /^[A-Z]{2}\d{8}[A-Z]{2}$/;
  let n = 0;
  let correct = 0;
  let wrongOffered = 0;
  let notOffered = 0;
  for (const run of results.runs) {
    const want = truthByFile.get(run.file).residenceCardNumber;
    if (want === null || want === undefined) continue;
    n += 1;
    const got = run.timedOut ? null : (run.fields?.residenceCardNumber ?? null);
    if (got === null || got === '' || !FORMAT.test(got)) notOffered += 1;
    else if (got === want) correct += 1;
    else wrongOffered += 1;
  }
  console.log(`\nCard number as offered for one-click adoption: N=${n}; correct and offered ${pct(correct, n)}; wrong but offered ${pct(wrongOffered, n)}; not offered (typed by hand) ${pct(notOffered, n)}`);
}

