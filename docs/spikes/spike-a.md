# Spike A — private-app on-device extraction (`ONLY_ON_DEVICE`)

Status: **in progress.** Nothing below is a real-device result yet. Sections are marked
*documented* (official docs, date checked), *code-read* (SDK source of the pinned version), or
*measured* (with environment).

## Pinned versions

- firebase 13.3.0 → @firebase/ai 3.1.0, @firebase/app 0.16.6 (see `docs/dependency-log.md`)

## Documented (checked 2026-11-12)

Sources: [Hybrid Web get started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started),
[configuration options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options),
[structured output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output),
[Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) (page "Last updated: October 21, 2026").

- On-device inference via Firebase AI Logic: SDK v12.5.0+, Chrome on Desktop 139+.
- The Firebase guide requires enabling `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
  for multimodal (image) input. Judges' setup steps must include this unless it is no longer needed.
- On-device supports single-turn text generation, text+image input (JPEG, PNG only), structured output.
  Maximum 9216 tokens on device. Files must be inline data.
- `initializeDeviceModel()` must be called on/after a user interaction and before prompting.
  With `ONLY_ON_DEVICE`, a request made before the download finishes waits for the download.
- Structured output on device: `onDeviceParams.promptOptions.responseConstraint` (Schema helpers or plain
  JSON Schema). Cloud: `inCloudParams.generationConfig.responseMimeType` + `responseSchema`.
- `inferenceSource` values: `ON_DEVICE` / `IN_CLOUD`.
- Default cloud model since SDK 13.0.0: `gemini-3.5-flash-lite`.
- Prompt API languages: `en`, `ja`, `es`, `de`, `fr`. Set via `expectedInputs` / `expectedOutputs`.
- Prompt API hardware: Windows 10/11, macOS 13+, Linux, ChromeOS (Chromebook Plus); ≥22 GB free on the
  profile volume; GPU >4 GB VRAM or CPU with ≥16 GB RAM and ≥4 cores. Model removed if free space <10 GB.
- Model information: `chrome://on-device-internals`. Neither page names "Gemini Nano 4".
  How to evidence the model generation is **still open**.
- On the web, legacy `topK`/`temperature` and `LanguageModel.params()` are Extensions-only;
  SDK 13.0.0 removed `topK`/`temperature` from create options.
- Starting 2026-11-02, App Check enforcement is required to use Firebase AI Logic (banner on the guide).

## Code-read (@firebase/ai 3.1.0, `dist/esm/index.esm.js`)

- **Cloud fallback hazard:** `chromeAdapterFactory` creates the on-device adapter only when
  `globalThis.LanguageModel` exists. Without it, `callCloudOrDevice` receives no adapter and sends the request
  **to the cloud, even with `ONLY_ON_DEVICE`**. Mitigation in `apps/private-app/src/ondevice/FirebaseOnDeviceLLM.ts`:
  refuse to create the model or send any request without the Prompt API global (checked before every request),
  reject any result whose `inferenceSource` is not `on_device`; CSP `connect-src data:` blocks network egress
  as a further layer. Worth reporting upstream.

- `ONLY_ON_DEVICE` never calls the cloud: `generateContent` throws `AIError(UNSUPPORTED)` when the
  on-device model is unavailable, and `API_NOT_ENABLED` when `LanguageModel.availability()` is `unavailable`.
- **Image parts are converted with `fetch('data:<mime>;base64,<data>')` → `blob()` → `createImageBitmap()`.**
  See "Measured" below: this conflicts with `connect-src 'none'`.
- A new `LanguageModel` session is created for every request; the previous one is destroyed.
- The on-device path calls `session.prompt(contents, onDeviceParams.promptOptions)` and does **not** pass the
  per-request `signal`. Per-request cancellation on device is not available through the SDK; only a signal
  fixed in `promptOptions` at model creation would reach the Prompt API.
- `getAI()` goes through `_getProvider()`, which calls `heartbeatController.triggerHeartbeat()` from
  @firebase/app. The heartbeat service stores data in IndexedDB (non-PII: date and SDK user-agent string).
  To be measured.
- App Check is used only if an App Check instance is registered on the app; private-app never registers one.

## Measured

### 2026-11-12 — CSP and `data:` fetch (dev container)

Environment: Linux container, Playwright Chromium 153.0.8010.12 (no Gemini Nano). Minimal page, CSP header only.

- `connect-src 'none'`: `fetch('data:image/png;base64,…')` → `TypeError: Failed to fetch`, console
  "Connecting to 'data:…' violates …". ⇒ **the SDK's image conversion fails under the spec's CSP.**
- `connect-src data:`: the fetch is not blocked by CSP.

Consequence: image extraction through Firebase AI Logic cannot work with `connect-src 'none'`.
**Decision (developer, 2026-11-12): private-app uses `connect-src data:`** (data: URLs only, no network
origin, not even `'self'`). CLAUDE.md and the three specs were updated.

### 2026-11-12 — A-2: SDK path with a FAKE `LanguageModel` (dev container)

Environment: Linux container, Playwright Chromium 153.0.8010.12, firebase 13.3.0, production-like build
(`dist-e2e`, dummy Firebase config), production private CSP via `vite preview`. Tests: `tests/e2e/spike-a-ondevice.spec.ts`.
**These are wiring results with a fake model, not evidence of real Gemini Nano execution.**

- Prepare → `initializeDeviceModel()` (with download progress) → extract through `generateContent` succeeds;
  the fake receives `['text', image as ImageBitmap]` and a `responseConstraint`; result `inferenceSource` = `on_device`.
- No CSP violations; no request to any non-page origin; canary value absent from all observed requests
  (URL, headers, body). Scope: browser-context requests visible to Playwright.
- Invalid model output (unknown key) → `invalid_output`, no candidate shown.
- Prompt API global removed → `api_missing`, extraction disabled, no requests.
- This Chromium build exposes its own `LanguageModel` global (no model installed): handled as not ready,
  extraction disabled, no requests.
- **IndexedDB:** after preparation, `indexedDB.databases()` = `["firebase-heartbeat-database"]`, created by
  @firebase/app's heartbeat (`getAI()` → `_getProvider()` → `triggerHeartbeat()`). It holds SDK usage
  metadata, not personal data. Treatment needs a decision (rule 5 forbids personal data persistence).

### 2026-11-12 — Developer's Mac, `chrome://on-device-internals` (before running the app)

Environment: developer's MacBook (macOS), desktop Chrome (version to be recorded). Screenshots kept by the developer.

- Flag: the multimodal flag is named **"Prompt API Multimodal Input" (`#prompt-api-multimodal-input`)** in this
  Chrome, not `#prompt-api-for-gemini-nano-multimodal-input` as in the Firebase guide. Set to Enabled.
- `chrome://on-device-internals` requires "Enable internal debugging pages" on `chrome://chrome-urls` first.
- Broker State: performance class Medium; possible capabilities Image; VRAM 5461 MiB (3000 required);
  device capable; disk space sufficient (20480 MiB required to install).
- Assets / Models: `nano_v3_gpu_component` 2025.8.8.1141 **Ready** (model `nano_v3_gpu_low_tier_model`, ~4.0 GB, GPU).
  `gemma4_component` 2026.8.7.929 **Not Installed** (model `gemma4_gpu_low_tier_model`).
- Use cases: `prompt_api` = Available; `prompt_api_gemma4` = Pending Usage.
- **Implication:** the model currently serving `prompt_api` is labeled `nano_v3`. This page does not show the
  name "Gemini Nano 4". Whether the contest's "Gemini Nano 4" corresponds to `nano_v3`, to the `gemma4`
  component, or to something else is **unconfirmed**; do not claim Nano 4 until an official source maps it.

### 2026-11-12 — Chrome flags and contest wording

- Chrome **157.0.8103.79** (from `chrome://flags`).
- Flags present: `#prompt-api` (Default), `#prompt-api-multimodal-input` (Enabled),
  `#gemma4-for-built-in-ai` "Gemma 4 for Built-in AI — Enables all built-in AI APIs (Prompt, Summarizer,
  Writer, etc.) to use the Gemma 4 model" (Default), `#decisions-api`, `#on-device-model-speculative-decoding`,
  `#prompt-api-tool-use`, `#prompt-api-sampling-mode`.
- Contest wording (checked 2026-11-12): "Web (Chrome): Gemini Nano 4 via Firebase AI Logic" (overview);
  "Web (Chrome): Integrating with Gemini Nano 4 via Firebase AI Logic" (Official Rules); the rules also say
  Gemini Nano 4 can be used at no cost.
- Searched developer.chrome.com (Prompt API, built-in, get-started, debug-gemini-nano, built-in-apis):
  no page mentions "Gemini Nano 4", "Gemma 4", or `nano_v3`. **No official mapping found** between the
  contest's "Gemini Nano 4" and the Chrome model labels `nano_v3` / Gemma 4.

### 2026-11-12 — A-3 step 1: app on the developer's Mac (local, production CSP)

Environment: macOS (Intel per UA), Chrome 157.0.8103.79, Gemma 4 flag Default (Prompt API served by `nano_v3`),
firebase 13.3.0, `npm run preview -w @formtwin/private-app` (production headers) on http://localhost:4174.

- "Browser AI availability" = `available`; **Prepare AI → AI status `ready`**, prepare time 20 ms
  (model already downloaded). This is real `initializeDeviceModel()` on a device, not the fake.
- Extraction not run yet (no sample image at that point). Synthetic exploration cards added in `data/eval/explore/`.

### 2026-11-12 — A-3 step 2: first real on-device extraction (explore-01)

Same environment as step 1 (macOS Intel, Chrome 157.0.8103.79, `nano_v3`, firebase 13.3.0, local preview with
production CSP `connect-src data:`). **Real Gemini Nano execution through Firebase AI Logic `ONLY_ON_DEVICE`.**

- Image: `data/eval/explore/explore-01.png` (synthetic). Result accepted by the adapter, so
  `inferenceSource` was `on_device` and the output passed Zod validation.
- Fields (exploration only, not a gate result):
  - fullName: `TANAKA HANAKO` — exact match.
  - residenceCardNumber: `AB12345678CD` — exact match.
  - periodOfStayExpiry: `2027年03月31日` — matches the printed original notation; ground truth is stored as ISO
    `2027-03-31`. Normalization rule to be fixed before the gate (requirements.md §6: report original vs normalized).
- Timing: prepare 38 ms (model already downloaded); **extract 17,689 ms** (one run; the 10 s target is not met yet).
- DevTools Network (Keep log): only `blob:http://localhost:4174/…` (local preview image) and `data:image/png;base64…`
  (the SDK's image conversion). No request to any network origin during prepare and extraction.
- DevTools Console:
  - CSP blocked `http://localhost:4174/.well-known/appspecific/com.chrome.devtools.json` — a request made by
    DevTools itself when it is open, not by the page code. Blocked as intended by `connect-src data:`.
  - Warnings from a browser extension's `contentscript.js` (EventEmitter / ObjectMultiplex). Extensions inject into
    the page and are outside the app's guarantee (architecture.md §2.2). Evidence runs should use a profile
    without extensions.
  - Chrome's built-in AI feedback notice (LanguageModel in use).

### 2026-11-12 — A-3 step 3: explore-02 … 05 (same session, same environment)

Exploration only (not a gate result). Dates compared with the printed original notation.

- explore-02 (text scale 0.8): name ✓ `NGUYEN VAN MINH`, number ✓ `EF87654321GH`, expiry ✓ `2028年11月15日`; extract 18,260 ms
  (the page had been reloaded before this run; prepare 14 ms).
- explore-03 (rotated 4°): **name ✗ `SATOS MARIA CLARA`** (truth `SANTOS MARIA CLARA`, one letter dropped — a wrong
  candidate, not an unread field), number ✓ `JK24681357LM`, expiry ✓ `2026年12月01日`; extract 6,356 ms.
- explore-04 (dark, low contrast): name ✓, number ✓ `NP13572468QR`, expiry ✓ `2029年06月30日`; extract 5,973 ms.
- explore-05 (scale 0.9, rotated −3°, bright, low contrast): name ✓ `LI XIAOMEI`, number ✓ `ST99887766UV`,
  expiry ✓ `2027年08月20日`; extract 6,912 ms.

Totals over explore-01…05 (15 fields): 14 exact (original notation), 1 wrong candidate (name, rotated card), 0 unread.
Timing: first extraction after a page load ≈ 17.7–18.3 s; following extractions in the same page ≈ 6.0–6.9 s.
Likely a first-run (session/model warm-up) cost; to be measured separately with more runs.

Network during these runs: besides the app's own `blob:` / `data:` entries, the DevTools log shows `sprite.svg`,
`content-deepl-input-controller.css`, `react-*.css`, `deepl-ui.shadow.css`, `js.js`, `dom.js` with initiator
`content.js` — injected by a translation browser extension, not by the app. A content-script extension can read the
page, including personal data on screen; this is the boundary stated in architecture.md §2.2. Evidence runs must
use a Chrome profile without extensions.

Implications: the wrong-but-plausible name on a rotated card confirms that per-field user confirmation is required
regardless of accuracy (requirements.md §3 Must 4). The 10 s target is reachable for warm runs; the first run is not.

### 2026-11-12 — A-3 step 4: offline on the same screen

Wi-Fi turned off at the OS level (menu bar toggle off) after preparation; same page, AI status `ready`.
explore-01 → all three fields match (name, number, expiry in original notation); extract 8,528 ms.
New Network entries were only `blob:` and `data:`. **Extraction continues offline on an already-open, prepared page.**
Offline first launch / reload remains out of scope (requirements.md §3 Must 9).

### 2026-11-12 — A-3 step 5: hosted URL, Chrome profile without extensions

Deployed with `firebase deploy --only hosting:private` from the developer's Mac (build with `.env.local`).
New Chrome profile "TEST" (not signed in, no extensions); same Chrome 157.0.8103.79, same machine and model.

- Response headers of https://formtwin-dev-private.web.app/: `Content-Security-Policy` identical to
  `deploy/private/headers.mjs` (incl. `connect-src data:`), `Cache-Control: no-store`,
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, `X-Content-Type-Options: nosniff`, HSTS (Hosting default).
- Availability `available` in the new profile (the model is shared across profiles); Prepare → `ready` (40 ms).
- explore-01: all three fields match (original notation); extract 18,224 ms (first run after page load).
- Network (Keep log, whole session): the document, `index-*.js`, `favicon.ico`, the local `blob:` preview and the
  SDK's `data:` image. All same-origin or in-memory; **no other origin**. `favicon.ico` is requested by the browser
  and answered with `index.html` by the SPA rewrite (to fix: ship an icon).
- Console: only Chrome's built-in AI notice. No CSP violation, no extension output.
- App Check, Firestore, Analytics were not initialized (none present in the bundle; no requests).

**Gate row "公開環境・端末経路" (requirements.md §6):** hosted URL + production CSP + `ONLY_ON_DEVICE` through
Firebase AI Logic + App Check not initialized + no page-initiated external connection + offline continuation on the
same screen — all observed on this device. **Open:** Gemini Nano 4 evidence (organizer answer pending); the gate row
is therefore not marked passed yet.

### 2026-11-13 — Organizer answer on the model (Discord)

Devpost Discord, #hackathon-help thread "Help with model for BuildHybridAI" (another participant: Chrome 156/157,
`nano_v3_gpu_high_tier_model`, asked whether Nano 4 is specifically required). Devpost staff relayed from Firebase:
"Yes that would be fine as long as the model is being accessed via the Firebase AI Logic SDK. You may need to go to
chrome://flags and search for Gemma 4 on built-in AI and enable it." (seen by the developer, screenshot.)
⇒ On-device inference through Firebase AI Logic is the requirement; to be safe, also verify with the
`#gemma4-for-built-in-ai` flag enabled and record which model serves `prompt_api`.

### 2026-11-13 — Prompt `spike-a-1` and output normalization (after the gate)
Prompt now asks for character-by-character copying (no diacritics added, no spelling correction, no letter↔digit
swaps, JSON null for blanks). Placeholder strings are normalized to null in the adapter. Not yet run on a device.

### 2026-11-13 — `#gemma4-for-built-in-ai` enabled (developer's Mac)

Chrome 157.0.8103.79 (macOS), Performance Class Medium. Flag options are only Default / Enabled; set to Enabled
and Chrome relaunched. `chrome://version` command line contains
`--enable-features=AIApiFoundationalModel:model_version/v4,OptimizationGuideManifestBroker`, so the flag is active.
Manifest criteria all true (feature flag, enterprise policy, user setting, VRAM 5461/3000 MiB, device capable, disk).

After the hosted app's Prepare AI:
- Assets: `gemma4_component` 2026.8.7.929 **Not Installed 0%**; `nano_v3_gpu_component` 2025.8.8.1141 Ready.
- Use cases: `prompt_api` Requested, Available; `prompt_api_gemma4` not requested, Pending Usage.
- Models: `gemma4_gpu_low_tier_model` 0 MiB; `nano_v3_gpu_low_tier_model` 4,088.14 MiB (GPU).

⇒ On this device the app's Prompt API request is still served by `nano_v3`; the Gemma 4 download is not
triggered. Chrome's model-selection rule is not documented (inference, not confirmed: an installed Nano may
take precedence). Decision (developer): record and continue with Spike B; a retry on a clean Chrome channel
(no Nano installed) may be done later without touching the working setup.

## Open questions

1. CSP for the image path: keep `'none'` (image extraction impossible) or allow `data:` only in
   `connect-src` (no network origin). Requires updating all three spec documents.
2. Evidence that the on-device model is Gemini Nano 4. Observed labels: `nano_v3` (ready, serves `prompt_api`) and
   `gemma4` (not installed, `prompt_api_gemma4` pending — also with the Gemma 4 flag enabled, 2026-11-13). Organizer:
   on-device via Firebase AI Logic is acceptable. Gemma 4 run on this device: not achieved.
3. Whether the multimodal flag (`#prompt-api-multimodal-input`) is still needed in the current Chrome stable.
4. Heartbeat IndexedDB write (measured): accept as non-personal SDK metadata and document, or find a
   supported way to avoid it. Decision pending.
5. Real-device run (A-3): see `spike-a-device-runbook.md`.
