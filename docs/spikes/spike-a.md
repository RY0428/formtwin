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

## Open questions

1. CSP for the image path: keep `'none'` (image extraction impossible) or allow `data:` only in
   `connect-src` (no network origin). Requires updating all three spec documents.
2. Evidence that the on-device model is Gemini Nano 4. Observed labels: `nano_v3` (ready, serves `prompt_api`) and
   `gemma4` (not installed, `prompt_api_gemma4` pending). Need an official mapping and, if needed, a way to
   make `prompt_api` use the right model.
3. Whether the multimodal flag (`#prompt-api-multimodal-input`) is still needed in the current Chrome stable.
4. Heartbeat IndexedDB write (measured): accept as non-personal SDK metadata and document, or find a
   supported way to avoid it. Decision pending.
5. Real-device run (A-3): see `spike-a-device-runbook.md`.
