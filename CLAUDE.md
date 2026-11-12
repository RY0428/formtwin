# FormTwin — Claude Code 作業ガイド

#BuildHybridAI 2026（Firebase AI Logic ハイブリッド推論ハッカソン）提出用アプリ。
提出締切: 2026-11-30 14:00 PT（JST 2026-12-01 07:00）。内部目標: 2026-11-30 18:00 JST。

## 正本ドキュメント（作業前に必ず読む）

- `docs/specs/requirements.md` — MVP範囲・受入基準・日程・大会提出条件（R01〜R10）の正本
- `docs/specs/architecture.md` — データ分離・通信境界・状態契約・検証条件
- `docs/specs/tech-stack.md` — 採用技術・配置・SDK契約・再現用成果物

仕様に関わる変更は3文書を同時に更新する。コードと仕様が食い違ったら、勝手に片方へ寄せず報告する。

## 絶対に守るルール

1. **PIIは本人記入側（`apps/private-app`）から外へ出さない。** 画像・抽出値・手入力・派生値・記入済PDF・ファイル名・ハッシュも対象。
2. **推論モードは固定。** 本人側は `InferenceMode.ONLY_ON_DEVICE`、公開側は `InferenceMode.ONLY_IN_CLOUD`。`PREFER_ON_DEVICE` / `PREFER_IN_CLOUD` は使わない。端末推論の失敗時は手入力へ。クラウドへ再試行しない。
3. **アプリの全AI推論は Firebase AI Logic Web SDK 経由。** Chrome Prompt API での直接生成、Gemini REST API、他社AI APIを使わない（Prompt API は可用性・モデル情報の確認だけ可）。端末モデルは Gemini Nano 4 を対象。
4. **本人側は通信しない設計。** CSP `connect-src data:`（data: URL だけ許可、ネットワークオリジン・`'self'` 不可。SDK が画像 Part を `fetch('data:…')` で変換するため。2026-11-12 実測・決定）。App Check・Firestore・Analytics・Remote Config・外部ロガーを初期化しない。固定PDF・フォントはビルド時にバイト列として同梱し、実行時 fetch しない。
5. **本人データは永続化しない。** IndexedDB / localStorage / sessionStorage / Cache Storage / OPFS 等に書かない。メモリのみ。
6. **公開側のクラウド送信は承認済み公開原本のIDからだけ構築する。** 任意の File / Blob / URL / string を送るAPIを作らない。
7. **秘密情報をリポジトリに入れない。** APIキーの本番値、App Checkデバッグトークン、管理資格情報、署名鍵、実在人物の個人情報。テスト・デモは架空データのみ。
8. **UIは英語。** 公式様式の日本語と本人情報の原表記は保持。
9. 「PII漏えいゼロ」「端末に残るもの0件」等の保証文言を表示しない。
10. 二つのSPAは別オリジン・別ビルド。相互 import 禁止（lintで強制）。

## 現在の状況（2026-11-12時点）

- スパイクA: 実機（Mac・Chrome 157・`nano_v3`）で公開URL・本番CSP・通信断まで確認済み。Gemini Nano 4 の証拠は運営回答待ち。`docs/spikes/spike-a.md`
- スパイクC: 公式様式 930004094.pdf（PDL1.0）1ページ目へ記入確認済み。フォント BIZ UDゴシック全体埋込み。`docs/spikes/spike-c.md`
- S5: 手入力→確認→部分記入PDF の導線を実装、コンテナ E2E 済み（実機未確認）。`docs/spikes/s5-manual-flow.md`
- 未着手: スパイクB（公開側クラウド・App Check）、評価データ分離と閾値固定
- SDK 注意: `LanguageModel` global が無い環境では `ONLY_ON_DEVICE` でもクラウドへ送信される（@firebase/ai 3.1.0 のコードで確認）。`FirebaseOnDeviceLLM` のガードを外さない。
- Node 24（`.nvmrc`）。@firebase/ai 3.x の要件。
- 2026-11-12 Devpost Support の案内により、大会ページの「Email the hackathon manager」宛てに3点を再送・回答待ち（③は下記 Nano 4）:
  1. 「公開様式のクラウド解析＋本人情報の端末抽出」の2経路分担でハイブリッド推論要件を満たすか（自動フォールバック必須か）
  2. 別オリジンの端末専用コンポーネントで App Check 初期化を省略できるか
  3. 「Gemini Nano 4」は Chrome 157 の `nano_v3`（現行 Prompt API）と `#gemma4-for-built-in-ai`（Gemma 4）のどちらか、証拠に何を示すか
  - 承認済み・規約違反確定のどちらとしても扱わない。回答待ちでも実装・実機検証は進める。本人情報のクラウドフォールバックは回答にかかわらず導入しない。

## 現フェーズ: Day 1–2 成立ゲート（requirements.md 6章）

優先順:
1. モノレポ雛形（npm workspaces: `apps/public-app`, `apps/private-app`, `packages/domain`, `packages/contracts`）、TypeScript strict、ESLint（boundaries）、Vitest
2. **スパイクA（最重要）:** private-app で Firebase AI Logic `ONLY_ON_DEVICE` により架空在留カード画像から欄抽出。本番想定CSP（`connect-src data:`）・App Check未初期化で動くか、`initializeDeviceModel()`、`inferenceSource`、モデル世代の確認方法を記録
3. スパイクB: public-app で App Check（reCAPTCHA Enterprise）付き `ONLY_IN_CLOUD` により公開原本PDFから欄定義候補を生成
4. スパイクC: pdf-lib + fontkit で固定様式PDFへ日本語の最小転記
5. 手入力のみで確認→PDF出力まで進める導線、通信断での継続
6. 探索用・判定用データの分離と、判定前の閾値固定（評価指標は requirements.md 6章）

## 作業ルール

- Firebase AI Logic・Prompt API は仕様変更が速い。実装前に公式ドキュメントと固定したSDKの型で確認し、確認日と版を記録する。推測でAPI名を書かない。
- 「実装済み」と「確認済み」を区別して報告する。Fake LLM のテスト合格を実機のAI実行の証拠にしない。
- 実測結果（Chrome版、SDK版、モデル情報、精度、時間）は `docs/` 配下に記録する。
- 期間中の開発内容は `docs/development-history.md` に追記する（R07: 期間前の仕様書と期間中の開発を区別して開示）。
- 依存は版を固定し lockfile をコミット。CIは `npm ci`。
- 大きな変更の前に計画を示し、確認を取る。
