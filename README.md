# FormTwin

Fill Japan's **Application for Extension of Period of Stay** from a photo of a residence card — with the personal
data read only by on-device AI. Built for #BuildHybridAI 2026 with **Firebase AI Logic** (hybrid inference).

- Personal-entry app: https://formtwin-dev-private.web.app
- Public form analysis and field explanations: https://formtwin-dev.web.app
- Demo video (2:53, English subtitles): https://youtu.be/s3SPPqrm_NA
- License: Apache-2.0 (`LICENSE`); third-party material keeps its own terms (`THIRD_PARTY_NOTICES.md`)

Fictional data only. Not legal advice. FormTwin helps you copy values into the form; you check every value.

## What it does

Foreign residents in Japan copy their residence card into a Japanese paper form at every visa renewal. Those values
are personal data, so FormTwin reads them on the device:

1. Pick a photo of a residence card (fictional sample cards are in `data/eval/`).
2. The on-device model (Firebase AI Logic, `InferenceMode.ONLY_ON_DEVICE`) reads the name, card number and expiry
   date. They appear as **candidates** only, with a warning about similar characters (O/0, I/1).
3. You use or correct each candidate and tick "Checked against my card". A card number that breaks the card format
   is never offered for one-click use; you type it.
4. FormTwin fills page 1 of the official PDF (six fields: family name, given name, expiry year/month/day, card
   number) with only the checked values, shows a local preview, and you save it, print it and sign it by hand.

Manual entry works without AI, and the personal-entry page keeps working with the network off.

## Hybrid by data sensitivity

Two separate web apps (separate origins and builds; they must not import each other, enforced by lint) use Firebase
AI Logic in three ways:

| Feature | App | Data | Inference mode |
|---|---|---|---|
| Read the residence card | personal-entry | personal | `ONLY_ON_DEVICE` (Chrome's built-in model) — no cloud fallback by design |
| Analyse the approved blank form | public | public | `ONLY_IN_CLOUD` (gemini-3.5-flash-lite) with App Check (reCAPTCHA Enterprise, enforced) |
| Explain each form field | public | public labels only | `PREFER_IN_CLOUD` — cloud first, automatic on-device fallback |

- **Personal-entry app** (`apps/private-app`): Content-Security-Policy `connect-src data:` (the page cannot open
  network connections; `data:` is needed because the SDK converts image parts with `fetch('data:…')`). No App Check,
  analytics, Firestore or storage; values live in memory only and are cleared on "End session", after 10 minutes of
  inactivity, or when the page is restored from the back/forward cache. It starts only after verifying the bundled,
  signed form package (ES256, trust list). With @firebase/ai 3.1.0 an `ONLY_ON_DEVICE` model sends the request to
  the cloud when Chrome's `LanguageModel` global is missing; FormTwin checks for it first and falls back to manual
  entry instead.
- **Public app** (`apps/public-app`): sends only the approved blank original (by its ID; there is no file input).
  The cloud result is a field-definition *candidate*. A person reviews it; only an adopted revision is signed and
  bundled into the personal-entry app (`forms/`, see `forms/README.md`). The UI shows `inferenceSource` for the
  field explanations ("In the cloud" / "On this device (automatic fallback)").

## Try it

Use desktop Chrome. No login. Use fictional data only.

1. (On-device AI, optional) In `chrome://flags` enable "Prompt API Multimodal Input" and "Gemma 4 for built-in AI",
   then relaunch. The first "Prepare AI" can download the model (about 20+ minutes). Without it, use "Continue
   without AI": manual entry and the PDF work everywhere.
2. Personal-entry app: Prepare AI → choose a sample card (e.g. `data/eval/explore/explore-01.png` or
   `data/eval/explore2/explore2-03.png`) → Extract on this device → use or correct the candidates → tick every
   field → Create PDF → Save PDF.
3. Also try: switch tabs (the page locks), End session (values cleared), turn the network off (extraction and the
   PDF still work).
4. Public app: Explain fields → "In the cloud"; turn the network off and press again → "On this device (automatic
   fallback)" when the on-device model is available. "Analyze in the cloud" shows a field-definition candidate next
   to the adopted revision.

## Status and evidence (2026-11-22)

Deployed build on both sites: footer `92a32b4`, package `isa-930004094-r2-p2`. The hash is from before a history
rewrite on 2026-11-21 (author e-mail only); the same commit is `e1ce7b7` now (`docs/commit-map-2026-11-21.md`).

Verified on a real device (developer's Mac, Chrome 157, hosted apps):

- Build 92a32b4 (2026-11-21, `docs/device-runs/2026-11-21T02-58-25-839Z-92a32b4.json`): on-device extraction of
  three sample cards, Save PDF, End session, network-off extraction and PDF, reload and back/forward clearing, no
  request outside the personal-entry app's origin, field explanations "On this device" offline. "In the cloud"
  online was checked by hand in the developer's everyday Chrome (App Check refuses the automated browser).
- Build 92a32b4 (2026-11-22, demo video): cloud form analysis with App Check enforced, both field-explanation
  sources, and the whole personal-entry flow.
- Earlier builds (`docs/plans/day8-12.md`): hidden-tab lock by hand (4353e73, 2026-11-13) and the real-time 9/10-minute
  inactivity warning and end (b891a48, 2026-11-14, `docs/device-runs/2026-11-14T06-19-54-568Z-b891a48.json`).

Chrome does not report which model served each call; with the Gemma 4 flag enabled the runs are recorded as
"extracted with Gemma 4 requested". Hashes before 2026-11-21 in these records are pre-rewrite hashes (see the map
above).

Automated: 198 unit tests and 58 end-to-end tests (fake models; never counted as device evidence), including
canary checks over every request, WebSocket frame, console message and browser storage area of the personal-entry
app. `npm run verify` runs them with the secret, invariant and package-signature checks.

### Accuracy, judged honestly

Thresholds were frozen before each unused set of 20 fictional cards was generated; each set was judged once. Latest
run (release3, `docs/eval/release3-results.md`):

- Name 18/20 exact (bar ≥ 16) and expiry date 18/18 (bar ≥ 17): passed. Warm extraction p95 6.0 s.
- Card number: 14/18 correct and offered, **4/18 must be typed by hand (bar ≤ 3): missed**. No wrong card number was
  offered for one-click use (0/18). We kept the failing result on record instead of moving the bar.

## Limits

- One form (Form 30-2, applicant part 1), page 1, six fields. Other fields and pages are left for the user.
- On-device AI needs desktop Chrome with the built-in model; otherwise manual entry only.
- The on-device model confuses O/0 and I/1 at the card-number ends and can pick up watermark text on the sample
  cards; every value needs the user's check. On-device field explanations vary and can be wrong (reference text only).
- Signature and date are not filled; the PDF says so and asks the user to check the latest official instructions.

## Built during the submission period

Before the period only the concept and three design documents (Japanese, `docs/specs/`) existed; no application
code. Everything else — code, tests, form data, signing, deployment, evaluation, video — was built during the period:
`docs/development-history.md`.

## Repository layout

- `apps/public-app`, `apps/private-app` — the two SPAs (React 19, TypeScript, Vite, Tailwind + shadcn/ui style parts).
- `packages/domain`, `packages/contracts` — shared domain logic and contracts (Zod schemas for extraction results,
  form definitions and field explanations).
- `forms/` — approved blank original, FormDef revisions, adoption history, signed packages, trust list.
- `scripts/` — checks, signing, device check (`scripts/device/`), evaluation, demo-video tools (`scripts/video/`).
- `data/eval/` — fictional sample cards and evaluation results.
- `docs/` — specs (Japanese), plans, spikes, evaluation protocols and results, device runs, submission material.

## Development

```bash
npm ci
npm run verify   # secrets, invariants, lint, typecheck, unit tests, build, bundle checks, package, E2E (production CSP)
```

Device check on a Mac with Chrome and the on-device model (dedicated profile `~/.formtwin-device-profile`):

```bash
npm run device:check
```

## Firebase setup (development project)

- Project: `formtwin-dev` (Spark plan). Hosting targets in `.firebaserc`:
  `public` → `formtwin-dev` (https://formtwin-dev.web.app), `private` → `formtwin-dev-private`
  (https://formtwin-dev-private.web.app). To use another project, copy `.firebaserc.example`.
- Put the Web app config in `apps/<app>/.env.local` (see `.env.example`). Never commit it.

## Deploy

Requires Node 24 and the Firebase CLI (`npm install -g firebase-tools`, then `firebase login`).

private-app refuses entry unless the form package is signed. Sign it first (forms/README.md), then:

```bash
npm ci
npm run build -w @formtwin/private-app
firebase deploy --only hosting:private
```

public-app needs reCAPTCHA Enterprise + App Check registration and `apps/public-app/.env.local`
(docs/spikes/spike-b.md), then:

```bash
npm run build -w @formtwin/public-app
firebase deploy --only hosting:public
```

Design documents (Japanese): `docs/specs/`. Submission material (English): `docs/submission/`.
