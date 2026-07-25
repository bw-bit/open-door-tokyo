# スポンサー統合のコード証跡

審査員へは「ロゴ」ではなく、入力、出力、実行モード、ソースファイルを見せる。

## Qwen Cloud

- 役割: 動画代表フレームから観察事実、未確認、危険な候補表現をJSON抽出
- コード: `lib/providers/qwen.ts`
- surface: Alibaba Cloud Model Studio Pay-As-You-Goのintl
  OpenAI-compatible `chat/completions`
- 公式既定: base URL
  `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`、vision-language
  model `qwen3.6-flash`（画像・動画、structured output対応）
- 検証: Zod、model id、usage、既知fieldへのmappingを検証し、測定値や認定を推測させない
- 環境変数: `DASHSCOPE_API_KEY`が必須。`QWEN_BASE_URL`, `QWEN_MODEL`,
  `QWEN_REGION`は上記公式intl値を既定とする。`QWEN_WORKSPACE_ID`は任意で、
  設定時だけ`X-DashScope-WorkSpace`を送る
- 課金境界: 4画像、入力byte、output tokenをcall前に上限化し、既知価格による
  最大費用を永続予約できない場合は呼ばない
- 現在の検証証跡: 実動画1回を`qwen3.6-flash`でguard後に実行し、`LIVE`、
  schema・semantic validation pass。単なる再証明のためには再実行しない
- 公式資料: <https://www.alibabacloud.com/help/en/model-studio/qwen-vl-compatible-with-openai>

## GMI Cloud

- 役割: 包括的な利用可否表現を、証拠に照らしてセカンドチェック
- コード: `lib/providers/gmi.ts`
- API: `https://api.gmi-serving.com/v1/chat/completions`
- 出力: `supported` / `unsupported`、理由、日英の具体的書換
- 安全設計: 決定論ルールが先に必ず走り、GMI障害でも危険な断定を通さない
- 環境変数: `GMI_API_KEY`, `GMI_MODEL`
- 課金境界: 入力とoutput tokenを固定上限化し、1回最大費用の永続予約後だけ実行
- 現在の検証証跡: Kimi K3をモデル一覧で確認。推論は2回失敗し、
  採用可能なreview結果は0件。費用は過少申告を避けてUSD 0.10を保守的に使用済み
  として扱い、追加retryはしない
- 公式資料: <https://docs.gmicloud.ai/inference-engine/api-reference/llm-api-reference>

## ai&

- 役割: 確認済みの事実を保持したまま、店舗向けの日英表現を国内処理で確認
- コード: `lib/providers/aiand.ts`
- API: `https://api.aiand.com/v1/chat/completions`
- 環境変数: `AIAND_API_KEY`, `AIAND_MODEL`
- 課金境界: 確認済みfactsだけをbounded requestで渡し、永続予約後だけ実行
- 現在の検証証跡: `deepseek-v4-flash`の固定64-token contractをlocal guard後に
  1回実行し、schema・semantic validation pass。本番環境には未設定
- 公式資料: <https://docs.aiand.com/ja/sdks/openai/>

## Daytona

- 役割: 公開直前のカードJSONを一時的な隔離サンドボックスで検査
- コード: `lib/providers/daytona.ts`
- 実処理: `Daytona.create()` → `sandbox.process.codeRun()` → JSON監査 → ephemeral sandbox削除
- 検査: 言語、見出し、代替テキスト、未確認表示、認定禁止、根拠、公開状態など8項目
- 環境変数: `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `DAYTONA_TARGET`
- ライフサイクル: sandboxは最大1、TTL 10分、code run 30秒、成功・失敗とも
  `finally`で削除。削除結果不明なら以後の作成を停止
- 課金境界: resource profileと最大runtimeの費用を永続予約できない場合は作成しない
- 現在の検証証跡: 最大USD 0.05を予約したlocal contractでephemeral sandboxを
  1回実行。8 checks、live mode、削除完了を確認。本番環境には未設定
- 公式資料: <https://www.daytona.io/docs/en/typescript-sdk/>

## Nosana

- 役割: 既存の証拠フレーム索引jobをread-onlyで検証。GPU投稿は任意の別操作
- コード:
  - `lib/providers/nosana.ts`: `jobs.get(NOSANA_JOB_ID)`によるread-only追跡と、
    明示的に隔離したpaid投稿
  - `app/api/nosana/submit/route.ts`: 管理者限定・quote・明示確認・冪等キー・
    永続予約付き投稿
- 重要: SDKの `jobs.list()` は一覧取得ではなくcreditsを使うbulk-create。
  接続proofでは絶対に呼ばない
- 安全設計: 通常の解析UIは有料ジョブを投稿しない。既知quote、残存cap、
  provider hard limit、明示確認、冪等キーが一つでも欠けたら拒否
- 現在の検証証跡: credits/read-only認証のみ。有料GPU jobは未投稿
- 環境変数: `NOSANA_API_KEY`, `NOSANA_MARKET`, `NOSANA_JOB_ID`, `NOSANA_SUBMIT_SECRET`
- 公式資料:
  - <https://learn.nosana.com/api/jobs.html>
  - <https://learn.nosana.com/deployments/jobs/job-definition/intro.html>

## Qoder

- 役割: Expert Panelでフロント、API、安全、デモを並列に確認し、Repo Wikiで暗黙知を可視化
- 準備物:
  - `.qoder/repowiki/wiki_plan.yaml`
  - `docs/QODER_TASKS.md`
  - このファイル
- 当日の証跡: Expert Panelの実行履歴、Repo Wikiの画面、修正コミット
- 表示上の扱い: developer toolingの証拠であり、runtime provider、
  health entry、Agent TraceのLIVEとは主張しない
- Cloud Agents、Agent SDK、Teams管理は別surface。本作では未実装なので
  それらのAPI統合を主張しない
- 現在の検証証跡: Cloud Agents listのread-only認証のみ。runtime実行は未実施

## スポンサー・クレジットガード

- Productionはprivate Vercel Blobのcreate-only slot
  (`allowOverwrite:false`)で最大費用を原子的に予約
- Local live testは`fs`の`wx`で同じ競合制御
- 残存cap、既使用額、公式価格、適用日、最大見積、hard-limit状態が
  揃わなければfail closed
- actual costを照合できない予約は保持し、同surfaceの次回実行を停止
- paid fallbackとauto top-upは常にfalse、billable concurrencyは1、
  automatic retryは0
- このlocal guardはprovider側の価格変更や別tabの利用を完全には防げない。
  provider側credit-only / hard spending limitも必須

## Vercel / Web稼働

- 役割: localhostではなくWebで稼働
- private storage: `lib/store.ts` でVercel Blobのprivate JSONを使用
- 公開ページ: `app/c/[cardId]/page.tsx`
- 公式資料:
  - <https://vercel.com/docs/vercel-blob/private-storage>
  - <https://vercel.com/docs/vercel-blob/server-upload>

## 実行モードの意味

- `LIVE`: 現在のAPI呼び出しが検証済みで成功
- `VERIFIED SAMPLE`: ライブ試行ではなく、検証済みfixtureを明示的に使用
- `FALLBACK`: ライブ試行後の失敗を明示。実動画はその動画のフレームだけを残して全項目を未確認にする
- `NOT CONFIGURED`: キーやモデルが未設定。未設定を隠さない

HTTP 200だけでは`LIVE`にしない。schemaとprovider固有のsemantic evidenceが
検証され、実際に結果へ反映された場合だけ`LIVE`とする。認証、quota、
rate limit、timeout、transport、schema、semantic、budget、lifecycleは
closed error codeで区別し、生のprovider responseやexceptionは表示しない。
