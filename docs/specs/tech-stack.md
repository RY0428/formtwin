# FormTwin 技術スタック選定書（改訂版）

改訂日: 2026-11-12（最終通しレビュー・公式ルール反映）

本書は11月10日の最終通しレビューと11月12日の公式ルール確認を反映した設計方針である。MVP範囲・受入基準・日程は要件定義書、境界・状態契約はアーキテクチャ設計書を正とし、本書は採用技術と配置を定める。変更時は3文書を同時に更新する。公式仕様の確認と、実機・実装の検証を区別する。依存ロックファイル、実PDF、モデル応答の検証は未実施であり、以下の検証項目を完了してから対応済みとする。

## 1. 目的とMVP範囲

個人開発で、要件定義書8章の提出日程に合わせて、Firebase AI Logicの端末推論とクラウド推論を用いたフォーム記入支援を実装する。

- 端末: ユーザーの文書・記入値を扱い、抽出、確認、PDF出力をブラウザ内で完結する。
- クラウド: 事前登録した未記入の公開書式だけを解析する。
- MVP対象: 在留期間更新許可申請書の1種類・1版と、架空の在留カード画像（JPEG/PNG）。端末AIが使えない場合も対応欄を手入力し、部分記入PDFを出力できる。完成・提出可能とは表示しない。旅券追加は成立ゲート通過後に判断する。
- 実行構成: 公開処理側と本人記入側を別オリジン・別ビルド・別ストレージ領域の2つのSPAとして配布する。本人情報はメモリのみ。
- 延期: ユーザーによる共有書式投稿、永続保管庫、Dexie、PWA、WebAuthn PRF、任意書式への完全対応、英語以外へのUI展開、検索グラウンディング。
- 大会条件: 要件定義書10章のR01〜R10を適用し、Web/Chromeを提出対象にする。端末モデルはGemini Nano 4を対象とし、全AI推論をFirebase AI Logic経由で実行する。
- 要確認: 2経路構成と本人側App Check未初期化の大会適合は要件定義書9章に従い根拠・回答を記録する。主催者へ問い合わせ済みで回答待ち。承認済み・規約違反確定のどちらにも扱わず、独立した実装・実機検証は継続する。PIIをクラウドへフォールバックさせる設計には変更しない。

## 2. PIIの境界

「本人の情報をブラウザ外へ送らない」は、文書内容、画像、記入値、抽出結果、記入済PDFとそれらから派生する識別子を対象とする。公開側の認証・App Checkや、両アプリの配信アクセスに伴うIPアドレス等の技術情報は別に取扱いを説明する。本人側では認証・App Checkを初期化せず、アーキテクチャ設計書3.2節の通信禁止を適用する。

- ユーザーが持ち込むPDF・画像は、未記入に見えてもクラウドへ送らない。
- クラウドに渡す原本は、配布前に確認した公開書式の固定アセットに限定する。任意URLや任意ファイルをクラウド呼出しに渡すAPIは作らない。
- クラウド呼出しの入口は一か所に集約し、許可された書式IDから原本を取得する。PIIを含み得るオブジェクトの除外コピーではなく、許可項目だけから要求を構築する。
- ユーザー文書のハッシュ、ファイル名、抽出ラベル、自由記述、PDFメタデータも送信しない。
- データベース（Firestore等）は使わない。レビュー済みの公開FormDefはリポジトリ内の不変リビジョンと署名済みパッケージで配布する。本人のメモリ内データをURL、ログ、エラー報告、分析イベントに載せない。
- 型、Zod、import制限は補助策とする。送信許可リストと通信テストで境界を検証する。
- 公開側は実際のFirebase/App Check通信を検証して接続先を限定する。本人側は `connect-src data:`（data: URL のみ。SDKの画像変換に必要、アーキテクチャ3.2節）とし、外部スクリプト・フォント・ログを持たない。必要な固定資産をPII入力前に準備する。SDK端末初期化との両立は成立ゲートで実測し、動作しない場合に本人側の通信許可を広げない。

## 3. フロントエンドと状態の所有権

React + Vite + TypeScript strictで独立した2つのSPAを採用する。SSRが不要な構成として選択し、別ビルド・別デプロイとアプリ間の依存禁止をCIで確認する。SPAであること自体をPII保護の根拠にはしない。

| 用途 | 配置 | 技術・責任 |
| --- | --- | --- |
| UI | 両SPA | shadcn/ui + Tailwind。キーボード操作、ラベル、フォーカス、エラー通知は実画面で確認 |
| 記入値・入力エラー | 本人側のみ | React Hook Formを編集値の所有者とする。更新は版管理・確認解除・PDF無効化を行うユースケース経由に統一 |
| セッション・画像・確認・モデル状態 | 本人側のみ | Reactの状態。共有が必要なものだけZustand。PIIはメモリのみ。永続化ミドルウェアを使わない |
| 公開FormDefの読取り | 公開側 | ビルド時に同梱した採用済みリビジョンと採用履歴を表示する（TanStack Queryは使わない。実行時取得なし） |
| 本人側の公開パッケージ | 本人側ビルド | 検収・署名・版固定した原本、FormDef、説明を同梱し検証。実行時のFirestore取得・Query取得なし |
| 実行時検証 | 共通contracts | Zod v4。フォーム入力、AI出力、公開FormDefの契約を区別。ネットワーク・本人状態を持たない |
| UI言語 | 本人側・審査向け公開画面 | MVPは英語。開始・準備・入力・修正・確認・エラー・保存・終了まで英語で完結。文言を集約し、将来の追加言語対応時にreact-i18nextを検討 |
| PDF処理 | 本人側。公開側は原本レビューに必要な範囲のみ | pdfjs-dist、pdf-lib、@pdf-lib/fontkit。記入値・記入済みPDFは本人側だけで扱う |
| 承認・配布 | 管理スクリプト | 原本検査、Zod検証、ハッシュ固定、`scripts/forms/` による昇格・パッケージ化、独立した管理鍵（ES256、秘密鍵は管理者端末のみ）による署名。管理資格情報をSPAへ含めない |

本人向けの英語UIでも、公式様式の日本語と本人情報の原表記は保持する。管理者用の検収メモには日本語を使用できる。

同じ編集値をReact Hook FormとZustandへ独立した正本として重複保持しない。Factと欄の編集値はアーキテクチャ5章のID・版で結び、PDF用コピーは不変スナップショットとして管理する。編集・画像差替え・再抽出候補の採用では関連欄の確認を解除し、古い推論応答の反映と古いPDFの保存を拒否する。精度目標を達成しても全対応欄の確認を維持する。

## 4. AIプロバイダとSDK契約

クラウドではGemini Developer APIをFirebase AI Logic Web SDK経由で利用し、端末では同SDK経由のGemini Nano 4を採用対象とする。公式JSリリースノートで確認した13.2.0を検証開始版とし、実機スパイク成功後に正確な版とlockfileを固定する。未検証の組合せを動作保証しない。13.2.0という既存の検証開始版がNano 4要件を満たすとは断定せず、対象Chrome・端末モデルとの対応を成立ゲートで確認する。必要な更新は影響試験後に固定する。

| 項目 | 設定・扱い |
| --- | --- |
| バックエンド | `getAI(app, { backend: new GoogleAIBackend() })` |
| PIIを扱う端末モデル | Gemini Nano 4を対象に `mode: InferenceMode.ONLY_ON_DEVICE`。実際の世代と利用可能性を記録し、不明なら未確認とする |
| 公開書式を扱うクラウドモデル | `mode: InferenceMode.ONLY_IN_CLOUD` |
| クラウドモデル名 | `inCloudParams.model`に`gemini-3.5-flash-lite`を明示。利用可能枠と品質は実プロジェクトで確認 |
| 端末セッション設定 | `onDeviceParams.createOptions`。日本語・画像を含む実際の入力条件に合わせる |
| 端末の出力制約 | `onDeviceParams.promptOptions.responseConstraint` |
| クラウドの出力制約 | `inCloudParams.generationConfig.responseMimeType: 'application/json'`と`responseSchema` |
| 端末の画像入力 | SDKが `inlineData` を `fetch('data:…')`→`createImageBitmap` で変換（13.3.0のコードで確認）。本人側CSPに `connect-src data:` が必要 |
| 端末の中断 | 13.3.0の端末経路は要求ごとの `signal` をPrompt APIへ渡さない（コードで確認）。中断不可として結果無効化で扱う |
| 推論元の観測 | `result.response.inferenceSource`の`ON_DEVICE` / `IN_CLOUD`。送信後の確認であり漏えい防止策ではない |

アプリのAI推論にChrome Prompt APIの直接生成、Gemini REST API、他社AI API、Firebase AI Logicを迂回するSDKを使わない。実装補助に使うAIコーディングツールとは区別する。

PII経路でPREFER系モードを使わない。端末失敗時にクラウドへ再試行しない。クラウド設定から端末経路のモードを変更できる仕組みを作らない。

v13では`Part`の明示的な`type`や端末設定の変更がある。旧サンプルを混在させず、固定SDKの型でビルドする。端末の旧`topK` / `temperature`設定を流用しない。

### 端末の初期化

1. 固定資産・署名・パッケージ互換性・PDF出力の準備を先に行う。これが失敗した場合は入力を開始しない。
2. AIを使う場合は、対応するChrome、機器、空き容量、言語・入力モダリティを確認し、PII入力前の利用者操作で `initializeDeviceModel()` を呼ぶ。進捗を表示し、成功後にだけ抽出を許可する。
3. AI準備の省略、未取得、未対応、初期化失敗、ダウンロード拒否・取消し・タイムアウトでも、固定資産の準備が成功していれば手入力・確認・PDF出力を利用できる。元画像は端末内で表示できるが、AI未準備時は抽出を無効にする。
4. 手入力を選んだセッションは手入力のまま維持し、遅れて届く初期化完了で自動切替しない。AIを準備し直す場合は内容の保存または破棄を本人が選び、新規セッションのPII入力前に行う。状態遷移・取消し・遅延応答の扱いはアーキテクチャ6.2節・9.1節に従う。

Chromeチャンネルの指定だけではモデルの存在や機器条件を保証しない。デモ端末で事前ダウンロードとオフライン動作を確認する。

## 5. Zodと構造化出力

Zodを契約の出発点とするが、`z.toJSONSchema()`の結果を無加工で両経路へ渡せば互換になるとは扱わない。

- AI出力用の契約はJSONとして表現できる単純な型を中心にする。入力補正や変換処理は分離する。
- 端末向けJSON Schemaとクラウド向けFirebase Schemaのアダプタを別々に検証する。
- `additionalProperties`、nullable、optionalとrequired、`anyOf`、参照、文字列制約、数値範囲を変換テストに含める。
- 共通化できない制約は、生成側に対応可能な制約を設定したうえで、応答後のZod検証で必ず判定する。
- `JSON.parse()`成功だけを正常としない。Zod検証に失敗した値をフォームやPDFへ反映しない。
- 出力スキーマ版をFormDefと評価結果へ記録する。
- `responseJsonSchema`への変更は、固定SDK・モデル・Hybrid経路で確認してから採用する。現時点では要確認。

## 6. PDFと画像

pdfjs-distで表示・読取り、pdf-lib + @pdf-lib/fontkitで記入と保存を行う。固定PDF・マニフェスト・PDF埋込み用フォントはビルド時にバイト列としてモジュールへ組み込み、実行時のfetchを使わない。pdf.jsにはメモリ内のバイト列を渡す。worker等の同一配信元の静的資産はPII入力前に準備し、追加取得・遅延ロードなしで動作させる。本人側の `connect-src data:` とworker自身の通信禁止CSPで動作することを検証する。生成・プレビュー・保存はアーキテクチャ7.4〜7.5節の版照合に従う。

### 日本語出力

`registerFontkit()`、日本語フォントの`embedFont()`、値設定、`form.updateFieldAppearances(font)`の順に処理する。編集不要な出力は表示更新後にflattenする。

PDF埋込み用フォントは **BIZ UDゴシック Regular（TrueType、SIL OFL 1.1）** とする（2026-11-12 スパイクCで変更・開発者決定）。当初のNoto Sans JP（CFF形式OTF）は @pdf-lib/fontkit 1.1.1 のサブセット埋込みで例外となり、TrueTypeでもサブセット埋込みはpdf.js描画でグリフが欠落した。このため全体埋込み（`subset: false`）を採用し、出力PDFは約3MB増える。フォントが持たない文字（例: U+20BB7）は代替・切捨てをせず未記入として本人に示す。異体字、長い氏名、改行、欄のあふれを評価する。フォント埋込みだけで全ての日本語文字を扱えるとはしない。サイズ削減（ビルド時の文字集合サブセット等）は別途検証する。

### 書式の分類

- 対応AcroForm: フィールド型と名前を検証して記入する。
- AcroFormなし: レビュー済みFormDefに従って座標描画する。
- XFA、暗号化、署名付き、破損など: MVPの対応可否を判定し、未対応なら処理を中止して案内する。
- 座標はページ番号、単位、原点、ページ寸法を定義し、回転、CropBox、表示倍率を変換する。保存後のPDFを再描画して確認する。

### 画像処理

元解像度から対象領域を切り出す。長辺1024pxへの一律縮小は採用条件にせず、PNG/JPEGと解像度を評価して決める。Canvasによる再描画・再エンコードを行い、出力メタデータも検証する。

公式Hybrid Web案内の端末画像入力はPNG/JPEG、最大トークン数は9216。ピクセル数をトークン数の保証として使わず、要求の大きさと失敗時の分割方針を検証する。ラベルと値の対応を保つ余白を残し、必要に応じて手動クロップを提供する。

## 7. 一時セッションと将来の保管庫

MVPは一時セッションのみ。本人情報をメモリ内で扱い、IndexedDB、localStorage、sessionStorage、Cache Storage、OPFS、Query永続化へ書き込まない。例外として Firebase SDK（@firebase/app）が `getAI()` 時に作る `firebase-heartbeat-database`（日付とSDKのユーザーエージェントのみ、本人データなし）は許容する（2026-11-13決定）。E2E で中身にカナリア値が無いことと、他のDB・保存領域が無いことを確認する。Dexieは導入せず、保管庫用の鍵も生成・保存しない。終了・ロック・復帰はアーキテクチャ9.1節の契約に従う（状態は `active / locked`、無操作10分・1分前警告、非表示で即ロック。値は `docs/decisions.md`）。端末抽出は1回30秒上限・不正出力時のみ端末で1回再試行（クラウドへは送らない）。元ファイルと本人が明示保存したPDFはアプリの終了操作で削除しない。

将来の永続保管庫はMVPの採用技術に含めない。Dexie + WebCrypto AES-GCMは候補とし、認証・鍵管理・端末紛失・削除・復旧不能性を定義した別設計審査後に採否を決める。鍵と暗号文を同じオリジンに保存する方式は、抽出不可鍵を使っても同一オリジンの悪意あるコードによる復号を防がない。暗号化一時保存のメモリ鍵と、長期保存用の鍵管理を混同しない。

## 8. Firebaseと費用制御

- Hosting: 公開側・本人側を別オリジン・別デプロイで静的配信する。各SPAのCSP・環境変数を分離し、プレビューと本番の設定・権限も分離する。
- Firestore: 使わない（2026-11-13改訂：Firestore不使用。検収済みFormDefは `forms/` の不変リビジョンとして管理し、署名済みパッケージを本人記入側へ同梱、公開側は表示用に採用済みリビジョンを同梱する）。両SPAでFirestore SDKを初期化しないことをlint（`no-restricted-imports`）とバンドル検査で確認する。
- 昇格スクリプト（`scripts/forms/promote-forms.mjs`）でもスキーマ、座標、公開原本との対応、候補ファイルのハッシュを検証する。
- App Check: 公開側だけでreCAPTCHA Enterpriseを設定し、AI Logicのenforcementを確認する。2026-11-02以降のAI Logic必須化に対応する。本人側の未初期化と端末専用SDKの両立は成立ゲートで実測する。
- 大会は提出時のApp Checkデバッグトークンを許容するが、FormTwinのホスト版は本番用プロバイダを使用する。開発用トークンを公開リポジトリ、本番バンドル、公開プレビューへ含めず、ローカル開発では各開発者が自分のトークンを登録する。プレビュー用ドメインの設定を確認する。
- 匿名認証: 公開側でアクセス制御・識別上必要な場合にのみ使用する。本人側には導入せず、共有認証セッションも設けない。本人確認や悪用防止、レート制限が自動で成立するとは扱わない。
- AI Logicのユーザー単位RPMとGemini側クォータを実プロジェクトで設定・確認する。匿名ユーザーの作り直しも想定し、プロジェクト全体の制限と併用する。2026-11-13: 「Generate content requests per minute per project per user per region」を全43リージョンで100→10に設定（Gemini Developer APIでどのリージョン行が使われるかは公式に記載なし→全行）。429は公開側で英語表示・自動再試行なし・60秒送信停止。AI monitoring は無効のまま（プロンプト・応答を Cloud Logging に保存しない。送信の記録は公開側の本文なしリクエストログ）。プロジェクト全体の上限は Gemini Developer API 側の割当に委ね、別の全体上限は設定していない。認証無し時の「ユーザー」の単位は公式資料に明記が無く未確認（IP・App Check トークン単位なら複数の利用者がそれぞれ10回まで使える）。
- Blazeへ移行する場合は、予算アラートに加えAI用spend capを設定する。対象サービス、停止挙動、費用集計の遅延を確認し、プロジェクト全体の総額上限とは解釈しない。
- 429・上限到達・サービス停止時は無制限に再試行せず、状態を表示する。
- Remote ConfigはMVP必須としない。導入する場合も公開側のモデル名・プロンプト版だけを扱う。本人側では初期化せず、PII境界や推論モードを変更させない。

## 9. テスト・CI・観測

### CI

GitHub Actionsでlint、型検査、Vitest、秘密情報・不変条件・パッケージ署名の検査、Fake LLMを使うPlaywright E2Eを実行する。

- LLM境界は`OnDeviceLLM` / `CloudLLM`に分ける。壊れたJSON、欠落値、拒否、タイムアウト、モデル非対応を試験する。
- 端末失敗時にクラウド要求が発生しないことを検証する。
- AI初期化の省略・失敗・拒否・取消し・タイムアウトから手入力・確認・PDF出力へ進めることを検証する。
- 確認後の編集・画像差替え・クロップ変更で確認が失効すること、推論中の手修正を遅延応答が上書きしないこと、生成中・生成後の編集で古いPDFが表示・保存されないことを検証する。
- 送信先・送信項目の許可リストを検証し、カナリアによるURL、ヘッダー、bodyの検査を併用する。符号化や画像化した漏えいを文字列検索だけで検出できるとはしない。
- 通常の通信検査は`serviceWorkers: 'block'`。PWAを将来追加する場合はService Worker有効時の別試験を追加する。
- 同梱パッケージの署名・ハッシュ・互換性・撤回の拒否ケースを試験する。App Check enforcementは実環境でも確認する。
- プレビュー配信は必要な権限と秘密情報の扱いを確認し、未信頼PRへ本番資格情報を渡さない。

### 実機リリース判定

Nanoを通常のホスト型CIで動かすことは前提にしない。対応実機での自動試験可否は別途検証する。

- 要件定義書6章に従い、探索と成立ゲートに使っていない架空書類20枚をリリース判定に用いる。同じ元書類の派生画像を集合間で混在させない。欄別の完全一致率・誤候補率・未読率、確認後PDFの誤記入件数、修正時間、処理時間を記録する。分母・正規化・タイムアウトの扱いも同章に統一する。
- Chrome版、モデル情報、SDK版、プロンプト版、スキーマ版を記録する。
- SDK経由の端末推論、公開書式によるクラウド推論、初期ダウンロード、非対応時の手入力を確認する。
- 日本語PDFを保存・再表示し、文字欠けと座標ずれを確認する。
- 探索評価後、各判定用評価の実施前に条件・合格閾値を固定する。判定結果を見て閾値を変更して合格扱いにしない。精度目標の達成後も全対応欄のユーザー確認を必須とする。
- 英語UIで本人の操作が完結し、クラウド候補・人による検収・採用済みFormDef版の履歴が同じ書式IDで追えることを確認する。ライブ再解析は未採用候補として表示する。

### 観測

クラウド側のモニタリングは公開書式の要求だけを対象とする。プロンプト・応答保存の設定を確認する。端末側はローカルの成否・時間だけを表示し、PIIを外部ログへ送らない。Google AnalyticsはMVPで導入しない。

## 10. 依存管理と大会提出準備

正確な依存版とlockfileを保存し、CIは`npm ci`で再現する。Nodeとブラウザの検証版を記録し、GitHub ActionsはコミットSHAで固定する。pdfjs-distとworkerの版を揃える。依存の公式リリース・セキュリティ情報を確認し、更新時は影響範囲の試験を行う。

全依存の互換性、脆弱性の有無、pdf-lib/fontkitの対象PDFとの互換性は未検証。最新という理由だけで一括更新しない。

実装日程は要件定義書8章を唯一の正本とし、本書に別の日程表を設けない。Day 1–2では公開URL・本番想定CSPでの端末抽出と、本番用App Check付きの公開側クラウド要求、最小PDF転記、手入力・通信断を先に検証する。完成版の署名・配布・監視・ルール・状態遷移・品質検証は、アーキテクチャ13章のリリース条件として管理する。成立ゲートの通過とリリース判定の完了を区別する。

### 10.1 公開リポジトリと再現用成果物

根拠は[#BuildHybridAI 2026 Official Eligibility and Rules](https://firebasehybridaihackathon.devpost.com/rules)6・7節と[大会ページのRequirements](https://firebasehybridaihackathon.devpost.com/)。要件定義書10章に対応して、以下を実装時に作成する。ここに列挙したファイルは仕様上の予定であり、作成済みを意味しない。

| 成果物 | FormTwinでの役割 |
|---|---|
| `README.md` | 英語の価値説明、2経路の役割、Firebase AI Logic実呼出し箇所、両SPAのセットアップ・起動・デモURL |
| `LICENSE` / `THIRD_PARTY_NOTICES.md` | OSSライセンスと第三者資産の出典・条件。Apache-2.0を第一候補とし、権利・互換性確認後に確定。公式様式やフォントまで独自ライセンスへ付け替えない |
| `docs/judging.md` | 英語の端末条件、モデル準備、架空サンプル操作、通信断の手順、非対応時の挙動、検証済み版 |
| `docs/development-history.md` | 期間前の仕様書・既存コード等と、期間中に作った機能・差分の記録 |
| `docs/contest-compliance.md` | R01〜R10の確認状態・証拠。個人の資格情報は載せず、2経路・App Checkの質問と公開可能な回答を記録 |
| `docs/release-manifest.md` | 提出コミット、配信版、FormDef版、検証記録、動画URLを対応付ける |
| `.env.example` / 固定依存・設定 | プレースホルダーのみの設定例、lockfile、Node版、両SPAのビルド・配信手順、署名済みフォームパッケージ・公開鍵・必要な公開資産 |

審査用プロジェクトの初期設定を手順化し、既存の本番プロジェクトのキーや管理資格情報を提出の前提にしない。Git履歴・ビルド成果物・動画・READMEを含めて秘密情報と本人データを点検する。公開用の架空サンプルには合成データであることを表示する。

### 10.2 提出前の技術確認

- 別の作業ディレクトリにリポジトリを取得し、記載した手順とプレースホルダー設定から必要な設定を行って再ビルドする。配信物・固定パッケージとの対応を確認する。
- Fake LLMによるCI合格と、実機のNano 4・クラウド実行を別に記録する。ライブラリをimportしただけ、あるいは `ON_DEVICE` を表示しただけで要件達成としない。
- リポジトリの公開状態・ライセンス検出、YouTubeの公開状態、英語資料、動画の長さ、両SPAのアクセスを別環境で確認する。動画は同じ提出版から作る。
- 審査期間のブラウザ・モデル・クラウドモデル更新を想定し、検証時の版と日時を残す。提出後のコード差替えはアーキテクチャ13.2節に従う。
- 追加のGoogle Account Quotaは任意の開発支援とする。採用する場合は公式ルール5節で申請窓口・有効期限・費用負担を再確認し、審査用配信の継続を別途確保する。

## 11. 公式一次資料

大会資料確認日: 2026-11-12。技術資料の既存確認日: 2026-11-10。大会指定モデルの実機対応を含め、実装時に固定SDKの型・動作と再照合する。

- [#BuildHybridAI 2026 Official Eligibility and Rules](https://firebasehybridaihackathon.devpost.com/rules)
- [大会ページのRequirements](https://firebasehybridaihackathon.devpost.com/)

- [Firebase Hybrid Web: Get started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)
- [Firebase Hybrid Web: Configuration options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options)
- [Firebase Hybrid Web: Structured output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output)
- [Firebase JavaScript SDK Release Notes](https://firebase.google.com/support/release-notes/js)
- [Firebase supported models](https://firebase.google.com/docs/ai-logic/models)
- [Firebase AI Logic App Check](https://firebase.google.com/docs/ai-logic/app-check)
- [Firebase AI Logic quotas](https://firebase.google.com/docs/ai-logic/quotas)
- [Firebase AI Logic monitoring and spend caps](https://firebase.google.com/docs/ai-logic/monitoring)
- [Firebase App Check](https://firebase.google.com/docs/app-check)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Zod JSON Schema](https://zod.dev/json-schema)
- [pdf-lib PDFForm API](https://pdf-lib.js.org/docs/api/classes/pdfform)
- [pdf-lib releases](https://github.com/Hopding/pdf-lib/releases)
- [Playwright Network](https://playwright.dev/docs/network)

参考: Gemini 2.5系の2026-12-01からの振替はモデル別の公式記載に従う。審査期間は要件定義書8章のとおり12月に及ぶ。MVPは明示した使用モデルの提供期間を確認し、必要な移行・再検証を提出前に完了する。
