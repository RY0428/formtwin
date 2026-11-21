# Third-party notices

FormTwin's own source code is licensed under Apache-2.0 (`LICENSE`, `NOTICE`). The material below keeps its own terms.

## Fonts

### BIZ UDGothic Regular
- File: `apps/private-app/assets/fonts/BIZUDGothic-Regular.ttf`
- Copyright 2022 The BIZ UDGothic Project Authors (https://github.com/googlefonts/morisawa-biz-ud-gothic)
- License: SIL Open Font License 1.1 — full text in `apps/private-app/assets/fonts/OFL.txt`
- Source: https://github.com/google/fonts, commit `c30b221beb0c1da59d563feb91ec8656a1fa972a`, path
  `ofl/bizudgothic/BIZUDGothic-Regular.ttf` (retrieved 2026-11-12)
- SHA-256: `709fcd41e3209fb765da750472f55ccdf925653e9fa7e1eb007cb65c8f749c75`
- Embedded unmodified in generated PDFs.

### IBM Plex Mono Regular
- File: `apps/private-app/assets/fonts/IBMPlexMono-Regular.ttf`
- Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"
- License: SIL Open Font License 1.1 — full text in `apps/private-app/assets/fonts/OFL-IBMPlexMono.txt`
- Source: https://github.com/google/fonts, branch `main`, path `ofl/ibmplexmono/IBMPlexMono-Regular.ttf`
  (retrieved 2026-11-21)
- SHA-256: `6a3412f058c7d8dfd9170c41e85ade48e5156ecb89356110ca57a0a27734af46`
- Embedded unmodified in generated PDFs for values in Latin letters and digits (distinguishable O and 0).

## Official forms

### 在留期間更新許可申請書（別記第三十号の二様式）
- File: `forms/sources/930004094.pdf` (unmodified)
- 出典：出入国在留管理庁ホームページ（https://www.moj.go.jp/isa/applications/procedures/16-3-1.html）
  PDF: https://www.moj.go.jp/isa/content/930004094.pdf, retrieved 2026-11-12
- License: 公共データ利用規約（第1.0版）(PDL1.0), per https://www.moj.go.jp/isa/copyright/index2.html
- SHA-256: `f4a84e52db12074d9e007d0228fc8116c9f522dd6d4ad3dde920c6ee2bbecab3`
- PDFs filled in with FormTwin are content processed by the user; they are not issued or checked by the
  Immigration Services Agency of Japan.

`apps/private-app/assets/forms/dummy-form.pdf` is a dummy created by this project
(`scripts/spike-c/make-dummy-form.mjs`), not an official form.
