# Real-device checklist after the Day 1–7 loop (developer)

Everything below is implemented and passes `npm run verify` in the container, with fake models and a throwaway
signing key. These steps produce the real-device evidence. Use fictional data only. Do not reuse the gate set
(`data/eval/gate`).

## A. Sign the form package (once; required before the next private deploy)
1. `git pull`, then `npm ci`.
2. `node scripts/forms/keygen.mjs ~/formtwin-signing-key.json`
   - Note the printed `keyId`.
   - Keep the private key outside the repository and back it up.
3. `node scripts/forms/build-package.mjs isa-930004094 1 <keyId>`
4. `FORMTWIN_SIGNING_KEY=~/formtwin-signing-key.json node scripts/forms/sign-package.mjs isa-930004094-r1`
5. `node scripts/forms/verify-package.mjs isa-930004094-r1` should print `ok`.
6. Commit `forms/keys/<keyId>.pub.json` and `forms/packages/isa-930004094-r1/`, then push.
   Never commit the private key.

## B. private-app on the hosted URL
1. `npm run build -w @formtwin/private-app`, then `firebase deploy --only hosting:private`.
2. Open https://formtwin-dev-private.web.app in the TEST profile, with DevTools Console and Network.
3. Check the start-up: Form package is `ready`, and the footer shows your `keyId` with no "TEST KEY".
4. Prepare AI, then extract `data/eval/explore/explore-03.png` (prompt `spike-a-1`).
   - Check the "Check:" / accent warnings when they apply.
5. Use the candidates, check every field, then Create PDF.
   - Confirm the **preview** is drawn.
   - Confirm the Console has no CSP errors (the pdf.js worker `.mjs` loads).
6. Edit a value: the preview and the PDF disappear.
7. End the session.
8. Send: screenshots of the page and the Console, and the Network requests (should be same-origin, `data:` or `blob:` only).

## C. public-app with App Check (Spike B)
Steps 1–5 of `docs/spikes/spike-b.md` (reCAPTCHA Enterprise key, App Check registration, `.env.local`, deploy, run).

1. Expected result: an "Unadopted candidate" table and overlays.
2. Record and send:
   - the request hosts;
   - whether the AI Logic request carries `X-Firebase-AppCheck`;
   - CSP errors;
   - the candidate quality (labels, boxes).
3. Click "Export candidate for review" and keep the JSON. It is the input for adopting a cloud candidate as revision 2.

## D. Contest questions
Record the Discord answers to Q1 and Q2 in requirements.md §9 and CLAUDE.md when they arrive.
