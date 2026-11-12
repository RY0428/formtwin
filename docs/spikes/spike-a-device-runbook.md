# Spike A — real-device runbook (A-3)

Goal: show, on a supported desktop Chrome, that private-app extracts fields from a **fictional** residence
card image through Firebase AI Logic `ONLY_ON_DEVICE` under the production CSP, with App Check not
initialized and no page-initiated network connection, and that it keeps working offline after preparation.

## 0. Prerequisites

- Desktop Chrome 139+ (record exact version from `chrome://version`).
- Hardware (Chrome docs): ≥22 GB free on the profile volume; GPU >4 GB VRAM, or CPU ≥16 GB RAM and ≥4 cores.
- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Enabled, restart (Firebase hybrid guide).
- Firebase project with a registered Web app. Put `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_APP_ID` in `apps/private-app/.env.local` (never commit).
- Fictional sample images only.

## 1. Local, production CSP

```bash
npm ci
npm run build -w @formtwin/private-app
npm run preview -w @formtwin/private-app
```

Open http://localhost:4174 with DevTools open (Network: "Preserve log"; Console).

1. Record "Browser AI availability".
2. `chrome://on-device-internals`: screenshot model name/version/state. (How to evidence "Gemini Nano 4" is open.)
3. Click **Prepare AI**; record the progress, final status and "Prepare time".
4. Choose a fictional image → **Extract on this device**; record values vs. ground truth and "Extract time".
5. Network panel: list every request (expected: page assets from localhost only). Console: any CSP violations.
6. Application → Storage: list IndexedDB / Local / Session storage / Cache entries.
7. Turn the network off (OS level), choose another image, extract again on the same screen. Record the result.
8. Optional: `chrome://net-export` during steps 3–7 for browser-level traffic (model download is browser-managed).

## 2. Hosted URL

Deploy `apps/private-app/dist` to the private Hosting site (`firebase deploy --only hosting:private`)
and repeat steps 1–7 on the public URL.

## 3. Record

Append to `spike-a.md` under "Measured": date, Chrome version, OS/hardware, SDK version, model info,
availability values, timings, per-field results, observed requests, storage, offline result, problems.
