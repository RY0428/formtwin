# Release re-evaluation results — key fields (release2, 2026-11-14, developer's Mac)

**Verdict: FAIL** — the safety criterion passed (**no wrong card number offered for one-click adoption, 0/18**),
but the availability criteria did not: correct and offered **14/18** (threshold ≥ 15/18) and not offered (typed
by hand) **4/18** (threshold ≤ 3/18). All other frozen criteria pass. Judged once under
`docs/eval/release2-protocol.md` (frozen `ab68491`); the set (`acc2c43`) was generated after the freeze, no image
was viewed, nothing was tuned on it. Thresholds are not changed after the fact; the set is not reused.

Run: `data/eval/results/release2-2026-11-14-mac.json` (`npm run device:check -- --eval release2`), device report
`docs/device-runs/2026-11-14T07-41-26-916Z-acc2c43.json`. Build acc2c43 (includes option A), Chrome 157.0.8103.79,
Gemma 4 flag Enabled (model per call not reported by Chrome), firebase 13.3.0, prompt `spike-a-1`.

| Field | Metric | Result | Threshold | Pass |
|---|---|---|---|---|
| fullName | exact, original | 17/20 | ≥ 16/20 | yes |
| residenceCardNumber | wrong but offered for one-click | **0/18** | ≤ 1/18 | yes |
| residenceCardNumber | correct and offered | **14/18** | ≥ 15/18 | **no** |
| residenceCardNumber | not offered (typed by hand) | **4/18** | ≤ 3/18 | **no** |
| periodOfStayExpiry | exact, normalized | 18/18 | ≥ 17/18 | yes |
| fullName, expiry | unread | 0, 0 | ≤ 2 each | yes |
| blank fields | value proposed (raw model output) | 1/4 | ≤ 1/4 | yes |
| time | warm extraction p95 | 5.9 s (p50 4.6 s), 0 timeouts | ≤ 15 s | yes |
| PDF | mis-fills after confirmation | 0 (20 PDFs) | 0 | yes |

Wrong card numbers (all rejected by the format check, so the user types them):
- release2-03 `BI15008051Z0` for `BI15008051ZO` (O → 0 at the end)
- release2-05 `ZS8011550801` for `ZS80115508OI` (O → 0 and I → 1 at the end)
- release2-09 `I005118850BZ` for `IO05118850BZ` (O → 0 at the start)
- release2-12 `SZ5810850100` for `SZ58108501QO` (Q → 0 and O → 0 at the end)

Names: release2-02 `MWANGI WンジRU` (part rendered in katakana), release2-10 `MOYO TENDAI 見本` and release2-19
`HOSSAIN TANVIRLE` (watermark text appended). Blank number on release2-20 returned `sample` (watermark text; rejected by
the format check).

## Observations (not part of the verdict)
- Across both release runs, every wrong card number came from letters O / I / Q in the letter positions being read as
  digits. Option A stopped all of them from being adopted with one click (0 wrong offered in release2).
- The model has no instruction about the card-number layout; the prompt names the field only.
- Names: two of three errors are watermark text; one is a script switch (katakana) that the app's name check flags
  (non-Latin letters).
