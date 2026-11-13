# Spike B — public-app cloud analysis with App Check

Goal (requirements.md §6, "公開側クラウド経路"): on the hosted URL, with production App Check
(reCAPTCHA Enterprise), analyze only the approved original with `ONLY_IN_CLOUD` and show candidates;
nothing flows automatically into private-app.

Status: **implemented, fake-tested; NOT yet verified against the real service.**

## Official documentation checked (2026-11-13, firebase 13.3.0 / @firebase/ai 3.1.0 / @firebase/app-check)

- App Check, reCAPTCHA Enterprise, web (firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider):
  - Create a **score-based Web key** in Google Cloud console → Fraud Defense (reCAPTCHA Enterprise), listing
    each domain.
  - Leave "Use checkbox challenge" unchecked. Never add `localhost` to a production key.
  - Register the web app in Firebase console → Security → App Check → Apps with that key.
  - Default token TTL is 1 h.
  - Code: `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(KEY), isTokenAutoRefreshEnabled: true })`,
    before any Firebase service is used.
  - Spark plan: only the risk scores 0.1/0.3/0.7/0.9 are available; the recommended threshold is 0.5.
- AI Logic + App Check (firebase.google.com/docs/ai-logic/app-check):
  - Enforcement is required for AI Logic from 2026-11-02.
  - Replay protection uses limited-use tokens: `getAI(app, { backend, useLimitedUseAppCheckTokens: true })`
    (web ≥ 12.14.0).
  - Debug tokens must not be committed or shipped.
- Documents (firebase.google.com/docs/ai-logic/analyze-documents):
  - PDF is sent as `inlineData` with `application/pdf`.
  - The total request is ≤ 20 MB. A file may be ≤ 50 MB and ≤ 1,000 pages.
- Models (firebase.google.com/docs/ai-logic/models): `gemini-3.5-flash-lite` is listed as a general-use model.
  Gemini 2.5 Flash/Pro are rerouted from 2026-12-01.
- Structured output: `generationConfig.responseMimeType: 'application/json'` + `responseSchema`
  (`SchemaRequest`, OpenAPI subset) — from the SDK types (`ai-public.d.ts`).
- Hosts from the SDK code:
  - AI Logic: `firebasevertexai.googleapis.com`
  - App Check: `content-firebaseappcheck.googleapis.com`
  - reCAPTCHA Enterprise script: `https://www.google.com/recaptcha/enterprise.js`
- The reCAPTCHA CSP guidance pages (developers.google.com / cloud.google.com) are blocked from this container.
  The script and frame hosts in the CSP follow Google's published guidance from memory, so they are
  **to be confirmed on the hosted run** (CSP violations in the console).

## Implementation

**Data flow**
- `forms/sources/930004094.pdf`: the single approved original, now shared by both builds through the
  `?bytes` plugin. The two apps still do not import each other.
- `apps/public-app/src/catalog/approvedSources.ts`: maps the approved ID to the bundled bytes, SHA-256,
  source and licence. There is no other source.
- `apps/public-app/src/egress/gateway.ts` (`EgressGateway.analyzeApprovedForm(formId: unknown)`), the only
  route to the cloud:
  1. Rejects unknown IDs, File/URL/bytes inputs and concurrent runs.
  2. Re-hashes the bundled bytes before every request.
  3. Builds a fixed prompt (`spike-b-0`).
  4. Accepts a result only if `inferenceSource === 'in_cloud'`, the response is valid Zod
     (`formDefCandidateSchema`) and every field is on a target page.
- **Audit log:** a fixed, body-free log with the statuses planned / started / completed / failed / rejected /
  unknown. A started request that throws is logged as `unknown`, not as unsent.
- `apps/public-app/src/cloud/firebaseCloud.ts`:
  - Initializes App Check with reCAPTCHA Enterprise on the first analysis.
  - Then calls `getAI` with `useLimitedUseAppCheckTokens: true` and `ONLY_IN_CLOUD` with `gemini-3.5-flash-lite`,
    JSON MIME and the response schema.
  - There is no debug provider.

**Contract and UI**
- `packages/contracts/src/formDef.ts`: the FormDef **candidate** contract.
  - Fields: labels, kind, semantic key or null, `resolved/unsupported/ambiguous`, page, and a box normalized
    to 0–1000.
  - Control characters are rejected, and resolved fields must have a semantic key.
- UI (English):
  - Shows the approved original's ID, source, licence and hash.
  - "Analyze in the cloud" shows the result as **"Unadopted candidate"** with its `analysisRunId`.
  - Shows the request log.
  - Offers no file or URL input.

**Builds and CSP**
- E2E build (`vite --mode e2e`): `#cloud-impl` is aliased to a fake analyzer.
  `scripts/check-public-bundle.mjs` fails if the fake or dummy config reaches the production bundle, and
  checks that `only_in_cloud` and the pinned model are present.
- `deploy/public/headers.mjs` (and `firebase.json`) — the CSP adds:
  - `script-src`: `www.google.com/recaptcha/`, `www.gstatic.com/recaptcha/`
  - `frame-src`: `www.google.com/recaptcha/`, `recaptcha.google.com/recaptcha/`
  - `connect-src`: `firebasevertexai.googleapis.com`, `content-firebaseappcheck.googleapis.com`
  - These are provisional until the hosted run.

## Review view (M5, 2026-11-13)
- The approved original's page 1 is rendered with pdf.js inside public-app; the worker is bundled.
- Overlays: the adopted FormDef boxes (solid green) and the live candidate boxes (dashed amber).
- Comparison by semantic key: found at the adopted position / different position / missing / only in the
  candidate. This is layout agreement only, not proof of correctness.
- Adoption history of the adopted revision.
- "Export candidate for review": a JSON file with the formId, source hash, run ID, model, prompt version and
  candidate. It is the input to `scripts/forms/promote-forms.mjs`; see forms/README.md.
- Screenshot with the fake analyzer (not a real model output): `docs/spikes/spike-b-review-fake.png`.

## Tests (container, 2026-11-13)
- Unit: gateway rejections (unknown ID, file-like object, URL, bytes, undefined, tampered hash);
  `on_device`/missing source; broken JSON; schema violation; field off the target pages; thrown request
  logged as unknown; no bodies in the log. Contract tests for the candidate schema.
- E2E (fake analyzer): candidate shown as unadopted with a run ID and the log; no input elements on the page.
  The existing CSP smoke test (no foreign requests on load) still passes because Firebase starts only on click.

## Developer steps for the real-device check (pending)
1. Google Cloud console (project `formtwin-dev`) → Fraud Defense → reCAPTCHA Enterprise.
   - Enable the API if asked.
   - Create a key: Web, score-based, no checkbox, domains `formtwin-dev.web.app` and
     `formtwin-dev.firebaseapp.com`.
2. Firebase console → Security → App Check → Apps → web app `formtwin` → reCAPTCHA Enterprise → paste the key →
   Save. AI Logic stays **Enforced**.
3. `apps/public-app/.env.local`: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_APP_ID`, `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`. The site key is public, but the file stays out of git.
4. Build and deploy: `npm run build -w @formtwin/public-app`, then `firebase deploy --only hosting:public`.
5. Open https://formtwin-dev.web.app (TEST profile, DevTools Network with "Preserve log").
   - Click "Analyze in the cloud".
   - Record the candidate, the log, CSP errors (Console), the request hosts, and whether the AI Logic request
     carries `X-Firebase-AppCheck`.
6. Negative check: none possible from the UI (no input exists). The gateway rejections are covered by unit tests.

## Open
- Real response quality: whether the box coordinates are usable, and whether the labels are copied exactly.
- Whether limited-use tokens add noticeable latency or cost on Spark.
- Replay protection is not enforced in the console yet (optional).

## 2026-11-13 — First hosted run (developer's Mac, build 648e7d2)

**What worked**
- App Check registered: web app `formtwin`, provider Fraud Defense (reCAPTCHA Enterprise), TTL 1 h.
- AI Logic enforcement: basic enforced, replay off.
- reCAPTCHA Enterprise script and widget loaded (200).
- `exchangeRecaptchaEnterpriseToken` returned 200, so **an App Check token was obtained on the real device.**

**What failed**
- `generateContent` (`gemini-3.5-flash-lite`) returned **400 Bad Request**, shown as `request_failed`
  (logged `unknown`).
- About 9 CSP violations: reCAPTCHA fetches `https://www.google.com/recaptcha/enterprise/clr?k=…`, which is not
  in `connect-src`.

**Changes**
- `connect-src` += `https://www.google.com/recaptcha/` (observed host only).
- The public gateway now shows the SDK error text, truncated (`detail`), in the UI and log, so the 400 reason can be
  read. The public side handles only the approved blank original.
- The 400 cause is open until the response body is read.

## 2026-11-13 — Second hosted run (build 554401e) and diagnostics

**Second run**
- No CSP violations remained; the reCAPTCHA `clr` fetch returned 200.
- The AI Logic request carried `X-Firebase-AppCheck`.
- `generateContent` still returned 400 with the body `Request contains an invalid argument.` and no field named.
- SDK code check: 13.3.0 strips the client-side Part `type` before sending (`stripPartType`), so the Part shape is
  not the cause.

**Diagnostics added (public-app only)**
- "Run diagnostics" sends the approved original and fixed prompt once per fixed output variant, which identifies
  the failing variant:
  - `none`: no output config
  - `json`: JSON MIME only
  - `schema-s1`: enums only
  - `schema-s2`: + nullable
  - `schema-s3`: + minItems/maxItems
  - `schema-full`: + minimum/maximum/propertyOrdering, the current production schema
- Each row shows: whether the request failed, whether the answer was a valid candidate, the field count, the time,
  and the error detail.
- No response body is kept, and variants are chosen by name only; no caller-supplied schema is accepted.

## 2026-11-13 — Diagnostics result (build 011f7cb) and fix

| Variant | Outcome | Valid candidate | Fields | ms |
|---|---|---|---|---|
| none | ok | no (own shape `document`/`pages`) | — | 8,901 |
| json | ok | no (array instead of object) | — | 8,961 |
| schema-s1 (enums only) | ok | no (semanticKey outside the enum, because there is no `nullable`) | — | 6,271 |
| **schema-s2 (+ nullable)** | **ok** | **yes** | **20** | **5,819** |
| schema-s3 (+ array minItems/maxItems) | 400 invalid argument | — | — | 3,577 |
| schema-full (+ minimum/maximum/propertyOrdering) | 400 invalid argument | — | — | 2,482 |

**Findings**
- First successful hosted cloud analysis: `schema-s2`, with App Check (reCAPTCHA Enterprise) and `ONLY_IN_CLOUD`,
  returned a valid 20-field candidate.
- Cause of the 400: array `minItems`/`maxItems` in `responseSchema` are rejected by `gemini-3.5-flash-lite` through
  AI Logic (measured). `minimum`/`maximum`/`propertyOrdering` were not isolated, so they are not used either.

**Fix**
- `formDefCandidateResponseSchema` now has the s2 shape: types, enums, `nullable` and `required`.
- Counts, ranges and box order stay enforced by Zod on every response.
- Prompt version `spike-b-1`.

## 2026-11-13 — Hosted production run: verified (build e338cff)

**Run**
- "Analyze in the cloud" with App Check (reCAPTCHA Enterprise, AI Logic enforcement on), `ONLY_IN_CLOUD`,
  `gemini-3.5-flash-lite`, prompt `spike-b-1`.
- `generateContent` returned 200 in 9.40 s, with no console errors.

**Candidate**
- 20 fields, all on page 1, validated by Zod. Three are resolved, with the expected keys:
  - 氏名 → `fullName`
  - 在留期間の満了日 → `periodOfStayExpiry`
  - 在留カード番号 → `residenceCardNumber`
- The other 17 are `unsupported`, which is correct because they are outside the MVP keys.

**Review overlay**
- The candidate boxes land roughly on the right lines.
- Comparison with adopted rev 1:
  - `fullName` is at the adopted position.
  - `residenceCardNumber` and `periodOfStayExpiry` are at a different position. The candidate uses one box for
    the whole date and the card-number box is offset.
  - These are for human review; the candidate is not adopted.

**Status:** the Day 1–2 gate row "公開側クラウド経路" is **verified on a real device**.

