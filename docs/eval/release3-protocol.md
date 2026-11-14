# 評価プロトコル（リリース再評価2・重要欄、release3）

状態: **凍結（2026-11-14、開発者の選択 D：プロンプトで番号の並びを伝え、新しいカードで再評価。基準は release2 と同じ）**。
凍結コミットのハッシュは末尾に記録する。凍結後に新しい `release3` セット（20枚）を生成し、判定は1回だけ行う。
`release`・`release2` セットは再利用しない。

## 変更点（release2 プロトコルからの差分のみ。その他は `release2-protocol.md`・`release-protocol.md` と同じ）
- 対象ビルド: プロンプト `spike-a-2` を含む公開URLのビルド（開発時点の配備は Build e50c9bc。判定時のビルドを記録）。
- `spike-a-2` は探索用セット `explore` と `explore2` だけで確認した（`explore2`: 番号 0/4 → 2/4、誤って採用可能 0）。
- データセット `release3`: 構成・値の内訳・透かしは release2 と同じ。値は explore・explore2・gate・release・release2 のいずれとも重複しない。

## 閾値（凍結、release2 と同じ）

| 欄 | 指標 | 合格 |
|---|---|---|
| fullName | 原表記の完全一致 | ≥ 16/20 |
| residenceCardNumber | 誤って採用可能 | ≤ 1/18 |
| residenceCardNumber | 正しく採用可能 | ≥ 15/18 |
| residenceCardNumber | 採用不可（手入力） | ≤ 3/18 |
| periodOfStayExpiry | 正規化後の完全一致 | ≥ 17/18 |
| fullName・periodOfStayExpiry | 未読 | 各 ≤ 2 |
| 正解が空の欄 | 値の提示（モデル出力のまま数える） | ≤ 1/4 |
| 時間 | 準備済み抽出 p95 | ≤ 15 秒 |
| PDF | 確認後の誤記入 | 0 件 |

## 手順
1. 本プロトコルを凍結（コミット）。2. `release3` セットを生成・コミット（凍結後）。3. 開発者の Mac で
`npm run device:check -- --eval release3`。4. `node scripts/eval/score.mjs data/eval/release3/manifest.json <run>.json` で採点し、
`docs/eval/release3-results.md` に記録。

## 凍結記録
- 凍結日: 2026-11-14（このファイルを追加したコミット。ハッシュはセット生成時に追記）。
