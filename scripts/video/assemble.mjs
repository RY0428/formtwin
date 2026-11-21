#!/usr/bin/env node
// Assembles the demo video from stills, recorded clips and narration, and writes English subtitles.
//
//   node scripts/video/assemble.mjs [--out ~/formtwin-video] [--tts say|tone] [--placeholders] [--check]
//
// Inputs (under --out, outside the repository):
//   stills/shot01.png, shot02.png, shot10.png         scripts/video/make-stills.mjs
//   raw/shot05.mp4 … shot09.mp4 + .json                scripts/video/record-private.mjs
//   manual.json                                        shots 3–4 recorded by hand, e.g.
//     { "shot03": { "file": "raw/shot03.mov", "ranges": [[2.0, 11.5], [38.0, 45.0]], "crop": [0, 74, 2880, 1620] } }
//     ranges = kept parts in seconds; a join between two ranges is a shortened wait and gets the caption.
//     crop (optional) = x, y, w, h in source pixels (e.g. to drop the macOS menu bar; keep 16:9).
// Narration: macOS `say` (synthetic voice, FORMTWIN_VOICE, default Samantha, FORMTWIN_RATE wpm, default 165),
// one file per sentence so subtitles match the voice exactly. `--tts tone` is a stand-in for tests only.
// `--placeholders` draws a grey card for any missing clip (drafts only; never upload such a cut).
// Output: out/formtwin-demo.mp4 (1920×1080, 30 fps, H.264 + AAC, faststart), out/formtwin-demo.en.srt,
// out/timeline.json; with --check also out/check/ (frames per shot and per caption, Whisper transcript, report).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const OUT = resolve(arg('--out', join(homedir(), 'formtwin-video')));
const TTS = arg('--tts', 'say');
const PLACEHOLDERS = process.argv.includes('--placeholders');
const CHECK = process.argv.includes('--check');
const CFG = JSON.parse(readFileSync('scripts/video/shots.json', 'utf8'));
const MANUAL = existsSync(join(OUT, 'manual.json')) ? JSON.parse(readFileSync(join(OUT, 'manual.json'), 'utf8')) : {};
const { width: W, height: H, fps: FPS, maxSeconds } = CFG.target;
const WORK = join(OUT, 'work');
const FINAL = join(OUT, 'out');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(FINAL, { recursive: true });

const LEAD = 0.4; // narration starts this long after the shot starts
const GAP = 0.35; // between sentences
const TAIL = 0.6; // after the last sentence of a shot
const SHORTENED_S = 3; // how long the "Edited: waiting time shortened" caption stays after a join
const log = (m) => console.log(`[assemble] ${m}`);
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

const FONT =
  process.env.FORMTWIN_FONT ??
  ['/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(existsSync);
if (!FONT) throw new Error('no font for captions: set FORMTWIN_FONT to a .ttf file');

// ---------- narration ----------
function speak(text, file) {
  if (TTS === 'say') {
    const aiff = file.replace(/\.wav$/, '.aiff');
    execFileSync('say', ['-v', process.env.FORMTWIN_VOICE ?? 'Samantha', '-r', process.env.FORMTWIN_RATE ?? '165', '-o', aiff, text]);
    ff(['-i', aiff, '-ar', '48000', '-ac', '1', file]);
  } else if (TTS === 'tone') {
    const seconds = text.split(/\s+/).length / 2.6; // about 155 words per minute
    ff(['-f', 'lavfi', '-i', `sine=frequency=330:sample_rate=48000:duration=${seconds.toFixed(2)}`, '-af', 'volume=0.2', '-ac', '1', file]);
  } else {
    throw new Error(`unknown --tts ${TTS}`);
  }
  return probe(file);
}

// ---------- sources ----------
/** Kept ranges and extra data for a clip source; null if it is missing. */
function clipSource(shot) {
  const name = `shot${String(shot.id).padStart(2, '0')}`;
  if (shot.source.type === 'recorded') {
    const file = join(OUT, `${shot.source.file}.mp4`);
    const metaFile = join(OUT, `${shot.source.file}.json`);
    if (!existsSync(file) || !existsSync(metaFile)) return null;
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    // Keep everything except the marked waits.
    const ranges = [];
    let at = 0;
    for (const [a, b] of meta.waits) {
      if (a > at) ranges.push([at, a]);
      at = b;
    }
    ranges.push([at, meta.duration]);
    return { file, ranges, crop: null, captions: meta.captions ?? [], zoom: meta.zoom ?? null };
  }
  const m = MANUAL[shot.source.key ?? name];
  if (!m || !existsSync(join(OUT, m.file))) return null;
  const file = join(OUT, m.file);
  return { file, ranges: m.ranges ?? [[0, probe(file)]], crop: m.crop ?? null, captions: m.captions ?? [], zoom: m.zoom ?? null };
}

/** Maps a time in the source clip to the time in the edited shot (null if it falls in a cut). */
function mapTime(ranges, t) {
  let out = 0;
  for (const [a, b] of ranges) {
    if (t < a) return out;
    if (t <= b) return out + (t - a);
    out += b - a;
  }
  return out;
}

// ---------- drawing ----------
let textN = 0;
function drawtext(text, from, to, style) {
  const file = join(WORK, `text${textN++}.txt`);
  writeFileSync(file, text);
  const pos =
    style === 'top'
      ? 'x=48:y=40:fontsize=34:boxborderw=14'
      : style === 'topright'
        ? 'x=w-text_w-48:y=40:fontsize=34:boxborderw=14'
        : 'x=(w-text_w)/2:y=h-text_h-70:fontsize=40:boxborderw=18';
  return `drawtext=fontfile='${FONT}':textfile='${file}':fontcolor=white:box=1:boxcolor=black@0.62:${pos}:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'`;
}

function buildShot(shot, idx) {
  const name = `shot${String(shot.id).padStart(2, '0')}`;
  // Narration: one file per sentence.
  const sentences = [];
  let t = LEAD;
  shot.narration.forEach((text, i) => {
    const wav = join(WORK, `${name}-s${i}.wav`);
    const d = speak(text, wav);
    sentences.push({ text, wav, start: t, duration: d });
    t += d + GAP;
  });
  const narrationEnd = t - GAP + TAIL;
  const plannedLen = shot.planned[1] - shot.planned[0];

  const inputs = [];
  let vchain;
  let duration;
  const overlays = [];
  let base = 'v0';
  const src =shot.source.type === 'still' ? null : clipSource(shot);
  const notes = [];
  if (shot.source.type === 'still' || src === null) {
    let still = join(OUT, shot.source.file ?? '');
    if (shot.source.type !== 'still') {
      if (!PLACEHOLDERS) throw new Error(`${name}: clip missing (see manual.json / record-private.mjs), or run with --placeholders for a draft`);
      notes.push('PLACEHOLDER');
      still = join(WORK, `${name}-placeholder.png`);
      ff(['-f', 'lavfi', '-i', `color=c=0x334155:s=${W}x${H}:d=1`, '-frames:v', '1',
        '-vf', drawtext(`Shot ${shot.id}: clip pending`, 0, 1e6, 'bottom').replace('y=h-text_h-70', 'y=(h-text_h)/2'), still]);
    } else if (!existsSync(still)) {
      throw new Error(`${name}: ${still} missing (run make-stills.mjs)`);
    }
    duration = Math.max(plannedLen, narrationEnd);
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', duration.toFixed(3), '-i', still);
    vchain = `[0:v]scale=${W}:${H},setsar=1,format=yuv420p[v0]`;
  } else {
    inputs.push('-i', src.file);
    const kept = src.ranges.reduce((n, [a, b]) => n + (b - a), 0);
    duration = Math.max(kept, narrationEnd);
    if (kept > plannedLen + 5) notes.push(`clip ${kept.toFixed(1)} s is longer than planned ${plannedLen} s`);
    const crop = src.crop ? `crop=${src.crop.join(':')},` : '';
    const parts = src.ranges.map(([a, b], i) => `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[p${i}]`);
    const cat = `${src.ranges.map((_, i) => `[p${i}]`).join('')}concat=n=${src.ranges.length}:v=1:a=0[cat]`;
    vchain = `${parts.join(';')};${cat};[cat]${crop}fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=${duration.toFixed(3)},trim=duration=${duration.toFixed(3)}[v0]`;
    // Zoom (editing): crop the rectangle and show it full frame for the given time.
    if (src.zoom) {
      const [x, y, w, h] = src.zoom.rect;
      const a = mapTime(src.ranges, src.zoom.from);
      const b = mapTime(src.ranges, src.zoom.to);
      vchain += `;[v0]split[za][zb];[zb]crop=${w}:${h}:${x}:${y},scale=${W}:${H}[zc];[za][zc]overlay=enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'[vz]`;
      base = 'vz';
      overlays.push({ text: 'Zoomed in (editing)', from: a, to: b, style: 'topright' });
    }
    // Shortened waits: caption from each join.
    let acc = 0;
    src.ranges.forEach(([a, b], i) => {
      acc += b - a;
      if (i < src.ranges.length - 1) overlays.push({ text: CFG.shortenedCaption, from: acc, to: Math.min(acc + SHORTENED_S, duration), style: 'top' });
    });
    for (const c of src.captions) {
      overlays.push({ text: c.text, from: mapTime(src.ranges, c.from), to: c.to === null ? duration : mapTime(src.ranges, c.to), style: 'bottom' });
    }
  }
  for (const c of shot.captions) overlays.push({ text: c.text, from: c.from ?? 0, to: c.to ?? duration, style: 'bottom' });

  // Bottom captions in sequence: a later one replaces an earlier one.
  const bottoms = overlays.filter((o) => o.text && o.style === 'bottom').sort((p, q) => p.from - q.from);
  bottoms.forEach((o, i) => {
    if (i + 1 < bottoms.length) o.to = Math.min(o.to, bottoms[i + 1].from);
  });
  const texts = overlays.filter((o) => o.text).map((o) => drawtext(o.text, o.from, o.to, o.style));
  const vfinal = texts.length ? `;[${base}]${texts.join(',')}[v]` : `;[${base}]null[v]`;

  // Audio: sentences placed at their start times.
  const aIn = sentences.map((s) => ['-i', s.wav]).flat();
  const aParts = sentences.map((s, i) => `[${i + 1}:a]adelay=${Math.round(s.start * 1000)}:all=1[a${i}]`);
  const amix = `${sentences.map((_, i) => `[a${i}]`).join('')}amix=inputs=${sentences.length}:normalize=0,apad,atrim=duration=${duration.toFixed(3)},aresample=48000[a]`;
  const file = join(WORK, `${name}.mp4`);
  ff([...inputs, ...aIn, '-filter_complex', `${vchain}${vfinal};${aParts.join(';')};${amix}`, '-map', '[v]', '-map', '[a]',
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', duration.toFixed(3), file]);
  log(`${name}: ${duration.toFixed(1)} s${notes.length ? ` (${notes.join('; ')})` : ''}`);
  return { id: shot.id, file, duration: probe(file), sentences, overlays: overlays.filter((o) => o.text), notes, index: idx };
}

// ---------- subtitles ----------
const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
/** Wraps words into lines of at most `max` characters. */
function wrap(words, max) {
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && `${line} ${w}`.length > max) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}
/** Two lines at most, as even as possible (≤ 42 characters each). */
function balanced(words) {
  const len = words.join(' ').length;
  if (len <= 42) return words.join(' ');
  for (let max = Math.ceil(len / 2); max <= 42; max += 1) {
    const lines = wrap(words, max);
    if (lines.length <= 2) return lines.join('\n');
  }
  return wrap(words, 42).join('\n');
}
/** Splits a sentence into cues of at most two lines of 42 characters, preferring breaks after punctuation. */
function chunks(text) {
  const words = text.split(/\s+/);
  const k = Math.ceil(wrap(words, 42).length / 2);
  const ends = []; // character position after each word
  words.reduce((n, w, i) => (ends[i] = n + w.length + (i ? 1 : 0)), 0);
  const cuts = [];
  for (let c = 1; c < k; c += 1) {
    const target = (text.length * c) / k;
    let best = -1;
    let score = Infinity;
    words.forEach((w, i) => {
      if (i >= words.length - 1 || (cuts.length && i <= cuts.at(-1))) return;
      const sc = Math.abs(ends[i] - target) - (/[,.;:—]$/.test(w) || words[i + 1] === '—' ? 14 : 0);
      if (sc < score) [best, score] = [i, sc];
    });
    cuts.push(best);
  }
  const out = [];
  let from = 0;
  for (const cut of [...cuts, words.length - 1]) {
    out.push(balanced(words.slice(from, cut + 1)));
    from = cut + 1;
  }
  return out;
}

// ---------- main ----------
const built = CFG.shots.map((s, i) => buildShot(s, i));
const total = built.reduce((n, b) => n + b.duration, 0);
const list = join(WORK, 'shots.ffconcat');
writeFileSync(list, `ffconcat version 1.0\n${built.map((b) => `file '${b.file}'`).join('\n')}\n`);
const joined = join(WORK, 'joined.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
const out = join(FINAL, 'formtwin-demo.mp4');
ff(['-i', joined, '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);

let at = 0;
let n = 1;
const srt = [];
const timeline = [];
for (const b of built) {
  for (const s of b.sentences) {
    const parts = chunks(s.text);
    const totalChars = parts.reduce((k, p) => k + p.length, 0);
    let t0 = at + s.start;
    for (const p of parts) {
      const d = (s.duration * p.length) / totalChars;
      srt.push(`${n++}\n${srtTime(t0)} --> ${srtTime(t0 + d)}\n${p}\n`);
      t0 += d;
    }
  }
  timeline.push({ shot: b.id, start: Math.round(at * 100) / 100, duration: Math.round(b.duration * 100) / 100, notes: b.notes,
    captions: b.overlays.map((o) => ({ text: o.text, from: Math.round((at + o.from) * 100) / 100, to: Math.round((at + o.to) * 100) / 100 })) });
  at += b.duration;
}
const srtFile = join(FINAL, 'formtwin-demo.en.srt');
writeFileSync(srtFile, srt.join('\n'));
const finalDuration = probe(out);
writeFileSync(join(FINAL, 'timeline.json'), `${JSON.stringify({ tts: TTS, voice: TTS === 'say' ? process.env.FORMTWIN_VOICE ?? 'Samantha' : 'test tone', duration: finalDuration, shots: timeline }, null, 2)}\n`);
log(`${out}: ${finalDuration.toFixed(1)} s (sum of shots ${total.toFixed(1)} s, limit ${maxSeconds} s)`);
log(srtFile);
if (finalDuration > maxSeconds) {
  log(`TOO LONG by ${(finalDuration - maxSeconds).toFixed(1)} s: shorten clips (manual.json ranges) or pauses`);
  process.exitCode = 1;
}
if (built.some((b) => b.notes.includes('PLACEHOLDER'))) log('DRAFT: contains placeholders; do not upload');

// ---------- checks ----------
if (CHECK) {
  const dir = join(FINAL, 'check');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frame = (t, label) => ff(['-ss', t.toFixed(2), '-i', out, '-frames:v', '1', join(dir, `${label}.png`)]);
  for (const s of timeline) {
    frame(s.start + s.duration / 2, `shot${String(s.shot).padStart(2, '0')}-mid`);
    s.captions.forEach((c, i) => frame(Math.min(c.from + 0.5, c.to - 0.05), `shot${String(s.shot).padStart(2, '0')}-caption${i}`));
  }
  const report = { duration: finalDuration, limit: maxSeconds, framesDir: dir };
  let whisper = null;
  try {
    execFileSync('which', ['whisper'], { stdio: 'ignore' });
    whisper = 'whisper';
  } catch {
    report.whisper = 'not installed: compare narration by listening';
  }
  if (whisper && TTS !== 'tone') {
    execFileSync(whisper, [out, '--model', process.env.FORMTWIN_WHISPER_MODEL ?? 'small', '--language', 'en', '--output_format', 'txt', '--output_dir', dir], { stdio: 'inherit' });
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
    const heard = norm(readFileSync(join(dir, 'formtwin-demo.txt'), 'utf8'));
    const script = norm(CFG.shots.flatMap((s) => s.narration).join(' '));
    // Word-level edit distance (simple word error rate against the script).
    const dp = Array.from({ length: script.length + 1 }, (_, i) => [i, ...Array(heard.length).fill(0)]);
    for (let j = 1; j <= heard.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= script.length; i += 1)
      for (let j = 1; j <= heard.length; j += 1)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (script[i - 1] === heard[j - 1] ? 0 : 1));
    report.whisper = { model: process.env.FORMTWIN_WHISPER_MODEL ?? 'small', scriptWords: script.length, heardWords: heard.length, wordErrorRate: Math.round((dp[script.length][heard.length] / script.length) * 1000) / 1000 };
  }
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  log(`check: ${dir} ${JSON.stringify(report.whisper)}`);
}
