# Day 1–7 implementation loop (progress record)

Source of truth for the Day 1–7 loop. Each iteration: take the next unchecked item → check official docs when
needed (record date and version) → implement → `npm run verify` → update docs → commit/push → tick the box.

Stop and report when: the specs and the code disagree; a developer action is needed and nothing else can proceed;
verify fails and cannot be fixed; or G1–G3 are met. CLAUDE.md rules 1–10 always apply. Never commit secrets.
The gate set (`data/eval/gate`) is used and must not be reused for tuning.

Decisions (2026-11-13): signing key generated and kept on the developer's Mac (only the public key is committed;
tests use throwaway keys generated at run time). Loop stops only when needed.

## Goals (end of Day 7 = 2026-11-18)

- **G1 — close the Day 1–2 gate**
  - [ ] Public cloud path: hosted URL, production App Check (reCAPTCHA Enterprise), `ONLY_IN_CLOUD`, candidates
        from the approved original 930004094.pdf, `inferenceSource = IN_CLOUD` — verified on a real device
  - [ ] Data separation: filled PDFs / arbitrary File / URL / unknown IDs rejected at the public entry (unit + E2E);
        no fictional personal data in private-side traffic (E2E; real-device Network check)
  - [x] Contest fit: recorded as pending (requirements §9, CLAUDE.md); answers still awaited
- **G2 — the Day 3–7 scope works end to end**
  - [x] Public: analysis by approved ID only, shown as "unadopted candidate"; review overlay on the original with
        the difference from the adopted revision
  - [x] Review → sign → bundle chain: candidate → human diff → review record → `formDefRevision` → manifest
        (hashes, versions, `keyId`) → signature → bundled in private-app; adoption history with `analysisRunId`
  - [x] Private: signature / hash / compatibility verified at start-up before any PII; failure blocks input;
        PDF filling driven by the signed FormDef field bindings
  - [x] One English flow: prepare (AI optional) → image → on-device extraction → explicit adoption → confirm all
        fields → PDF preview (pdf.js under CSP) → save → end; also manual-only and offline
  - [x] UI: Tailwind + shadcn/ui in both apps; copy centralised; keyboard operable; `aria-live` state changes;
        no guarantee wording
  - [x] State contract: React Hook Form owns edit values; edits withdraw confirmation and invalidate the PDF;
        stale extraction results discarded; manual edits never overwritten
- **G3 — quality**
  - [ ] `npm run verify` green (lint, typecheck, unit, bundle check, E2E for both apps) and CI green
  - [x] Private CSP stays `connect-src data:`; public CSP adds only observed hosts
  - [x] Docs updated (spike-b.md, development-history, specs together if changed); implemented vs verified reported

Out of scope (Day 8+): Firestore rules/ops, monitoring, spend caps, inactivity lock and bfcache recovery,
release evaluation (20 new cards), bundle-size reduction, video.

## Milestones

### M1 — Spike B code (public-app)
- [x] Official docs checked and recorded (App Check + reCAPTCHA Enterprise web, AI Logic `ONLY_IN_CLOUD`,
      `inCloudParams`, `responseSchema`, PDF inlineData, cloud model availability)
- [x] `packages/contracts/src/formDef.ts` (Zod FormDef candidate)
- [x] `public-app/src/catalog` (approved ID → bundled bytes + hash), `?bytes` plugin copy
- [x] `public-app/src/egress` (`analyzeApprovedForm(formId)` only; fixed request log)
- [x] `public-app/src/cloud` (App Check before AI; `ONLY_IN_CLOUD`; `IN_CLOUD` check; Zod)
- [x] UI "Unadopted candidate"; unit + E2E with a fake cloud layer, entry rejections
- [x] Public CSP widened only to documented/observed hosts
- [ ] Developer: reCAPTCHA Enterprise key + App Check registration, `.env.local`, deploy, real-device check

### M2 — FormDef, manifest, signing
- [x] `packages/contracts/src/manifest.ts`; ECDSA P-256/SHA-256 over canonical manifest bytes
- [x] Scripts: `scripts/forms/approve-source.mjs`, `promote-forms.mjs`, `sign-package.mjs`, `keygen.mjs`
- [x] Official form layout migrated to FormDef rev 1; adoption history under `forms/history/`
- [ ] Developer (Mac): keygen → sign → commit public key + signature

### M3 — private-app on the signed package
- [x] `private-app/src/packages` verification (signature, hashes, compatibility) replacing `bootstrap/fixedAssets.ts`
- [x] Field bindings drive `fillPdf`
- [x] Rejection tests: bad signature, forged hash, incompatible, revoked, out-of-range coordinates

### M4 — private UI and state
- [x] Tailwind + shadcn/ui (pinned, dependency-log)
- [x] Central copy (`private-app/src/ui/copy.ts`)
- [x] React Hook Form wired to the session contract
- [x] Stale-request discard (`requestId`, `documentRevision`)
- [x] pdf.js preview (bundled worker, CSP)
- [x] End-screen wording per architecture 9.3
- [x] E2E: manual, fake on-device, offline, edit invalidates PDF, late result discarded

### M5 — public review screen and adoption history
- [x] Candidate boxes over the original (pdf.js); diff vs adopted; history vs live candidate

### M6 — wrap-up
- [x] E2E both apps, basic a11y (keyboard, labels)
- [x] spike-b.md, development-history, README, CLAUDE.md status/phase
- [x] Consolidated real-device checklist for the developer

## Log
- 2026-11-13: plan approved; loop started.
- 2026-11-13: M1 code done (fake-tested, docs/spikes/spike-b.md). Waiting for the developer's reCAPTCHA/App Check setup; continuing with M2.
- 2026-11-13: M2 code done (contracts, scripts, rev 1, throwaway-key round trip). Waiting for the developer's key + signature; continuing with M3 (unsigned builds refuse to start).
- 2026-11-13: M3 done. private-app verifies the signed package at start-up (virtual:form-package); E2E builds use a throwaway key; an unsigned production build refuses entry → the developer must sign before the next private deploy.
- 2026-11-13: M4 step 1: Tailwind 4 + local shadcn/ui-pattern components in both apps, restyled screens, central copy; CSP unchanged.
- 2026-11-13: M4 step 2: React Hook Form owns values (useSessionForm use cases; reducer keeps only revisions/confirmations); ExtractionRequests (session generation, request id, document revision) discards stale responses; E2E for a late result.
- 2026-11-13: M4 done: pdf.js page-1 preview (worker bundled and started at bootstrap before PII, font faces disabled, no CSP change); screenshot docs/spikes/s5-preview-fictional.png (fictional values). Removed `bluetooth` from Permissions-Policy (unrecognized by Chrome). Real-device check of the hosted worker (.mjs MIME on Firebase Hosting) pending.
- 2026-11-13: M5 done: public review view (pdf.js original, adopted boxes solid green, live candidate dashed amber, comparison by semantic key, adoption history, candidate export JSON for promote-forms). Screenshot with the FAKE analyzer: docs/spikes/spike-b-review-fake.png.
- 2026-11-13: M6 done (a11y basics E2E, README/CLAUDE.md, docs/plans/device-checklist-day7.md). Loop stopped: remaining
  goal items need the developer (real-device evidence). Status:
  - Implemented and container-verified (fake models, throwaway key): all G2 items, G3 verify.
  - Not verified yet (needs developer): G1 public cloud path with real App Check; G1 data separation on the real
    device; G2 end-to-end on hosted URLs; production package signature; CI run of the latest commit.
