# Demo video — script and shot list (draft 2026-11-21)

Target length **2:45** (limit 3:00, R06). English narration (synthetic voice, macOS `say`, decided 2026-11-21) with
English subtitles. Fictional data only. Production tools and record: `docs/submission/video-production.md`.
No guarantee wording (CLAUDE.md rule 9). Everything shown must come from the same submitted build (requirements
§10: cloud candidate, adopted revision, on-device extraction, user correction, PDF save).

Recording setup: developer's Mac, Chrome with the on-device model already installed (say so on screen),
1920×1080, browser zoom 110–125 %, a clean Chrome profile without personal bookmarks or extensions.
Sample: `data/eval/explore/explore-01.png` (fictional card). Narration ≈ 380 words (≈ 140 wpm).

Caption rule: when a wait is shortened by editing, show **"Edited: waiting time shortened"** on screen.

---

## 0:00–0:30 — Who, what, how (first 30 seconds)

**Shot 1 (0:00–0:10)** — title card over the official form (page 1, blank).
Caption: *FormTwin — fill official forms with on-device AI*
> Every visa renewal, foreign residents in Japan copy their residence card into a Japanese paper form.
> Those values are personal data — they shouldn't have to leave the device.

**Shot 2 (0:10–0:30)** — simple diagram: two apps, three AI features, one SDK.
- Public blank form → cloud only (App Check)
- Field explanations → cloud first, automatic on-device fallback
- Residence card → on-device only, no cloud fallback
> FormTwin uses Firebase AI Logic and places each inference by how sensitive the data is.
> Public forms are analysed in the cloud. Personal data is read only by the on-device model in Chrome.

## 0:30–1:05 — Public app: cloud analysis and review

**Shot 3 (0:30–0:45)** — formtwin-dev.web.app: run the cloud analysis of the approved blank form; candidate
fields appear as dashed amber boxes over the PDF; the adopted revision as solid green boxes.
Caption (if cut): *Edited: waiting time shortened*
> On the public side, Gemini in the cloud proposes field definitions for the official form.
> A person reviews them. Only the adopted revision is signed and bundled into the personal-entry app.

**Shot 4 (0:45–1:05)** — "Explain fields": badge **In the cloud**. Turn the network off (show the macOS
Wi-Fi menu), press again: badge **On this device (automatic fallback)**.
> Field explanations use hybrid inference: cloud first, and when the network is gone,
> Firebase AI Logic falls back to the model on this device automatically.

## 1:05–2:10 — Private app: on-device extraction, check, PDF

**Shot 5 (1:05–1:15)** — formtwin-dev-private.web.app with the network **still off**. Footer: package
`isa-930004094-r2-p2`, signed. Caption: *Network off (Chrome offline mode) · model already downloaded*
(recorded with `scripts/video/record-private.mjs`; the page is loaded online first, then Chrome's offline mode)
> The personal-entry app is a separate site. Its security policy blocks network connections from the page,
> and it starts only after checking the signed form package.

**Shot 6 (1:15–1:35)** — Prepare AI → ready. Choose the fictional sample card → "Extract on this device".
Candidates appear with the warning about similar characters (O/0, I/1).
> The card is read on this device. The results are only candidates — FormTwin asks you to compare every
> character with your card.

**Shot 7 (1:35–1:55)** — Use the candidates; correct one value by hand (e.g. retype the card number);
tick "Checked against my card" for each field.
> If a card number does not look right, FormTwin will not offer it with one click — you type it.
> Only values you checked are written to the form.

**Shot 8 (1:55–2:10)** — Create PDF → preview; zoom on the card number (0 with a dot, O without);
Save PDF; show the printing guidance (sign by hand). The zoom is done in editing (caption *Zoomed in (editing)*).
> FormTwin fills the official PDF, with a font that tells O and 0 apart. You save it, print it and sign it by hand.

## 2:10–2:30 — Ending the session

**Shot 9 (2:10–2:30)** — End session and clear data → fields empty; reload → nothing restored.
Caption before the reload: *Network back on for the reload* (a reload needs the network).
> Data lives in memory only. Ending the session, ten minutes of inactivity, or leaving the page clears it.

## 2:30–2:45 — Honest results and close

**Shot 10 (2:30–2:45)** — card with numbers from `docs/eval/release*-results.md`.
- Name and expiry date: passed our frozen thresholds on unused fictional cards
- Card number: about 4 in 18 must be typed by hand; no wrong number was offered for one-click use
Caption: *Fictional data only · not legal advice*
> We froze our thresholds before testing and kept the result that missed them. On-device AI helps;
> you stay in control of every value. FormTwin.

---

## Checklist before recording
- [ ] Build on both sites = submission commit (footer `build …`); package `isa-930004094-r2-p2`.
- [ ] Field explanations answer "In the cloud" in this Chrome (App Check can refuse automated browsers; record by hand).
- [ ] No real names, e-mail, bookmarks, notifications or other tabs visible; Do Not Disturb on.
- [ ] Numbers in shot 10 match the results files.
- [ ] Every shortened wait has the caption; total ≤ 3:00 (check the uploaded file length).
- [ ] Upload to YouTube (public or unlisted), English subtitles; put the URL in `devpost-draft.md`.
