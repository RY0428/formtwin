# Gate run (real device) — docs/eval/protocol.md §6

Use the TEST Chrome profile (no extensions) on https://formtwin-dev-private.web.app after deploying the current main.
Do not change prompts, code or thresholds between steps.

1. Open the app, open DevTools (Network, Preserve log). Prepare AI.
2. Page-first-run timing (3 times): reload the page, Prepare AI, extract `data/eval/explore/explore-01.png`,
   note "Extract time". Repeat 3 times.
3. Warm-up: in the same page, extract `explore-01.png` once more (not scored).
4. Gate: in the same page, extract `data/eval/gate/gate-01.png` … `gate-12.png` in order, once each.
   For each card take one screenshot showing "3. Candidates" (the read values) and "Extract time".
   If a card takes over 30 s, write "timeout" for it.
5. Correction time: for gate-01 … gate-03, after extraction apply the candidates, fix if needed, check all six
   fields; note "Confirm time". Then "End session and clear data" and type the same card's values by hand,
   check all six; note "Manual entry time".
6. PDF check: on gate-01 after confirming, Create PDF → Save PDF; send the PDF.
7. Send all screenshots and the PDF. They are transcribed into `data/eval/results/gate-<date>-mac.json`
   and scored with `node scripts/eval/score.mjs data/eval/gate/manifest.json <results>`.
