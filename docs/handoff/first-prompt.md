# Claude Code 初回プロンプト（コピーして使う）

```
CLAUDE.md と docs/specs/ の3文書（requirements.md, architecture.md, tech-stack.md）を全部読んで。

読み終えたら、まだコードは書かずに以下を出して:
1. 仕様の理解の要約（10行以内）。特に PII 境界、推論モード固定、2つのSPA分離。
2. Day 1–2 成立ゲート（requirements.md 6章）の実装計画。スパイクA（private-app の ONLY_ON_DEVICE 抽出）を最優先に、作業順・各ステップの完了条件・必要な私の手作業（Firebase設定など）を列挙。
3. 仕様の中で、実装前に公式ドキュメントで確認が必要な API・設定の一覧（Firebase AI Logic Web SDK の版、initializeDeviceModel、responseConstraint、inferenceSource、App Check、Gemini Nano 4 の確認方法など）。
4. 仕様の矛盾・不明点があれば列挙。

私が計画を承認したら、モノレポ雛形の作成から始めて。
```

## 開発者（人）が先に用意するもの

- Firebase プロジェクト（審査用は架空データ専用で別に作るのが仕様。開発用と分けてよい）
- Firebase AI Logic の有効化（Gemini Developer API）
- App Check: reCAPTCHA Enterprise のサイトキー（公開側のみ）。ローカル開発用デバッグトークンは各自登録し、リポジトリに入れない
- Firebase Hosting のサイトを2つ（public-app / private-app を別オリジンにするため）
- 対応ハードウェアのデスクトップ Chrome（Gemini Nano 4 が使える版・設定）。モデルのダウンロードを事前に済ませる
- 対象の公式様式PDF（出入国在留管理庁 在留期間更新許可申請書）の取得と、取得日・版・再配布条件の記録
- 架空の在留カード画像（探索用／成立ゲート判定用／リリース判定用20枚を別々に。実物・公式見本は使わない）
- GitHub リポジトリ（提出時は公開。それまでは非公開でも可）

## 秘密情報の扱い

- `.env.local` 等はコミットしない。`.env.example` にはプレースホルダーのみ
- Firebase の Web 用設定値は公開前提の値だが、App Check を必ず有効化する
