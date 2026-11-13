# Development History

This file separates work done **before** the #BuildHybridAI 2026 submission period from work done **during** it (Rules section 6, R07).

Submission period: 2026-11-11 13:30 PT – 2026-11-30 14:00 PT (JST 2026-11-12 06:30 – 2026-12-01 07:00).

## Before the submission period

- Product concept and three design documents (Japanese), drafted 2026-11-10 to 2026-11-12:
  - `docs/specs/requirements.md`
  - `docs/specs/architecture.md`
  - `docs/specs/tech-stack.md`
- No application code existed before the period.

> TODO: confirm the exact timestamps of the final spec revisions relative to the period start (2026-11-12 06:30 JST) and adjust this section if any revision happened after the start.

## During the submission period

| Date (JST) | Work | Commit / PR |
|---|---|---|
| | | |
| 2026-11-12 | Monorepo scaffold: npm workspaces (`apps/public-app`, `apps/private-app`, `packages/domain`, `packages/contracts`), TypeScript strict, ESLint boundary and egress/storage restrictions with tests, Vitest, Playwright CSP smoke tests against production builds, Firebase Hosting config for two sites, CI workflow. No AI features yet. | (initial commit) |
| 2026-11-12 | Moved to Node 24 (required by @firebase/ai 3.x); pinned firebase 13.3.0. Spike A investigation: SDK image conversion needs `fetch('data:…')` → private CSP changed to `connect-src data:` (specs updated). Found that the SDK sends `ONLY_ON_DEVICE` requests to the cloud when the Prompt API global is missing; added a guard. On-device adapter, AI readiness state, image intake, spike screen, fake-model E2E tests. Real-device run pending. | |
| 2026-11-12 | Real-device Spike A runs (local and hosted, clean profile, offline) recorded. Spike C: PDF layout contract, `fillPdf` (confirmed values only, overflow/unsupported-character reporting, flatten, fixed metadata), dummy form, pdf.js render check. PDF font changed to BIZ UDGothic (full embedding) after subsetting failures. | |
| 2026-11-12 | Official form 930004094.pdf bundled under PDL1.0 and mapped (page 1). S5: private-app flow — bundled fixed assets (no fetch), candidates applied only by choice (name split options, date split), per-field confirmation withdrawn on edit, partial PDF from confirmed values with left-blank list and stale-PDF invalidation, end-session clearing; E2E incl. offline. | |
| 2026-11-12/13 | Evaluation protocol frozen (`fe793c2`), gate set generated afterwards, scoring script; correction-time timers in the app. Key-field gate run on the developer's Mac (hosted URL, clean profile): name 9/10, number 9/10, expiry 10/10, unread 0, warm p95 5.9 s, 0 PDF mis-fills — pass. | |
| 2026-11-13 | Post-gate fixes: placeholder "null" → not read, prompt `spike-a-1` (exact copying), accent and card-number warnings on candidates; tests. Organizer answer on the model recorded; remaining questions posted on Discord. | |
| 2026-11-13 | Gemma 4 flag check on the developer's Mac: flag active (`model_version/v4`), but Prompt API still served by `nano_v3`; Gemma 4 not downloaded. Recorded in `docs/spikes/spike-a.md`. | |
| 2026-11-13 | Spike B code: FormDef candidate contract, approved-source catalog (original moved to `forms/sources/`), egress gateway (approved ID only, hash re-check, `IN_CLOUD` check, body-free audit log), App Check (reCAPTCHA Enterprise) + `ONLY_IN_CLOUD` adapter, public UI showing an unadopted candidate, public CSP for documented hosts, fake-analyzer E2E build and public bundle check. Real-service run pending. | |
| 2026-11-13 | Form package chain: reviewed FormDef and manifest contracts (canonical JSON, ES256), adoption history, scripts (approve-source, promote-forms, build/sign/verify package, keygen with a repository guard), FormDef rev 1 from the Spike C layout; throwaway-key round-trip tests. Production key not generated yet. | |
| 2026-11-13 | private-app runs on the signed form package: build-time `virtual:form-package` (committed manifest/signature/public key; E2E builds sign with a throwaway key), start-up verification of signature, key id, status, compatibility, file hashes, FormDef and the fixed binding table before entry; layout now derived from FormDef rev 1 (old layout JSON removed); rejection tests. | |
| 2026-11-13 | UI: Tailwind 4 and local shadcn/ui-pattern components in both apps, step cards, status badges, `aria-live` regions, central English copy for private-app; CSP unchanged (no inline styles). | |
| 2026-11-13 | private-app state: React Hook Form is the single owner of field values; session use cases bump revisions, withdraw confirmations and invalidate PDFs; extraction requests carry session generation, request id and document revision and stale responses are discarded (unit + E2E). | |
| 2026-11-13 | PDF preview: pdf.js page-1 render on a canvas with the worker bundled and started at bootstrap (before personal data), font faces disabled; preview cleared on invalidation. Permissions-Policy cleaned up. | |
| 2026-11-13 | Public review view: approved original rendered locally with pdf.js, adopted FormDef boxes and live candidate boxes overlaid, comparison by semantic key (layout agreement only), adoption history, export of the live candidate for the offline review script. | |
| 2026-11-13 | Wrap-up of the Day 1–7 loop: basic accessibility E2E (accessible names, keyboard-only manual flow), README and status updates, consolidated real-device checklist. | |
| 2026-11-13 | Hosted private-app run with the signed package (developer's Mac): extraction, preview and network observation recorded. Fixes: confirmation always withdrawn on any value change (watched-value comparison), visible PDF-invalidated notice, availability refresh after Prepare, favicon; package verification added to `npm run verify`. | |
| 2026-11-13 | Device re-check of the confirmation fix passed; the PDF-invalidated notice is now cleared on session end (output panel keyed on a session generation). Gemma 4 download and use cases recorded in spike-a.md. | |
| 2026-11-13 | PDF-invalidated notice moved into the session state (always cleared on end); device-flow E2E; build commit shown in both apps for device reports. | |
| 2026-11-13 | Hosted private-app flow verified on the developer's Mac with Build ac0c241 (signed package, on-device extraction, PDF preview, confirmation/invalidation, end session, same-origin network only). | |
| 2026-11-13 | Spike B hosted run: App Check token obtained on the device; generateContent 400 under investigation; public CSP adds the observed reCAPTCHA connect host; public error detail shown for diagnosis. | |
| 2026-11-13 | Public-app cloud diagnostics: fixed output-configuration variants (no config → full schema) to isolate the hosted 400; unit and E2E tests. | |
| 2026-11-13 | Hosted diagnostics isolated the cloud 400 to array minItems/maxItems in responseSchema; first successful hosted cloud analysis (20-field candidate, App Check enforced). Production schema reduced to the working shape (Zod still enforces limits); prompt spike-b-1. | |
| 2026-11-13 | Spike B verified on the developer's Mac (hosted, App Check enforced): 20-field candidate, 3 resolved keys, 9.4 s. Day 1–7 goals verified except the pending contest answers. | |
| 2026-11-13 | Hosted cloud candidate adopted as FormDef rev 2 (labels and mappings adopted, boxes corrected, unsupported fields rejected; history links the candidate hash); `forms/current.json` selects the bundled revision; unsigned r2 manifest prepared for the maintainer's signature; package-signing tests were not in the Vitest include list and now run. | |
| 2026-11-13 | FormDef rev 2 signed by the maintainer and verified on both hosted apps (build 075e665): the full chain cloud candidate → review → revision → signature → bundle runs on real data. Public HTML now revalidated on each load. | |
| 2026-11-13 | Loop environment: verification skill, independent reviewer subagent, invariant and secret checks (verify + CI, with violation tests), pre-commit secret hook, permission rules, UI snapshot script, device-flow E2E file, Day 8–12 progress file and decisions log. | |
| 2026-11-13 | Day 8–12 M0: specs aligned with the implementation (no Firestore; signed FormDef packages bundled; diagnostics panel specified); public bundle check forbids the Firestore endpoint. | |
| 2026-11-13 | Day 8–12 M7: session end and resume — 10-minute inactivity end with a 1-minute warning, immediate lock on a hidden tab with explicit Resume and wall-clock recheck, bfcache restore starts a new session; E2E with a fake clock. | |
| 2026-11-13 | M7 review fixes (stale image decode and late PDF after end dropped; E2E for ending during extraction and for the wall-clock recheck) and session decisions recorded in the three specs (two states, AI state across sessions, input-only activity). | |
