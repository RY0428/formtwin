# Devpost submission — draft (English)

Status: draft 2026-11-21. Fields follow the Devpost form order. Items marked **[developer]** need your decision or
confirmation. Video URL and some numbers are filled in after recording and the last checks.

---

## 1. Project overview

**Project name** (≤ 60)
> FormTwin — fill official forms with on-device AI

**Elevator pitch** (≤ 200)
> Fill Japan's residence-extension form from a photo of your residence card. Personal data is read only by
> on-device AI; public blank forms are analysed in the cloud — Firebase AI Logic hybrid.

**Thumbnail** (3:2, ≤ 5 MB) **[developer]** — screenshot of the private app with the PDF preview (fictional values).

---

## 2. Project details

### About the project (Markdown)

```markdown
## Inspiration
Foreign residents in Japan fill in official paper forms in Japanese for every visa renewal. Copying values from a
residence card is tedious and error-prone, but those values are exactly the kind of personal data that should not
be uploaded anywhere. We wanted AI help that never needs to send the card to a server.

## What it does
FormTwin fills the Application for Extension of Period of Stay (Form 30-2, applicant part 1) with fictional sample
data in this demo:
1. Pick a photo of a residence card (fictional sample cards are included).
2. **On-device AI** (Firebase AI Logic, `ONLY_ON_DEVICE`) reads the name, card number and expiry date. The values
   appear as *candidates* only.
3. The user compares every value with the card and ticks it. Only checked values are written.
4. FormTwin fills the official PDF and shows a preview; the user saves and prints it, then signs by hand.

Manual entry works without AI, and the personal-entry page keeps working with the network off.

## How we built it — hybrid by data sensitivity
FormTwin is two separate web apps (separate origins and builds) that use Firebase AI Logic in three ways:

| Feature | Data | Inference mode |
|---|---|---|
| Read the residence card | personal | `ONLY_ON_DEVICE` (Gemini Nano in Chrome) — no cloud fallback by design |
| Analyse the blank official form | public | `ONLY_IN_CLOUD` (gemini-3.5-flash-lite) with App Check |
| Explain each form field in plain English | public | `PREFER_IN_CLOUD` — cloud first, **automatic on-device fallback** when offline or rate-limited |

- **Personal-entry app** (`formtwin-dev-private.web.app`): Content-Security-Policy `connect-src data:` — the page
  cannot open network connections; no App Check, analytics or storage; data lives in memory only and is cleared
  on End session, after 10 minutes of inactivity, or when a page is restored from the back/forward cache.
- **Public app** (`formtwin-dev.web.app`): cloud analysis of an approved blank form produces a field-definition
  candidate. A human reviews it; the adopted revision is signed (ES256) and bundled into the personal-entry app,
  which verifies the signature and a trust list at start-up.
- React 19, TypeScript, Vite, pdf-lib + fontkit (BIZ UDGothic embedded), pdf.js preview, Zod, Playwright, Vitest.

## Challenges
- **Keeping personal data on the device.** With @firebase/ai 3.1.0 an `ONLY_ON_DEVICE` model sends to the cloud if
  Chrome's `LanguageModel` global is missing, so we guard it ourselves and enforce `connect-src data:`. Automated
  tests search every request, WebSocket frame, console message and browser storage area for fictional canary values.
- **Honest accuracy.** We froze thresholds *before* generating unused fictional test cards and judged each set once.
  Name 17–18/20 and expiry 18/18 passed. The card number did not reach our availability bar: the model reads the
  letters O/I/Q at the ends as digits. We made format-breaking numbers impossible to adopt with one click — across
  54 numbers in three runs, **no wrong number was offered**; about 4 in 18 must be typed by hand. We kept the
  failing result on record instead of moving the bar.
- **Response schemas:** array `minItems`/`maxItems` made the cloud request fail (400); limits are enforced with Zod.

## Accomplishments
- Hybrid inference chosen per feature by data sensitivity, verified on a real device: field explanations answer
  "In the cloud" online and "On this device (automatic fallback)" with the network off.
- 190+ unit tests and 58 end-to-end tests (fake models; never counted as device evidence), plus automated checks on
  the deployed apps and a one-command device check on a real Chrome with the on-device model.

## What we learned
On-device AI is a strong fit for personal data, but it needs product design around it: candidates instead of
answers, per-field confirmation, and clear limits.

## What's next
More forms and fields, a support-worker mode, and re-evaluation as Chrome's built-in models improve.
```

### Built with (tags, ≤ 25)
firebase, firebase-ai-logic, gemini-nano, gemini, chrome-built-in-ai, app-check, recaptcha-enterprise,
firebase-hosting, react, typescript, vite, tailwindcss, pdf-lib, pdf.js, zod, playwright, vitest, node.js

### "Try it out" links
- https://formtwin-dev-private.web.app (personal-entry app; fictional data only)
- https://formtwin-dev.web.app (public form analysis and field explanations)
- https://github.com/RY0428/formtwin **[developer: must be public before submitting]**

### Image gallery (≤ 15, 3:2) **[developer]**
Suggested (fictional values only): start screen, AI candidates with the warning, checked fields, PDF preview with
the printing guidance, lock screen, field explanations "In the cloud" and "On this device".

### Demo video URL **[developer]**
YouTube (public or unlisted), ≤ 3 minutes, English or English subtitles. Script: `docs/submission/video-script.md` (to do).

---

## 3. Additional info (for judges)

- **Submitter type:** Individual **[developer]**
- **Country of residence:** Japan **[developer]**
- **Organization name (if applicable):** N/A **[developer]**
- **Start date (MM-DD-YY):** 11-12-26
- **New or existed before Nov 11, 2026:** choose the option that says it existed in a limited form — **[developer:
  check the exact choices]**. Explanation:
  > Before the submission period only the product concept and three design documents (Japanese) existed. No
  > application code existed. All code, tests, form data, signing and deployment were built during the period;
  > see docs/development-history.md in the repository, which separates the two.
- **Platform(s):** Web (Chrome)
- **How the project meets the main technology requirement:**
  > All AI inference goes through the Firebase AI Logic Web SDK (firebase 13.3.0 / @firebase/ai 3.1.0). On-device:
  > the personal-entry app uses `InferenceMode.ONLY_ON_DEVICE` with Chrome's built-in model (Gemini Nano; with the
  > "Gemma 4 for built-in AI" flag enabled as advised in the hackathon Discord) to read a residence card image.
  > Cloud: the public app uses `ONLY_IN_CLOUD` (gemini-3.5-flash-lite) with App Check (reCAPTCHA Enterprise,
  > enforced) to analyse an approved blank form. Hybrid fallback: the public field explanations use
  > `PREFER_IN_CLOUD`, so Firebase AI Logic answers on the device when the cloud request fails; the UI shows the
  > `inferenceSource`. Personal data is never sent to the cloud, following the Firebase team's guidance that
  > sensitive features may run on-device only while others run hybrid or in the cloud.
- **Working demo URL:** https://formtwin-dev-private.web.app
- **Testing instructions:**
  > Use desktop Chrome. No login or credentials. Use fictional data only.
  > 1. (On-device AI, optional) In chrome://flags enable "Prompt API Multimodal Input" and "Gemma 4 for built-in
  >    AI", relaunch. The first "Prepare AI" can download the model (about 20+ minutes); without it, use
  >    "Continue without AI" — manual entry and the PDF work everywhere.
  > 2. Private app: Prepare AI → choose a sample card from the repository (data/eval/explore/explore-01.png) →
  >    Extract on this device → compare and use candidates → tick every field → Create PDF → Save PDF.
  > 3. Try: switch tabs (the page locks), End session (values cleared), turn the network off (extraction still works).
  > 4. Public app: Explain fields → "In the cloud"; turn the network off and press again → "On this device
  >    (automatic fallback)" when the on-device model is available. Analyze in the cloud shows a field-definition
  >    candidate next to the adopted revision.
- **Open-source license URL:** https://github.com/RY0428/formtwin/blob/main/LICENSE **[developer: choose the license]**
- **Eligibility checkboxes (age, jurisdiction, not an employee of the promoters):** **[developer confirms]**

## 4. Submit
- Terms checkbox **[developer]**. The submission can be edited until the deadline.
