# Evaluation data

All images here are **synthetic test cards** made by `scripts/generate-sample-cards.py`: plain layouts with a
"SAMPLE / NOT A REAL DOCUMENT" watermark and fictional values. They do not reproduce any real document's design.

- `explore/` — exploration set for tuning prompts, crops and thresholds (requirements.md §6). Never reuse these
  images, or variants of the same source card, for the gate or release judgement sets.
- `explore2/` — exploration set 2 (5 cards, confusable letters at the card-number ends) for prompt `spike-a-2`.
  Exploration only; never used for judgement.
- `gate/` — gate judgement set (12 cards incl. 2 with a blank field), generated after the protocol freeze
  (`fe793c2`). Judge once; never use for tuning.
- `results/` — recorded extraction runs (`score.mjs` input).
- `release/` — release judgement set (20 cards incl. 4 with a blank field), generated after the release protocol
  freeze (`bd4745b`, `docs/eval/release-protocol.md`). Judged once (FAIL on card number); never reuse.
- `release2/` — release re-evaluation set (20 cards, same mix), generated after `docs/eval/release2-protocol.md`
  was frozen (`ab68491`). Judged once (FAIL on availability); never reuse.
- `release3/` — release re-evaluation set 2 (20 cards, same mix), generated after `docs/eval/release3-protocol.md`
  was frozen (`d79d4dd`). Judge once; never use for tuning.

Regenerate (font used on 2026-11-12: WenQuanYi Zen Hei from the dev container):

```bash
python3 -I scripts/generate-sample-cards.py /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc data/eval/explore explore
python3 -I scripts/generate-sample-cards.py /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc data/eval/gate gate
python3 -I scripts/generate-sample-cards.py /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc data/eval/release release
python3 -I scripts/generate-sample-cards.py /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc data/eval/release2 release2
python3 -I scripts/generate-sample-cards.py /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc data/eval/release3 release3
```
