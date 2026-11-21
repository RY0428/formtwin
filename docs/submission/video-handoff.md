# Handoff: make the demo video (for a new Claude Code session on the developer's Mac)

Goal: produce the Devpost demo video (≤ 3:00, English) and its English subtitles, following
`docs/submission/video-script.md`. Read CLAUDE.md, the script, `docs/plans/video-notes.md`,
`docs/eval/release*-results.md` and `docs/submission/devpost-draft.md` first.

## Rules (in addition to CLAUDE.md)
- Real app behaviour only, the same deployed build in every shot (footer `build …`; package `isa-930004094-r2-p2`).
- Fictional data only (`data/eval/explore/explore-01.png`). No real names, e-mail, bookmarks, notifications,
  other tabs or local paths on screen.
- Every wait shortened by editing gets the on-screen caption `Edited: waiting time shortened`.
- No guarantee wording (rule 9). Do not present the Firebase engineer's Q&A remark as an official contest answer.
- Video files stay outside the repository: work in `~/formtwin-video/` (raw clips, stills, audio, output).
  Commit only scripts or docs that are worth keeping (e.g. a recording script, the final SRT, a production note).
- Do not deploy and do not change the apps while making the video (the video must match the submitted build).
  If the app needs a fix, stop and report.

## Tools on the Mac
Homebrew, ffmpeg, Python, Whisper (openai-whisper), Demucs (not needed unless BGM is used),
Node 24 + Playwright from the repo (`npm ci` already done), Google Chrome with the on-device model installed in the
dedicated profile `~/.formtwin-device-profile` (see `scripts/device/device-check.mjs` for how it is launched).

## Suggested split
- **Claude (automated):**
  - stills for shots 1, 2 and 10 (1920×1080, Pillow or ffmpeg);
  - private-app shots 5–9 recorded with Playwright (`recordVideo`, real Chrome, dedicated profile, network off via
    `context.setOffline`), slowed down enough to read (`slowMo`, pauses);
  - editing with ffmpeg (trim, concatenate, captions, loudnorm), English SRT, final checks.
- **Developer (by hand):**
  - shots 3–4 on the public app in the everyday Chrome (App Check can refuse automated browsers), including turning
    Wi-Fi off on screen (macOS screen recording, Cmd+Shift+5);
  - narration (own voice) — or approve macOS `say` as a synthetic voice;
  - YouTube upload (public or unlisted) and English subtitles upload.

## Output
- `~/formtwin-video/out/formtwin-demo.mp4`: 1920×1080, 30 fps, H.264 + AAC, `-movflags +faststart`, ≤ 2:55.
- `~/formtwin-video/out/formtwin-demo.en.srt`.
- Checks before handing over: `ffprobe` duration; frames exported at each shot and inspected (build id, no personal
  data, captions present, text readable); narration compared with the script via Whisper.
- Record in `docs/submission/video-production.md`: build/commit shown, which waits were shortened, voice
  (own / synthetic), duration. Add the YouTube URL to `devpost-draft.md` when the developer gives it.

Work step by step; show the plan first and ask before anything the developer must do by hand.
