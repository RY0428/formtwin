# Release re-evaluation 2 results — key fields (release3, 2026-11-14, developer's Mac)

**Verdict: FAIL** — same pattern as release2: safety passed (**0/18 wrong card numbers offered for one-click
adoption**), availability did not: correct and offered **14/18** (≥ 15) and typed by hand **4/18** (≤ 3). All other
frozen criteria pass. Judged once under `docs/eval/release3-protocol.md` (frozen `d79d4dd`); set generated after the
freeze (`57555bc`), no image viewed, nothing tuned on it. Thresholds not changed after the fact; the set is not reused.

Run: `data/eval/results/release3-2026-11-14-mac.json`, device report `docs/device-runs/2026-11-14T14-11-32-726Z-e50c9bc.json`.
Build e50c9bc (prompt spike-a-2, option A), Chrome 157.0.8103.79, Gemma 4 flag Enabled (model per call not reported).

| Field | Metric | Result | Threshold | Pass |
|---|---|---|---|---|
| fullName | exact, original | 18/20 | ≥ 16/20 | yes |
| residenceCardNumber | wrong but offered for one-click | **0/18** | ≤ 1/18 | yes |
| residenceCardNumber | correct and offered | **14/18** | ≥ 15/18 | **no** |
| residenceCardNumber | not offered (typed by hand) | **4/18** | ≤ 3/18 | **no** |
| periodOfStayExpiry | exact, normalized | 18/18 | ≥ 17/18 | yes |
| fullName, expiry | unread | 0, 0 | ≤ 2 each | yes |
| blank fields | value proposed (raw model output) | 1/4 | ≤ 1/4 | yes |
| time | warm extraction p95 | 6.0 s (p50 4.9 s), 0 timeouts | ≤ 15 s | yes |
| PDF | mis-fills after confirmation | 0 (20 PDFs) | 0 | yes |

Wrong card numbers (all rejected by the format check → typed by hand):
- release3-03 `SI708105020B` for `SI70810502OB` (O → 0 at the end)
- release3-07 `IZ80051185B0` for `IZ80051185BO` (O → 0 at the end)
- release3-05 `QZ155508100IS` for `QZ15508100IS` (a digit repeated: 13 characters)
- release3-09 `OO015050811SI` for `OO15050811SI` (a digit repeated: 13 characters)

Names: release3-02 `OTIENO BRIANPLE` and release3-18 `ROUSSEL ANAISLE 見本` (watermark text). Blank number on release3-19
returned `sample` (watermark; rejected by the format check).

## Comparison across the three release runs (each on its own unused set)

| Run | Prompt | Correct and offered | Wrong offered | Typed by hand | Name exact |
|---|---|---|---|---|---|
| release (raw, before option A) | spike-a-1 | 15/18 (as offered) | 0 (as offered) | 3 | 17/20 |
| release2 | spike-a-1 + A | 14/18 | 0 | 4 | 17/20 |
| release3 | spike-a-2 + A | 14/18 | 0 | 4 | 18/20 |

The layout instruction did not raise the card-number rate on new cards: O → 0 errors became fewer (4 → 2) but a new
error (a repeated digit) appeared. Across 54 numbers in three runs, no wrong number was ever offered for one-click
adoption once option A applied.
