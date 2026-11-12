"""Generate SYNTHETIC sample cards for the exploration set (data/eval/explore).

These are deliberately plain test images, not replicas of any real document:
no official design, emblem, photo, hologram or security features, and every
image carries a large "SAMPLE / NOT A REAL DOCUMENT" watermark. All values are
fictional. Use only for tuning prompts/cropping (requirements.md §6).

Usage: python3 scripts/generate-sample-cards.py <font-path> <out-dir> [explore|gate]
"""

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

W, H = 1000, 630

SETS = {}
SETS["explore"] = [
    # id, ground truth, rendering conditions
    ("explore-01", {"fullName": "TANAKA HANAKO", "residenceCardNumber": "AB12345678CD", "periodOfStayExpiry": "2027-03-31"},
     {"scale": 1.0, "rotate": 0, "brightness": 1.0, "contrast": 1.0}),
    ("explore-02", {"fullName": "NGUYEN VAN MINH", "residenceCardNumber": "EF87654321GH", "periodOfStayExpiry": "2028-11-15"},
     {"scale": 0.8, "rotate": 0, "brightness": 1.0, "contrast": 1.0}),
    ("explore-03", {"fullName": "SANTOS MARIA CLARA", "residenceCardNumber": "JK24681357LM", "periodOfStayExpiry": "2026-12-01"},
     {"scale": 1.0, "rotate": 4, "brightness": 1.0, "contrast": 1.0}),
    ("explore-04", {"fullName": "SHARMA RAVI KUMAR", "residenceCardNumber": "NP13572468QR", "periodOfStayExpiry": "2029-06-30"},
     {"scale": 1.0, "rotate": 0, "brightness": 0.6, "contrast": 0.8}),
    ("explore-05", {"fullName": "LI XIAOMEI", "residenceCardNumber": "ST99887766UV", "periodOfStayExpiry": "2027-08-20"},
     {"scale": 0.9, "rotate": -3, "brightness": 1.15, "contrast": 0.7}),
]

BASE = {"scale": 1.0, "rotate": 0, "brightness": 1.0, "contrast": 1.0}

# Gate set: generated AFTER the protocol freeze (docs/eval/protocol.md). New fictional values,
# none shared with the exploration set. None = the field is blank on the card.
SETS["gate"] = [
    ("gate-01", {"fullName": "SUZUKI KENTA", "residenceCardNumber": "GA10293847BC", "periodOfStayExpiry": "2027-05-20"}, BASE),
    ("gate-02", {"fullName": "PEREZ GARCIA LUCIA", "residenceCardNumber": "GD56473829EF", "periodOfStayExpiry": "2028-01-09"}, BASE),
    ("gate-03", {"fullName": "KIM MINJUN", "residenceCardNumber": "GH11223344JK", "periodOfStayExpiry": "2026-12-24"}, BASE),
    ("gate-04", {"fullName": "OKAFOR CHINEDU EMEKA", "residenceCardNumber": "GL99001122MN", "periodOfStayExpiry": "2029-03-03"}, BASE),
    ("gate-05", {"fullName": "TRAN THI HOA", "residenceCardNumber": "GP31415926QR", "periodOfStayExpiry": "2027-10-31"}, {**BASE, "scale": 0.8}),
    ("gate-06", {"fullName": "SILVA ANA PAULA", "residenceCardNumber": "GS27182818TU", "periodOfStayExpiry": "2028-07-14"}, {**BASE, "scale": 0.8}),
    ("gate-07", {"fullName": "WANG JUNJIE", "residenceCardNumber": "GV16180339WX", "periodOfStayExpiry": "2027-02-28"}, {**BASE, "rotate": 4}),
    ("gate-08", {"fullName": "GUPTA PRIYA DEVI", "residenceCardNumber": "GY14142135ZA", "periodOfStayExpiry": "2029-09-09"}, {**BASE, "rotate": -4}),
    ("gate-09", {"fullName": "MULLER JONAS", "residenceCardNumber": "HB86753090CD", "periodOfStayExpiry": "2026-11-30"}, {**BASE, "brightness": 0.6, "contrast": 0.8}),
    ("gate-10", {"fullName": "SANTOS JOAO PEDRO", "residenceCardNumber": "HE24682468FG", "periodOfStayExpiry": "2028-04-01"}, {**BASE, "brightness": 0.6, "contrast": 0.8}),
    ("gate-11", {"fullName": "IVANOVA OLGA", "residenceCardNumber": "HH13579135JK", "periodOfStayExpiry": None}, BASE),
    ("gate-12", {"fullName": "NAKAMURA ERIKA", "residenceCardNumber": None, "periodOfStayExpiry": "2027-06-15"}, BASE),
]


def render(font_path: str, truth: dict, cond: dict) -> Image.Image:
    s = cond["scale"]
    label = ImageFont.truetype(font_path, int(22 * s))
    value = ImageFont.truetype(font_path, int(38 * s))
    title = ImageFont.truetype(font_path, int(30 * s))
    mark = ImageFont.truetype(font_path, 64)

    img = Image.new("RGB", (W, H), (250, 250, 247))
    d = ImageDraw.Draw(img)
    d.rectangle([8, 8, W - 9, H - 9], outline=(120, 120, 120), width=3)
    d.text((40, 30), "SYNTHETIC TEST CARD  合成テスト用カード", font=title, fill=(60, 60, 60))

    rows = [
        ("氏名 / NAME", truth["fullName"]),
        ("番号 / CARD NUMBER", truth["residenceCardNumber"] or ""),
        ("在留期間（満了日）/ PERIOD OF STAY (EXPIRY)",
         "" if truth["periodOfStayExpiry"] is None else truth["periodOfStayExpiry"].replace("-", "年", 1).replace("-", "月", 1) + "日"),
    ]
    y = 120
    for lab, val in rows:
        d.text((60, y), lab, font=label, fill=(90, 90, 90))
        d.text((60, y + int(32 * s)), val, font=value, fill=(20, 20, 20))
        y += int(140 * s)

    # Watermark across the whole card.
    wm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wm)
    for i, text in enumerate(["SAMPLE  見本", "NOT A REAL DOCUMENT", "FICTIONAL DATA"]):
        wd.text((150, 180 + i * 120), text, font=mark, fill=(200, 30, 30, 70))
    img = Image.alpha_composite(img.convert("RGBA"), wm.rotate(-12, center=(W // 2, H // 2))).convert("RGB")

    if cond["rotate"]:
        img = img.rotate(cond["rotate"], expand=True, fillcolor=(200, 200, 200))
    img = ImageEnhance.Brightness(img).enhance(cond["brightness"])
    img = ImageEnhance.Contrast(img).enhance(cond["contrast"])
    return img


def main() -> None:
    font_path, out_dir = sys.argv[1], Path(sys.argv[2])
    set_name = sys.argv[3] if len(sys.argv) > 3 else "explore"
    cases = SETS[set_name]
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "set": set_name,
        "purpose": {
            "explore": "Exploration only: prompt, crop and threshold tuning. Never reuse for gate or release judgement.",
            "gate": "Gate judgement only, generated after the protocol freeze (fe793c2). Not for tuning.",
        }[set_name],
        "synthetic": True,
        "generator": "scripts/generate-sample-cards.py",
        "dateFormatNote": "Ground truth uses ISO dates; the card prints YYYY年MM月DD日.",
        "cases": [],
    }
    for case_id, truth, cond in cases:
        img = render(font_path, truth, cond)
        path = out_dir / f"{case_id}.png"
        img.save(path, format="PNG", optimize=True)
        manifest["cases"].append({
            "file": path.name,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "conditions": cond,
            "groundTruth": truth,
        })
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
