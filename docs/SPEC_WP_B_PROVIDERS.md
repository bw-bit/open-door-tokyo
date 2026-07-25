/goal
以下の実装を完了してください。調査だけで終わらず、必要なコード変更・テスト・確認まで行い、実装完了状態にしてください。

## 目的

Qwen、GMI、ai&、Daytona、Nosanaの既存アダプターを、閉じたエラー分類、スポンサー・クレジット予約、再試行ゼロ、意味検証、正直なexecution modeに対応させ、明示ゲート付きlive contract testを用意する。

## 先に読むもの

1. `docs/OPUS5_LIVE_API_REDESIGN.md`
2. `docs/HACKATHON_API_INTEGRATION_CONSTRAINTS.md`
3. 凍結済みの `lib/providers/contract.ts`
4. 凍結済みの `lib/guard/types.ts`
5. WP-Aが実装する `lib/guard/index.ts` のSPEC上の公開interface

## 対象ファイル（この範囲だけ変更可）

- `lib/providers/shared.ts`
- `lib/providers/qwen.ts`
- `lib/providers/gmi.ts`
- `lib/providers/aiand.ts`
- `lib/providers/daytona.ts`
- `lib/providers/nosana.ts`
- `lib/providers/index.ts`
- `app/api/nosana/submit/route.ts`
- `tests/provider-honesty.test.ts`
- 新規 `tests/live/qwen.contract.test.ts`
- 新規 `tests/live/gmi.contract.test.ts`
- 新規 `tests/live/aiand.contract.test.ts`
- 新規 `tests/live/daytona.contract.test.ts`
- 新規 `tests/live/nosana.contract.test.ts`
- 必要なら新規 `tests/provider-adapters.test.ts`

## 変更禁止

- `lib/providers/contract.ts`
- `lib/guard/**`
- `lib/types.ts`
- `lib/status.ts`
- `app/api/analyze/**`
- `app/api/confirm/**`
- `app/api/publish/**`
- `app/api/health/**`
- `components/**`
- `app/globals.css`
- `lib/store.ts`
- `lib/confirmation.ts`
- `lib/safety/**`
- `lib/approval.ts`
- `docs/**`
- `.env*`
- `package.json`
- 既存fixture

必要な凍結契約変更がある場合は編集せず、最終報告でブロッカーとして示す。

## 実装要件

1. `shared.ts`でclosed `ProviderErrorCode`へ分類し、provider/SDKの生文字列をtrace、card、API response、logへ流さない。
2. `openAICompatibleChat`:
   - `maxTokens`必須
   - 1回だけfetch
   - bounded timeout
   - retry/backoff/fallback modelなし
   - usage、model、request idを安全な型で返せる
   - 401/403、402/quota、429、timeout、transport、schema、model-not-foundを区別
3. すべてのbillable callは `reserve()` 成功後だけ実行し、完了後 `reconcile()`。最大費用が不明なら呼ばない。
4. runtime上限:
   - Qwen/GMI/ai& outputは最大768 tokens
   - proofは64 tokens
   - Qwen画像は最大4枚、総payload byte capをcall前に検査
5. sample pathは `verified_sample`。live call失敗だけが`fallback`。未設定は`not_configured`。
6. failure traceは`ok:false`、closed error code、static localized detail、validation=`failed|not_run`。生例外文字列禁止。
7. LIVEはschemaとprovider-specific semantic evidenceを通り、実際に結果へ影響した場合だけ。
8. Daytona:
   - 最大1 ephemeral sandbox
   - ttl 10分、code run 30秒
   - create後は成功・失敗に関わらず`finally`でdeleteを1回試行
   - delete outcome不明なら`lifecycle_unknown`として以後のcreateをfail closed
   - `DAYTONA_API_URL`/`DAYTONA_TARGET`をSDK対応範囲で適用。SDKに存在しない設定は推測せずclosed config error。
9. Nosana:
   - 通常index/proofは`jobs.get(NOSANA_JOB_ID)`のみ
   - read-only pathで`jobs.list()`を絶対に呼ばない
   - paid submit関数は`postPaidNosanaJob`のように明示命名
   - explicit quote、market/bid/runtime、human confirmation、idempotency key、guard reservation、response schema validationが揃わない限りsubmit禁止
   - installed SDKで`jobs.list()`がpaid bulk-createであるコメントを残す
10. Nosana submit routeはconstant-time secret comparison、closed response code、生error禁止。
11. Qoderをruntime enum、trace、healthへ追加しない。
12. live contract tests:
   - `RUN_LIVE_PROVIDER_TESTS=1`なしではskip
   - guardが許可しない限りcallしない
   - 1 providerにつき最大1 outbound action
   - Qwen/GMI/ai&は固定64-token JSON proof
   - Daytonaは1 sandboxを必ずdelete
   - Nosanaは既存jobのread-only getだけ
   - secretsやraw bodyをreport/consoleへ出さない
13. このWPの通常unit testでは外部ネットワークを呼ばない。

## 完了条件

- 429と500をstubしたテストでfetch回数は各1。
- failure traceにcaught errorのsubstringが一切ない。
- fixtureから`fallback`へ行く経路がない。
- Daytona codeRun rejectionでもdeleteが厳密に1回呼ばれる。
- Nosana read-only pathに`jobs.list()`がない。
- live testsは通常runでskip/exclude。
- `npm run typecheck`、provider unit testsが通る。

## 出力してほしい内容

- 変更ファイル
- 実装要約
- 実行したテストと結果
- 実API呼び出しを行っていないこと
- 凍結契約の不足、残る懸念

