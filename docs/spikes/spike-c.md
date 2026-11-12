# Spike C — Japanese text into a fixed PDF form

Status: **done on a dummy form** (2026-11-12, dev container). The official form is not obtained yet; coordinates,
AcroForm presence and printing are still open.

## Versions
pdf-lib 1.17.1 (last published 2021-11-06 — unmaintained, see risks), @pdf-lib/fontkit 1.1.1, pdfjs-dist 6.5.438,
Node 24.22.1, Chromium 153 (Playwright) for rendering.

## What was built
- `packages/contracts/src/pdfLayout.ts` — Zod layout contract (page, pt, bottom-left origin, width, font size;
  coordinate text, AcroForm text, AcroForm checkbox) bound to the template's SHA-256.
- `apps/private-app/src/pii/fill/fillPdf.ts` — fills confirmed values only: template hash check → embed font →
  coordinate `drawText` / AcroForm `setText`/`check` → `updateFieldAppearances(font)` → `flatten` → fixed metadata
  (empty title/author/subject/keywords, producer/creator `FormTwin`, dates 2000-01-01, XMP removed).
  Values that overflow the field or contain characters the font lacks are left blank and reported
  (`notFilled`: `overflow` | `unsupported_char` | `type_mismatch` | `missing_field`); nothing is truncated or substituted.
- `scripts/spike-c/make-dummy-form.mjs` — deterministic DUMMY A4 form (3 coordinate boxes, 2 AcroForm text fields,
  1 checkbox) + layout JSON in `apps/private-app/assets/forms/`.
- `scripts/spike-c/render-check.mjs` — fills with fictional values and renders page 1 with pdf.js in Chromium;
  output `docs/spikes/spike-c/filled-normal.png`, `filled-overflow.png`.

## Results
- Unit tests (`fillPdf.test.ts`, 7): Japanese (kanji, kana, full-width digits, 髙﨑) and Latin values round-trip through
  pdf.js text extraction; form flattened (0 fields); metadata fixed; overflow and unsupported characters (𠮷) left
  blank and reported; only given values written; tampered template rejected; wrong value types rejected.
- Visual check (PNG): all labels and values rendered; overflowing name left blank; unchecked checkbox empty.
- **Font finding:** Noto Sans JP OTF (CFF) → `@pdf-lib/fontkit` subset encoding throws
  (`RangeError` in `CFFSubset.encode`). BIZ UDGothic TTF with `subset: true` → PDF builds (≈9 KB) but pdf.js renders
  most glyphs missing. With `subset: false` both labels and values render correctly. Decision: BIZ UDGothic, full
  embedding (developer, 2026-11-12). Cost: dummy template ≈3.1 MB (it embeds the font for its labels) and filled
  output ≈6.2 MB (two embedded copies). With an official form that has its own fonts, output ≈ form + 4.6 MB.

## Open / risks
- Official form: AcroForm or not, XFA/encryption, page size/rotation/CropBox, coordinates, redistribution terms.
- Output size: consider a build-time character-set subset of the font (e.g. JIS X 0208 + needed symbols) with a
  proper subsetter, then embed without pdf-lib subsetting. Characters outside the set must stay `unsupported_char`.
- pdf-lib is unmaintained since 2021; keep usage minimal and covered by tests.
- Bundling font/template bytes into private-app without runtime fetch (Vite import as bytes) and the pdf.js
  viewer/worker under the private CSP are part of the UI work (S5 / Day 3+), not done here.
- pdf.js 6.5 removed `isEvalSupported` and adds optional WebAssembly (`useWasm`, `wasmUrl`) and `cMapUrl`. For the
  viewer under the private CSP: disable or bundle wasm (wasm needs `'wasm-unsafe-eval'` in `script-src`), and supply
  CMaps without fetch if the official form uses non-embedded Japanese fonts. To check with the official PDF.
- Printing check: on the developer's machine.
