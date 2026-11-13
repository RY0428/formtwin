# Gate results — key fields (2026-11-12/13, developer's Mac)

**Verdict: PASS** for the gate row 「重要欄」 (requirements.md §6) under the frozen protocol: accuracy and unread
thresholds, warm extraction p95 ≤ 15 s, and 0 PDF mis-fills after confirmation. Per-field confirmation stays
mandatory. This does not cover the release evaluation (20 new cards) or the Gemini Nano 4 question.

Protocol: `docs/eval/protocol.md`, frozen at `fe793c2`; gate set generated after the freeze (`3b775c8`).
Run: `data/eval/results/gate-2026-11-12-mac.json` (transcribed from screenshots; gate-05 number and gate-10 name
confirmed with zoomed screenshots). Scored with `scripts/eval/score.mjs`. Judged once; nothing was tuned on the gate set.

Environment: hosted https://formtwin-dev-private.web.app, Chrome 157.0.8103.79 (TEST profile, no extensions),
macOS (Intel per UA), model `nano_v3` (Gemma 4 flag Default), firebase 13.3.0, prompt `spike-a-0`,
schema `0.0.0-provisional`. Page not reloaded during the 12 gate extractions.

## Accuracy (candidates before any correction)

Two readings of N, because the protocol states both "N = every run whose truth has a value" (§3) and
"N is 10 per field, excluding the blank-field cards" (§5). Both are reported; the verdict is the same.

| Field | Metric | gate-01…10 (N=10) | All with a truth value | Threshold | Result |
|---|---|---|---|---|---|
| fullName | exact, original | 9/10 | 11/12 | ≥ 7/10 | pass |
| residenceCardNumber | exact, original | 9/10 | 10/11 | ≥ 9/10 | pass |
| periodOfStayExpiry | exact, normalized | 10/10 | 11/11 | ≥ 9/10 | pass |
| all fields | unread | 0/10 each | 0 | ≤ 2/10 | pass |

Wrong candidates:
- gate-05 number: `GP314159260R` for `GP31415926QR` — the letter Q read as digit 0 (the result also fails the
  2-letters/8-digits/2-letters format check, which the UI flags).
- gate-10 name: `SANTOS JOÃO PEDRO` for `SANTOS JOAO PEDRO` — a diacritic added that is not printed.

Blank-field cards (reported only):
- gate-11 (no expiry printed): the model returned the **literal string `"null"`** instead of JSON null, so the UI
  showed `null` as a value. Counted as "proposed a value". → Fix after the gate (see below).
- gate-12 (no card number printed): correctly not read.

## Time
- Warm extraction (12 gate cards, same page): p50 5.35 s, p95 5.94 s, max 5.94 s, 0 timeouts. Threshold p95 ≤ 15 s:
  **pass**. The 10 s target is met for warm runs.
- Page-first-run (explore-01 after reload, 3 times): 17.5 s, 5.6 s, 5.8 s. Only the first model load in the browser
  is slow; later reloads stay fast (Chrome keeps the model loaded).

## Network
Across the run: the document, `index-*.js`, `favicon.ico` (same origin), and `blob:` / `data:` entries only.
No other origin.

## PDF mis-fills after confirmation
gate-01: the six checked values (SUZUKI / KENTA / 2027 / 05 / 20 / GA10293847BC) appear on page 1 of the saved PDF
exactly (pdftotext); 7 pages, no AcroForm left, producer FormTwin. **0 mis-fills — pass.**

## Correction time (report only)
| Card | With candidates (Confirm time) | Manual entry | Note |
|---|---|---|---|
| gate-01 | 12.7 s | 52.8 s | extraction after idle took 16.5 s |
| gate-02 | 30.1 s | 45.5 s* | *typed values were gate-03's (6-field typing sample) |
| gate-03 | 10.0 s | 36.0 s | |
| median | 12.7 s | 45.5 s | candidates + check ≈ 3.6× faster than typing |

Name split: for `PEREZ GARCIA LUCIA` the developer chose family `PEREZ` / given `GARCIA LUCIA`. With two surnames the
card alone does not show where the family name ends — this is why the app offers all splits and never chooses.


## Findings acted on after the gate (the recorded result is unchanged; it belongs to prompt `spike-a-0`)
1. Placeholder text such as `"null"` / `N/A` / empty is turned into "not read" (`normalizeExtraction`).
2. Prompt `spike-a-1`: copy character by character; no added diacritics, no spelling correction, no letter↔digit swaps;
   blank fields as JSON null. Names with non-ASCII letters show a warning.
3. Candidate list shows format warnings next to "Use card number" and for accented names.
Effect on accuracy is not measured yet: re-check on the exploration set and new data only (the gate set is used).
