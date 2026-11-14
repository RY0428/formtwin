# Release checklist after the Day 8–12 loop

Most of what used to be manual is automated. A release check is a deploy and two commands; only a few
optional items remain manual. Fictional data only. Do not reuse the gate set (`data/eval/gate`).

## 1. Before deploying (developer's Mac)

```bash
git pull && npm ci
npm run build && npm run check:package        # current package must be "trusted"
npm run release:inventory                     # writes docs/releases/<commit>.json (commit it)
firebase deploy --only hosting:private,hosting:public
```

`release:inventory` must exit 0: clean tree, current package verified and trusted, both builds stamped with
the commit. Run it after `npm run build` on the machine that deploys (its `.env.local` shapes the build).

## 2. Automated checks after deploying

| Command | Where | Covers |
|---|---|---|
| `npm run test:hosted` | container or Mac | deployed headers and CSP; private B1–B3 (lock/resume simulated, Save PDF, End session); public/private build match; trust-list date in the footer; no CSP violation; no request outside the private origin |
| `npm run device:check` | developer's Mac (real Chrome + on-device model) | AI availability, Prepare (and Cancel while a model is downloading), extraction on 3 fictional samples with timings, Save PDF without lock, End session, ⑥ network off: extraction and PDF, ⑦ reload restores nothing, ⑧ back/forward restores nothing, private app makes no request outside its origin, public field explanations online → in the cloud and network off → on this device |
| `npm run device:check -- --inactivity` | developer's Mac, about 11 min | real-time inactivity: warning at 9 min, end and clear at 10 min |

Push the report: `git add docs/device-runs && git commit -m "Device check report" && git push`.

`npm run verify` (CI) covers the rest with fakes: failure paths, stale results, canary network/storage scans,
accessibility (axe, 200% zoom, focus), package trust states, 429 handling.

## 3. Manual items that remain (optional unless stated)

1. **Hidden-tab lock (real tab switch)** — automation keeps pages visible. Type a value, switch to another
   tab, come back: "Session locked"; Resume keeps the value. Last verified: Build 4353e73.
2. **VoiceOver spot check (optional)** — Cmd+F5, then Tab through the private app: headings are read, the
   error after a failed extraction and the inactivity warning are announced. Not a conformance claim.
3. **Print the PDF (optional)** — open the saved PDF in Preview and print to PDF/paper; values sit in their
   boxes and the Japanese text renders.
4. **Browser force-quit (optional)** — with values entered, quit Chrome (Cmd+Q) and reopen the URL: nothing is
   restored.
5. **Offline from the first click on the public page (optional)** — load the public page with the network
   already off and press Explain fields: expect an error within about 45 s (no stall). Not yet device-tested.

## 4. Coverage map (architecture.md §13)

| §13 row | Automated | Device | Remaining |
|---|---|---|---|
| Public entry | unit + E2E (gateway) | — | — |
| App separation | lint, bundle checks, headers test | test:hosted | — |
| SDK / inference | E2E (fake SDK path), invariants | device:check | Gemini Nano 4 evidence: Chrome does not name the model per call (recorded as "Gemma 4 requested") |
| Public field explanations | unit + E2E (fake) | device:check (cloud, offline fallback) | item 5 |
| Network | canary E2E, hosted foreign-request check | device:check (whole run, private pages) | outside-the-browser observation not done |
| Canary | privacy-canary E2E | — | transformed images not detectable by byte search |
| Storage | privacy-canary E2E | — | — |
| End | lifecycle E2E | device:check ⑦ ⑧, `--inactivity` | items 1, 4 |
| Injection / adversarial | contracts + extraction tests, invalid output E2E | — | Day 13–16 release evaluation on unused fictional documents |
| Semantic binding | MVP scope (one person, fixed fields) | — | — |
| Shared definition | trust/package unit tests, check:package | test:hosted footer | — |
| Confirmation / races | s5 + failure-path E2E | — | — |
| Manual-entry path | spike-a + failure-path E2E | device:check | — |
| PDF | fillPdf unit tests, preview E2E | device:check ② ⑥ | item 3 |
| UI / explanation | a11y E2E (axe, zoom, focus), keyboard E2E | — | item 2 |
| Permissions / monitoring | bundle checks, decisions (RPM 10, monitoring off) | console screenshots | — |
