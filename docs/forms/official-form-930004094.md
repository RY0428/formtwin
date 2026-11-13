# Official form candidate: 在留期間更新許可申請書 (930004094.pdf)

Status: **approved for bundling (2026-11-12).** Unmodified copy at `forms/sources/930004094.pdf`.

## Source (recorded 2026-11-12)
- Page: https://www.moj.go.jp/isa/applications/procedures/16-3-1.html
- PDF: https://www.moj.go.jp/isa/content/930004094.pdf — downloaded by the developer on 2026-11-12
- Target statuses (form type "N"): 研究, 技術・人文知識・国際業務, 技能, 特定活動（研究活動等）, 介護,
  特定活動（本邦大学卒業者）; also 高度専門職 for change of status only.
- SHA-256 of the developer's copy: `f4a84e52db12074d9e007d0228fc8116c9f522dd6d4ad3dde920c6ee2bbecab3` (306,403 bytes)
- The dev container cannot fetch www.moj.go.jp (CloudFront 403), so the hash comes from the uploaded copy only.
- Form identification printed on page 1: **「別記第三十号の二様式（第二十一条関係）」** (Annexed Form No. 30-2, Article 21).
  No revision date found in the PDF text or metadata (Info dictionary empty; XMP stream empty).
- Redistribution terms (read by the developer on 2026-11-12, screenshots):
  - https://www.moj.go.jp/isa/copyright/index.html — site content is protected by copyright; use it under
    「出入国在留管理庁ホームページのコンテンツの利用について」.
  - https://www.moj.go.jp/isa/copyright/index2.html — content without a rights notice is under
    **公共データ利用規約（第1.0版）(PDL1.0)**. Site-specific rules:
    - 1.1 Attribution required, e.g. 「出典：出入国在留管理庁ホームページ（当該ページのURL）」. If edited/processed,
      state that separately, and do not present edited information as if published by the government.
    - 1.2 Respect third-party rights.
    - 1.4 Not covered: symbols/logos/character designs, and the contents listed in the **別紙** (other rules apply).
  - https://www.moj.go.jp/isa/copyright/additional.html (別紙) lists only the 「富士山・桜」header image.
    Application forms are not excluded ⇒ **the blank form may be copied and redistributed under PDL1.0 with
    attribution.** The PDF itself carries no separate rights notice.
  - Obligations for FormTwin:
    - Attribution in `THIRD_PARTY_NOTICES.md`, README and the app's about/credits screen.
    - A filled PDF is processed content: the app must not present it as issued or checked by the government, and
      should state that values were entered by the user with FormTwin (UI work; requirements.md §3 Must 6/12).

## Approval checks (architecture.md §8.1)
- Catalog keys: Metadata (empty XMP), OpenAction (GoTo page 1 /FitH), Outlines, PageLayout, PageMode, Pages,
  Version, ViewerPreferences. No AcroForm, no Names/EmbeddedFiles (no attachments), no JavaScript, no AA actions.
- One `%%EOF` (no incremental-update history). No annotations on any page. Info dictionary empty.
- Not checked yet: hidden or white text, optional content layers.

## Structure (pdfinfo / pypdf / pdffonts)
- PDF 1.6, 7 pages, all A4 portrait 595.276 × 841.89 pt, MediaBox = CropBox, rotation 0.
- **No AcroForm, no XFA**, not encrypted, no JavaScript, no annotations. OpenAction = GoTo page 1 (/FitH) only.
  ⇒ Filling uses coordinate drawing (`coordinateText` in the layout), not form fields.
- Fonts embedded as subsets: MS Gothic / MS Mincho (CID TrueType, Identity-H, with ToUnicode), Arial, Arial Narrow.
  ⇒ pdf.js should render without external CMaps (to be confirmed in the viewer under the private CSP).

## Pages
1. 申請人等作成用 1 (applicant, part 1) — common page. Contains the MVP target fields.
2. Guide: which part-2/organization pages to use per purpose ("no need to submit").
3. 申請人等作成用 2 N (applicant, part 2, type N): employer etc.
4. 所属機関等作成用 1 N (organization, part 1).
5. 所属機関等作成用 2 N (organization, part 2).
6. 別紙 業種一覧 (business types, not submitted).
7. 別紙 職種一覧 (occupations, not submitted).

## MVP target fields on page 1 — FormDef `forms/defs/isa-930004094/rev-1.formdef.json` (was the Spike C layout JSON)

Measured 2026-11-12 from `pdftotext -bbox` word positions, then checked visually (pdf.js render,
`docs/spikes/spike-c/official-p1.png`): values sit on the underline, inside each slot.

- familyName x140 y617 w150; givenName x300 y617 w240
- expiryYear x178 y453 w32; expiryMonth x244 y453 w20; expiryDay x291 y453 w20
- residenceCardNumber x150 y429 w150
- All 11 pt BIZ UDGothic, page 0, PDF points, bottom-left origin. Output with the full font ≈ 3.4 MB.

Field notes:
- 3 氏名 Name — **split into Family name / Given name.** The card shows one Roman-letter string, so the split is
  ambiguous and must be confirmed by the person (no automatic split).
- 11 在留期間の満了日 Date of expiration — **separate 年 / 月 / 日 slots.** Needs a reviewed conversion rule from the
  extracted date (original notation kept; ISO normalization).
- 12 在留カード番号 Residence card number — single line.
- Candidates for later (also printed on the card): 1 国籍・地域, 2 生年月日 (年/月/日), 4 性別 (choice 男・女),
  11 現に有する在留資格 / 在留期間, 8 住居地.
