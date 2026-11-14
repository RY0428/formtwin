"""Generate SYNTHETIC sample cards for the exploration set (data/eval/explore).

These are deliberately plain test images, not replicas of any real document:
no official design, emblem, photo, hologram or security features, and every
image carries a large "SAMPLE / NOT A REAL DOCUMENT" watermark. All values are
fictional. Use only for tuning prompts/cropping (requirements.md §6).

Usage: python3 scripts/generate-sample-cards.py <font-path> <out-dir> [explore|explore2|gate|release|release2|release3]
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

# Exploration set 2 (2026-11-14): card numbers with confusable letters at the letter positions, for checking
# prompt spike-a-2 BEFORE the release3 protocol is frozen. Exploration only: never used for judgement.
SETS["explore2"] = [
    ("explore2-01", {"fullName": "OLIVEIRA RAFAEL", "residenceCardNumber": "OI30581027QO", "periodOfStayExpiry": "2028-06-11"},
     {"scale": 1.0, "rotate": 0, "brightness": 1.0, "contrast": 1.0}),
    ("explore2-02", {"fullName": "NOWAK EWA", "residenceCardNumber": "QS10500811IO", "periodOfStayExpiry": "2027-02-17"},
     {"scale": 0.8, "rotate": 0, "brightness": 1.0, "contrast": 1.0}),
    ("explore2-03", {"fullName": "TANDON MEERA", "residenceCardNumber": "IB88015500OZ", "periodOfStayExpiry": "2029-09-30"},
     {"scale": 1.0, "rotate": 4, "brightness": 1.0, "contrast": 1.0}),
    ("explore2-04", {"fullName": "KOWALSKI PIOTR", "residenceCardNumber": "ZO05108150SI", "periodOfStayExpiry": "2026-12-05"},
     {"scale": 1.0, "rotate": 0, "brightness": 0.6, "contrast": 0.8}),
    ("explore2-05", {"fullName": "ODUYA BISI", "residenceCardNumber": None, "periodOfStayExpiry": "2028-10-01"},
     {"scale": 1.0, "rotate": 0, "brightness": 1.0, "contrast": 1.0}),
]

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


# Release set: generated AFTER the release protocol freeze (docs/eval/release-protocol.md, bd4745b).
# Mix: standard 6, small 3, tilted 3, dark 3, tilted+dark 1, blank 4 (expiry 2, number 2). Values are new
# (none shared with explore/gate). Diacritic-prone names printed WITHOUT diacritics; numbers with
# confusable characters (O/0, I/1, S/5, B/8, Q, Z/2).
DARK = {"brightness": 0.6, "contrast": 0.8}
SETS["release"] = [
    ("release-01", {"fullName": "FERREIRA JOSE LUIS", "residenceCardNumber": "QO10080520IS", "periodOfStayExpiry": "2028-02-29"}, BASE),
    ("release-02", {"fullName": "HASSAN AMINA", "residenceCardNumber": "BZ58201137SO", "periodOfStayExpiry": "2027-07-07"}, BASE),
    ("release-03", {"fullName": "DUBOIS FRANCOIS", "residenceCardNumber": "KM40719263PL", "periodOfStayExpiry": "2029-12-31"}, BASE),
    ("release-04", {"fullName": "PHAM DUC ANH", "residenceCardNumber": "IS15081150OB", "periodOfStayExpiry": "2026-12-15"}, BASE),
    ("release-05", {"fullName": "RODRIGUEZ LOPEZ CARMEN", "residenceCardNumber": "TR63905182WN", "periodOfStayExpiry": "2028-09-01"}, BASE),
    ("release-06", {"fullName": "ADEYEMI TUNDE", "residenceCardNumber": "XC27460391DV", "periodOfStayExpiry": "2027-04-18"}, BASE),
    ("release-07", {"fullName": "ALVES JOAO MIGUEL", "residenceCardNumber": "SB80500188ZQ", "periodOfStayExpiry": "2029-01-23"}, {**BASE, "scale": 0.8}),
    ("release-08", {"fullName": "CHEN YUTING", "residenceCardNumber": "FJ31862047HK", "periodOfStayExpiry": "2027-11-11"}, {**BASE, "scale": 0.8}),
    ("release-09", {"fullName": "SCHRODER LENA", "residenceCardNumber": "OQ21005015IZ", "periodOfStayExpiry": "2028-05-05"}, {**BASE, "scale": 0.8}),
    ("release-10", {"fullName": "BANDA GRACE", "residenceCardNumber": "LU94837261RC", "periodOfStayExpiry": "2026-11-29"}, {**BASE, "rotate": 4}),
    ("release-11", {"fullName": "NUNEZ MARIA JOSE", "residenceCardNumber": "DW73019485MA", "periodOfStayExpiry": "2027-08-08"}, {**BASE, "rotate": -4}),
    ("release-12", {"fullName": "PARK SEOYEON", "residenceCardNumber": "ZI85558115BS", "periodOfStayExpiry": "2028-10-20"}, {**BASE, "rotate": 4}),
    ("release-13", {"fullName": "GONCALVES ANA RITA", "residenceCardNumber": "NH62731908TE", "periodOfStayExpiry": "2029-02-14"}, {**BASE, **DARK}),
    ("release-14", {"fullName": "KHAN IMRAN ALI", "residenceCardNumber": "PG50973841YJ", "periodOfStayExpiry": "2027-01-31"}, {**BASE, **DARK}),
    ("release-15", {"fullName": "SATO YUI", "residenceCardNumber": "WA19284756CU", "periodOfStayExpiry": "2028-06-30"}, {**BASE, **DARK}),
    ("release-16", {"fullName": "MENDOZA REYES DIEGO", "residenceCardNumber": "VE36085127XM", "periodOfStayExpiry": "2027-09-19"}, {**BASE, "rotate": -4, **DARK}),
    ("release-17", {"fullName": "OKONKWO ADA", "residenceCardNumber": "RY47152936KF", "periodOfStayExpiry": None}, BASE),
    ("release-18", {"fullName": "LAURENT CLAIRE", "residenceCardNumber": "UK80264195LD", "periodOfStayExpiry": None}, BASE),
    ("release-19", {"fullName": "RAHMAN NUSRAT", "residenceCardNumber": None, "periodOfStayExpiry": "2028-03-12"}, BASE),
    ("release-20", {"fullName": "MORI HARUTO", "residenceCardNumber": None, "periodOfStayExpiry": "2029-07-25"}, BASE),
]
# Release re-evaluation set: generated AFTER docs/eval/release2-protocol.md was frozen (ab68491).
# Same mix and watermark as the first release set; all values new (none shared with explore/gate/release).
SETS["release2"] = [
    ("release2-01", {"fullName": "ARAUJO JOAO VICTOR", "residenceCardNumber": "OS20850913QB", "periodOfStayExpiry": "2028-08-16"}, BASE),
    ("release2-02", {"fullName": "MWANGI WANJIRU", "residenceCardNumber": "HT47381926NP", "periodOfStayExpiry": "2027-03-03"}, BASE),
    ("release2-03", {"fullName": "LEFEVRE HELENE", "residenceCardNumber": "BI15008051ZO", "periodOfStayExpiry": "2029-10-10"}, BASE),
    ("release2-04", {"fullName": "VU THI LAN", "residenceCardNumber": "CK62940375RW", "periodOfStayExpiry": "2026-12-28"}, BASE),
    ("release2-05", {"fullName": "SANCHEZ MORENO JULIA", "residenceCardNumber": "ZS80115508OI", "periodOfStayExpiry": "2028-01-30"}, BASE),
    ("release2-06", {"fullName": "OSEI KWAME", "residenceCardNumber": "MF39462817TJ", "periodOfStayExpiry": "2027-06-06"}, BASE),
    ("release2-07", {"fullName": "BECKER JURGEN", "residenceCardNumber": "QB50810085SI", "periodOfStayExpiry": "2029-04-02"}, {**BASE, "scale": 0.8}),
    ("release2-08", {"fullName": "ZHANG HAORAN", "residenceCardNumber": "EN71625394GX", "periodOfStayExpiry": "2027-12-12"}, {**BASE, "scale": 0.8}),
    ("release2-09", {"fullName": "IBANEZ SOFIA", "residenceCardNumber": "IO05118850BZ", "periodOfStayExpiry": "2028-11-03"}, {**BASE, "scale": 0.8}),
    ("release2-10", {"fullName": "MOYO TENDAI", "residenceCardNumber": "PA83920471KL", "periodOfStayExpiry": "2026-11-28"}, {**BASE, "rotate": 4}),
    ("release2-11", {"fullName": "CONCEICAO PAULO", "residenceCardNumber": "RV29473815DC", "periodOfStayExpiry": "2027-05-15"}, {**BASE, "rotate": -4}),
    ("release2-12", {"fullName": "LEE JIHOON", "residenceCardNumber": "SZ58108501QO", "periodOfStayExpiry": "2028-02-22"}, {**BASE, "rotate": 4}),
    ("release2-13", {"fullName": "MARTINEZ PENA ELENA", "residenceCardNumber": "TL47619283WE", "periodOfStayExpiry": "2029-06-18"}, {**BASE, **DARK}),
    ("release2-14", {"fullName": "AHMED FARIDA", "residenceCardNumber": "UG36058172YH", "periodOfStayExpiry": "2027-09-09"}, {**BASE, **DARK}),
    ("release2-15", {"fullName": "ITO SOTA", "residenceCardNumber": "VD91827364AF", "periodOfStayExpiry": "2028-04-27"}, {**BASE, **DARK}),
    ("release2-16", {"fullName": "CASTRO VEGA ANDRES", "residenceCardNumber": "WM70258139NR", "periodOfStayExpiry": "2027-10-05"}, {**BASE, "rotate": -4, **DARK}),
    ("release2-17", {"fullName": "EZE CHIOMA", "residenceCardNumber": "XJ58260413PT", "periodOfStayExpiry": None}, BASE),
    ("release2-18", {"fullName": "GIRARD AMELIE", "residenceCardNumber": "YH93017462LS", "periodOfStayExpiry": None}, BASE),
    ("release2-19", {"fullName": "HOSSAIN TANVIR", "residenceCardNumber": None, "periodOfStayExpiry": "2028-07-08"}, BASE),
    ("release2-20", {"fullName": "ONO RIKU", "residenceCardNumber": None, "periodOfStayExpiry": "2029-03-21"}, BASE),
]
# Release re-evaluation 2: generated AFTER docs/eval/release3-protocol.md was frozen (d79d4dd).
# Same mix and watermark as release/release2; all values new (none shared with any earlier set).
SETS["release3"] = [
    ("release3-01", {"fullName": "PEREIRA JOAO CARLOS", "residenceCardNumber": "OB61208839SQ", "periodOfStayExpiry": "2028-12-03"}, BASE),
    ("release3-02", {"fullName": "OTIENO BRIAN", "residenceCardNumber": "JM48275016TX", "periodOfStayExpiry": "2027-04-26"}, BASE),
    ("release3-03", {"fullName": "MERCIER CELINE", "residenceCardNumber": "SI70810502OB", "periodOfStayExpiry": "2029-08-14"}, BASE),
    ("release3-04", {"fullName": "DO VAN HUNG", "residenceCardNumber": "FN25836147LR", "periodOfStayExpiry": "2026-12-19"}, BASE),
    ("release3-05", {"fullName": "JIMENEZ RUIZ PABLO", "residenceCardNumber": "QZ15508100IS", "periodOfStayExpiry": "2028-03-31"}, BASE),
    ("release3-06", {"fullName": "BOATENG AKOSUA", "residenceCardNumber": "KP93716284VG", "periodOfStayExpiry": "2027-07-21"}, BASE),
    ("release3-07", {"fullName": "SCHAFER MAX", "residenceCardNumber": "IZ80051185BO", "periodOfStayExpiry": "2029-05-09"}, {**BASE, "scale": 0.8}),
    ("release3-08", {"fullName": "HUANG YIFAN", "residenceCardNumber": "TC62849173HW", "periodOfStayExpiry": "2027-10-02"}, {**BASE, "scale": 0.8}),
    ("release3-09", {"fullName": "MUNOZ DIAZ ISABEL", "residenceCardNumber": "OO15050811SI", "periodOfStayExpiry": "2028-09-25"}, {**BASE, "scale": 0.8}),
    ("release3-10", {"fullName": "PHIRI CHISOMO", "residenceCardNumber": "WK37482916MU", "periodOfStayExpiry": "2026-11-27"}, {**BASE, "rotate": 4}),
    ("release3-11", {"fullName": "BRANCO JOSE ANTONIO", "residenceCardNumber": "XL58192743EN", "periodOfStayExpiry": "2027-06-30"}, {**BASE, "rotate": -4}),
    ("release3-12", {"fullName": "CHOI MINSEO", "residenceCardNumber": "BS50811580ZI", "periodOfStayExpiry": "2028-01-17"}, {**BASE, "rotate": 4}),
    ("release3-13", {"fullName": "HERNANDEZ SOTO LUIS", "residenceCardNumber": "YF26473918RA", "periodOfStayExpiry": "2029-11-08"}, {**BASE, **DARK}),
    ("release3-14", {"fullName": "QURESHI SANA", "residenceCardNumber": "AD47168295PJ", "periodOfStayExpiry": "2027-02-02"}, {**BASE, **DARK}),
    ("release3-15", {"fullName": "KATO MIO", "residenceCardNumber": "CW83920157KT", "periodOfStayExpiry": "2028-08-29"}, {**BASE, **DARK}),
    ("release3-16", {"fullName": "RAMOS FLORES MATEO", "residenceCardNumber": "DH19357284XV", "periodOfStayExpiry": "2027-12-24"}, {**BASE, "rotate": -4, **DARK}),
    ("release3-17", {"fullName": "NWOSU KELECHI", "residenceCardNumber": "EP64028317NC", "periodOfStayExpiry": None}, BASE),
    ("release3-18", {"fullName": "ROUSSEL ANAIS", "residenceCardNumber": "GT70391846MY", "periodOfStayExpiry": None}, BASE),
    ("release3-19", {"fullName": "ISLAM RUMANA", "residenceCardNumber": None, "periodOfStayExpiry": "2028-05-13"}, BASE),
    ("release3-20", {"fullName": "KUDO SORA", "residenceCardNumber": None, "periodOfStayExpiry": "2029-01-06"}, BASE),
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
            "explore2": "Exploration only (confusable card-number letters, prompt spike-a-2). Never reuse for judgement.",
            "gate": "Gate judgement only, generated after the protocol freeze (fe793c2). Not for tuning.",
            "release": "Release judgement only, generated after the release protocol freeze (bd4745b). Judge once; never use for tuning.",
            "release2": "Release re-evaluation only, generated after the release2 protocol freeze (ab68491). Judge once; never use for tuning.",
            "release3": "Release re-evaluation 2 only, generated after the release3 protocol freeze (d79d4dd). Judge once; never use for tuning.",
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
