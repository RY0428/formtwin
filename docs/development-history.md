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
