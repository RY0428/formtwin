# Evaluation data

All images here are **synthetic test cards** made by `scripts/generate-sample-cards.py`: plain layouts with a
"SAMPLE / NOT A REAL DOCUMENT" watermark and fictional values. They do not reproduce any real document's design.

- `explore/` — exploration set for tuning prompts, crops and thresholds (requirements.md §6). Never reuse these
  images, or variants of the same source card, for the gate or release judgement sets.
- Gate and release sets are created separately, after thresholds are frozen.

Regenerate (font used on 2026-11-12: WenQuanYi Zen Hei from the dev container):

```bash
python3 -I scripts/generate-sample-cards.py /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc data/eval/explore
```
