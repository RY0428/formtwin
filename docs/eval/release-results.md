# Release evaluation results — key fields (2026-11-14, developer's Mac)

**Verdict: FAIL** — `residenceCardNumber` 15/18 is below the frozen threshold (≥ 16/18). Every other frozen
criterion passes. Judged once under `docs/eval/release-protocol.md` (frozen `bd4745b`); the release set
(`228a051`) was generated after the freeze and was not used for any tuning. Thresholds are not changed after
the fact; the release set is not reused for a re-evaluation (requirements.md §6).

Run: `data/eval/results/release-2026-11-14-mac.json` (automated, `npm run device:check -- --eval release`), device
report `docs/device-runs/2026-11-14T07-18-24-091Z-b891a48.json`. Scored with `scripts/eval/score.mjs`.

Environment: hosted https://formtwin-dev-private.web.app, Build b891a48, Chrome 157.0.8103.79 (device:check
dedicated profile; flags: Prompt API multimodal input and Gemma 4 for built-in AI Enabled), firebase 13.3.0,
prompt `spike-a-1`, schema `0.0.0-provisional`, developer's Mac. The model serving each call is not reported by
Chrome: recorded as "extracted with Gemma 4 requested", not as a specific generation.

## Accuracy (candidates before any correction)

| Field | Metric | Result | Threshold | Pass |
|---|---|---|---|---|
| fullName | exact, original | 17/20 (85%) | ≥ 16/20 | yes |
| residenceCardNumber | exact, original | **15/18 (83%)** | ≥ 16/18 | **no** |
| periodOfStayExpiry | exact, normalized | 18/18 (100%) | ≥ 17/18 | yes |
| all fields | unread | 0 / 0 / 0 | ≤ 2 each | yes |
| blank fields | value proposed | 1/4 | ≤ 1/4 | yes |
| time | warm extraction p95 | 5.3 s (p50 4.0 s), 0 timeouts | ≤ 15 s | yes (10 s target met) |
| PDF | mis-fills after confirmation | 0 (20 PDFs) | 0 | yes |

Wrong candidates:
- release-01 number: `Q010080520IS` for `QO10080520IS` — letter O read as digit 0 (2nd character).
- release-04 number: `IS150811500B` for `IS15081150OB` — letter O read as digit 0 (11th character).
- release-15 number: `WA19284756CUC` for `WA19284756CU` — an extra letter appended.
- release-03 name: `DUBois Francois` for `DUBOIS FRANCOIS` — letter case changed.
- release-04 name: `PHAM DUC ANHLE` — letters from the watermark ("SAMPLE") appended.
- release-12 name: `PARK SEOYEONLE 見本` — watermark text ("SAMPLE 見本") appended.

Blank fields: release-19 (no card number printed) returned `NOT A REAL DOCUMENT` — watermark text proposed as the
number. release-17/18 (no expiry) and release-20 (no number) correctly not read. No literal `"null"` this time
(the gate's issue), and no added diacritics on the six diacritic-prone names (the gate's other issue).

## Observations (not part of the verdict)

- All four wrong number values (three wrong candidates and the watermark text) break the card-number format
  (2 letters + 8 digits + 2 letters), which the app already flags next to the candidate. The one-click "Use card
  number" button is still offered for them. This is derived from the values, not observed in the UI during the run.
- Three of the seven errors come from the synthetic watermark overlapping the text. Real cards have no such
  watermark, but this is a property of the test set, not a reason to discount the result.
- Both gate fixes held: no `"null"` strings, no invented diacritics.

## What the protocol requires next

Record the cause and decide between narrowing the AI target (e.g. card number by hand only) and stronger
handling of format failures; any re-evaluation uses a **new, unused** set under a protocol frozen before that set
exists. Per-field confirmation stays mandatory in every case.
