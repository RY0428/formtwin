# Gate run (real device) — docs/eval/protocol.md §6

Do not change code, prompts or thresholds between steps. Wi-Fi on. Chrome profile without extensions ("TEST").

## 0. Prepare
`git pull` → `npm ci` → `npm run build -w @formtwin/private-app` → `firebase deploy --only hosting:private`.

## A. Open
Open https://formtwin-dev-private.web.app in the TEST profile. DevTools (Cmd+Opt+I) → Network → tick "Preserve log".

## B. Page-first-run timing (3 times, not scored for accuracy)
1. Reload (Cmd+R). 2. Prepare AI → wait for `ready`. 3. Choose `data/eval/explore/explore-01.png`
(in the file dialog: Cmd+Shift+G and type the folder path). 4. Extract on this device → wait for the result.
5. Note "Extract time". Repeat 1–5 three times.

## C. Warm-up (not recorded)
Without reloading, extract `explore-01.png` once more.

## D. Gate (scored)
Without reloading, for `data/eval/gate/gate-01.png` … `gate-12.png` in order: choose → Extract → wait →
one screenshot showing "3. Candidates" and "Extract time" (zoom out if needed). Over 30 s → note "timeout".
Do not reload. Do not press candidate buttons.

## E. Correction time (after D, same page; extractions here are not scored)
For gate-01, gate-02, gate-03: choose → Extract → apply candidates → compare with the image and fix →
check all six → note "Confirm time" → (gate-01 only: Create PDF → Save PDF) → End session and clear data →
type the same card by hand → check all six → note "Manual entry time" → End session and clear data.

## F. Send
B: three times. D: twelve screenshots. E: six times. gate-01 PDF.
They are transcribed into `data/eval/results/gate-<date>-mac.json` and scored with
`node scripts/eval/score.mjs data/eval/gate/manifest.json <results>`.
