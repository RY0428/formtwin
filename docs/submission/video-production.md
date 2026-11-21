# Demo video — production note

Script: `docs/submission/video-script.md`. Handoff: `docs/submission/video-handoff.md`.
Tools: `scripts/video/` (single source `shots.json`). Working files stay outside the repository in `~/formtwin-video/`.

Status (2026-11-21): tools written and dry-run in a cloud container (stand-in model, test tone instead of a voice,
placeholders for shots 3–4). **Nothing below is recorded yet on the developer's Mac.** Fill in the "Record" section
after the real run.

## Decisions (2026-11-21)
- Voice: synthetic, macOS `say` (default voice Samantha, 165 wpm), one file per sentence so the subtitles follow the
  voice exactly. To be stated in the Devpost text or the video description as a synthetic voice.
- Shots 1, 2, 10: stills rendered from HTML (`make-stills.mjs`). Shot 10 numbers: `docs/eval/release3-results.md`.
- Shots 5–9: recorded by `record-private.mjs` (real Chrome, dedicated profile, hosted app, Chrome DevTools screencast
  at 1920×1080 = viewport 1536×864 × 1.25, i.e. the 125 % zoom of the script).
- Shots 3–4: recorded by hand (App Check can refuse an automated browser), with Wi-Fi off shown on screen.
- Presentation aids that are not app behaviour, disclosed here: a drawn cursor dot in shots 5–9 (the screencast has no
  cursor), scrolling, and in shot 8 a close-up of the **saved PDF** (rasterised at 10 px per point, caption "Saved PDF,
  zoomed in (editing)"): the on-screen preview is too coarse to show the dotted zero.
- Sample card: `data/eval/explore2/explore2-03.png` (number `IB88015500OZ`, has both 0 and O; exploration set, fictional),
  chosen by the developer 2026-11-21 instead of explore-01 (no O or 0 in its number).
- Network off in shots 5–9 is Chrome's offline mode (`context.setOffline`); the caption says so. The page is loaded
  online first; the network is turned back on for the reload in shot 9 (caption "Network back on for the reload"),
  because a reload needs the network.
- Waits: in recorded shots, a wait longer than 1.6 s keeps its first 1.2 s and last 0.4 s; the cut gets the caption
  "Edited: waiting time shortened" (3 s). For shots 3–4 every join between two kept ranges in `manual.json` gets it.
- Footer build: the deployed build shows `92a32b4` — a commit hash from before the 2026-11-21 history rewrite; the same
  commit is `e1ce7b7` now (`docs/commit-map-2026-11-21.md`). Package `isa-930004094-r2-p2`.

## Steps on the Mac
Prerequisites: `npm ci` done, Node 24, ffmpeg (Homebrew), the dedicated Chrome profile with the model installed
(`npm run device:check` once if unsure), Do Not Disturb on. Optional: `brew install poppler` (otherwise `sips` is used),
`whisper` on PATH for the narration check.

```bash
npm run video:stills
```

```bash
npm run video:record
```

Shots 3–4 by hand (everyday Chrome, Cmd+Shift+5, one clip each): save as `~/formtwin-video/raw/shot03.mov` and
`shot04.mov`, then list the parts to keep in `~/formtwin-video/manual.json`:

```json
{
  "shot03": { "file": "raw/shot03.mov", "ranges": [[1.0, 9.0], [31.0, 38.0]], "crop": [0, 0, 2880, 1620] },
  "shot04": { "file": "raw/shot04.mov", "ranges": [[0.5, 12.0], [20.0, 29.0]] }
}
```

`crop` is optional (x, y, w, h in source pixels, 16:9). A draft without shots 3–4: add `--placeholders` (never upload).

```bash
npm run video:assemble -- --check
```

Output: `~/formtwin-video/out/formtwin-demo.mp4`, `formtwin-demo.en.srt`, `timeline.json`, and `check/` (a frame per
shot and per caption, Whisper transcript and word error rate against the script). Inspect every frame in `check/`
(build id, no personal data, captions present, text readable) and watch the whole video once before uploading.

## Dry run in the cloud container (2026-11-21, not device evidence)
- `record-private.mjs` with `FORMTWIN_VIDEO_DRY=1` (stand-in model, headless Chromium 153, hosted app Build 92a32b4):
  shots 5–9 recorded; the stand-in answer had an invalid card number, the app showed the warning and the script typed
  it; End session and reload left the fields empty.
- `assemble.mjs --tts tone --placeholders --check`: 159.1 s, 1920×1080, 30 fps, H.264 + AAC 48 kHz stereo,
  −16.0 LUFS integrated, `moov` before `mdat` (faststart). Caption frames inspected (offline mode, shortened wait,
  zoom, reload, shot 10). Real narration length is known only after `say` on the Mac.

## Mac run 1 (2026-11-21, shots 5–9 and stills; this session driving the developer's Mac)
- Stills via `sips`. Recording: hosted Build 92a32b4, package r2-p2, Chrome 157.0.8103.79, dedicated profile, model
  available. One wait cut (shot 6). End session and reload left the fields empty.
- The model read the name with watermark text (`TANDON MEERALE 見本`, flagged: non-Latin letters) and the number with O
  read as 0 (`IB880155000Z`, flagged as not looking right, not offered); the given name and the number were typed by
  hand from the manifest. Saved PDF checked at high resolution: zeros dotted, O plain.

## Record (fill in after the real run)
- Date, Chrome version, build shown (both apps), package:
- Card used and what the model returned (from `raw/recording.json`; typed by hand):
- Shortened waits (shot, from `timeline.json`):
- Voice: synthetic (macOS `say`, voice …) / own
- Final duration (ffprobe) and Whisper word error rate:
- YouTube URL (public or unlisted), subtitles uploaded:
