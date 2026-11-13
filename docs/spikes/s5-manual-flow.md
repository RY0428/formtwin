# S5 — manual entry → confirmation → partial PDF (private-app)

Status: **implemented**, E2E-verified in the dev container, and run end-to-end on the real device (2026-11-12).

## What the screen does (apps/private-app/src/ui)
0. Fixed assets: the official form (930004094.pdf), its layout and BIZ UDGothic are imported as bytes at build time
   (`vite-plugin-bytes.ts`, `bootstrap/fixedAssets.ts`); the form hash is verified before entry is enabled.
   No runtime fetch. Bundle: `index-*.js` ≈ 8.2 MB (≈ 4.4 MB gzip) because the font and form are inlined.
1. On-device AI (optional): unchanged from Spike A; "Continue without AI" keeps the session manual.
2. Image + on-device extraction (optional).
3. Candidates: shown only. The person applies them explicitly — every possible family/given split of the name is
   offered (no automatic split); the expiry is split into year/month/day from `YYYY年MM月DD日` or ISO, with the
   original notation shown; the card number as read.
4. Fields: family name, given name, expiry year/month/day, card number — each with "Checked against my card".
   Editing or applying a candidate withdraws that field's confirmation (`pii/session/sessionState.ts`).
   Format checks (card number pattern, month/day ranges, real date) are hints, not proof of correctness.
5. PDF: built from an immutable snapshot of confirmed values only; empty/unchecked/overflow/unsupported fields are
   listed as left blank; "partially filled, not ready to submit" notice; save via a blob link with a fixed file name.
   Any later change to values or confirmations hides the link and revokes its URL.
6. End session: clears values, image, candidates and generated PDF; shows the agreed clearing/limits text.
Footer: PDL1.0 source credit for the form.

## Verified (Playwright, production-like build under the private CSP; `tests/e2e/s5-manual-flow.spec.ts`)
- Without AI and **offline after load**: manual entry → confirm 5 of 6 fields → PDF lists the unchecked card number
  as left blank → downloaded PDF contains the 5 confirmed values and not the unchecked one. No CSP violations,
  no request to another origin.
- Editing after creating the PDF hides "Save PDF" and unchecks the edited field.
- AI candidates (fake model): nothing is written until chosen; two name-split options offered; applied values stay
  unchecked.
- End session clears the fields.

## Real device (2026-11-12, developer's Mac, Chrome 157, hosted https://formtwin-dev-private.web.app)
- Prepare AI → explore-03 → extraction 20,242 ms. Candidates: name **`SANTOSTE MARIA CLARA`** (truth
  `SANTOS MARIA CLARA`; an earlier run on the same image read `SATOS`), card number and expiry correct.
- The developer chose the split `SANTOSTE | MARIA CLARA`, corrected the family name to `SANTOS`, applied the expiry
  and number candidates, checked all six fields, created and saved the PDF.
- Saved PDF (inspected): 7 pages, page 1 shows `SANTOS` / `MARIA CLARA`, `2026 年 12 月 01 日`, `JK24681357LM`
  on the right lines; title/author empty, producer/creator `FormTwin`, dates 2000-01-01; BIZ UDGothic embedded.
  It still carried an empty AcroForm dictionary created by pdf-lib — now removed after flattening.
- Takeaway: the same image gives different wrong names across runs, so per-field confirmation is required
  regardless of measured accuracy.

## Not done / next
- Real-device run on the Mac (deploy and try the flow; print one PDF).
- PDF preview inside the app (pdf.js viewer + worker under the private CSP), the full UI/UX pass (Day 3–7),
  inactivity lock and `visibilitychange` handling (architecture.md §9.1), bundle size reduction.

## 2026-11-13 — Hosted run after the Day 1–7 loop (developer's Mac, Chrome 157.0.8103.79, TEST profile)

**Setup**
- Signed package `isa-930004094-r1` (key `ft-d27d442d1434e11c`) verified at start-up. The footer shows the key and
  no TEST KEY label.
- Gemma 4 flag still enabled.

**Results**
- Prepare AI: 1,390,548 ms (about 23 min), including a model download. Availability was `downloadable` before.
  The model that served the request is not recorded yet (Use Cases screenshot pending).
- explore-03 extraction (prompt `spike-a-1`): 5,567 ms. All three fields correct: SANTOS MARIA CLARA,
  JK24681357LM, 2026年12月01日.
- Candidates → all fields checked → Create PDF: the page-1 preview was drawn with the values in the right places.
- Network (7 requests): same-origin document, script, stylesheet, pdf.worker `.mjs` (200) and favicon; plus
  `blob:` and `data:`. No other origin.
- Console: no CSP errors. pdf.js warning `TT: undefined function: 0` (font hinting; rendering unaffected).

**Problems found, and fixes (commit after this entry)**
1. After an edit, the PDF and preview were removed, but the notice "Values changed. Create the PDF again." was
   not shown. The invalidation effect cleared the stale state in the same pass. Fixed with a separate
   `invalidated` state; covered by E2E.
2. A candidate-filled, checked Given name was edited ("MARIA CLARe") and stayed checked. The developer did not
   re-check it.
   - Not reproduced in the container with select-and-type, insertText, Backspace+type or a composition sequence.
   - Fix: value changes are now detected by comparing the watched values with the last values seen. Before, it
     relied only on the input callback. Any input path now bumps the revision and withdraws the check.
   - Confirming is accepted only for the value already registered. A PDF snapshot taken before a change is
     registered treats every field as unchecked.
   - To re-check on the device.
3. Availability is refreshed after Prepare. A favicon is added (same-origin SVG).

