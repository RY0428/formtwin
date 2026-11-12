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
A decision is needed (spec change); see the open question below.

## Open questions

1. CSP for the image path: keep `'none'` (image extraction impossible) or allow `data:` only in
   `connect-src` (no network origin). Requires updating all three spec documents.
2. Evidence that the on-device model is Gemini Nano 4.
3. Whether the multimodal flag is still needed in the current Chrome stable for web pages.
4. Heartbeat IndexedDB write: confirm on device and decide how to treat it (not personal data).
