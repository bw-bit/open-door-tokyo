/goal
以下の実装を完了してください。調査だけで終わらず、必要なコード変更・テスト・確認まで行い、実装完了状態にしてください。

## 目的

OPEN DOOR TOKYOの全課金APIより手前に置く、永続・原子的・fail-closedなスポンサー・クレジットガードと、秘密値を返さない設定／health境界を実装する。

## 先に読むもの

1. `docs/OPUS5_LIVE_API_REDESIGN.md`
2. `docs/HACKATHON_API_INTEGRATION_CONSTRAINTS.md`
3. 凍結済みの `lib/guard/types.ts`
4. 凍結済みの `lib/providers/contract.ts`

## 対象ファイル（この範囲だけ変更可）

- 新規 `lib/guard/policy.ts`
- 新規 `lib/guard/store-blob.ts`
- 新規 `lib/guard/store-file.ts`
- 新規 `lib/guard/index.ts`
- 新規 `lib/env.ts`
- 新規 `scripts/with-secrets.sh`
- `app/api/health/providers/route.ts`
- `.env.example`
- `vitest.config.ts`
- 新規 `vitest.live.config.ts`
- 新規 `tests/guard.test.ts`
- `package.json`（`dev:live` と `test:live` のscripts追加だけ）

## 変更禁止

- `lib/providers/**`
- `lib/guard/types.ts`
- `lib/types.ts`
- `lib/status.ts`
- `app/api/analyze/**`
- `app/api/confirm/**`
- `app/api/publish/**`
- `app/api/nosana/**`
- `components/**`
- `lib/safety/**`
- `lib/approval.ts`
- `lib/store.ts`
- `docs/**`
- 既存fixture

必要な凍結契約変更がある場合は編集せず、最終報告でブロッカーとして示す。

## 必須公開インターフェース

`lib/guard/index.ts` は以下をexportする:

```ts
export type {
  BillableSurface,
  GuardStatus,
  ReserveResult
} from "./types";

export async function reserve(input: {
  surface: BillableSurface;
  maxCostUsd: number;
  idempotencyKey: string;
}): Promise<ReserveResult>;

export async function reconcile(input: {
  reservationId: string;
  actualCostUsd: number | null;
}): Promise<{ ok: true } | { ok: false; code: "unknown_usage" | "store_unavailable" }>;

export async function guardStatus(
  surface: BillableSurface
): Promise<GuardStatus>;
```

## 実装要件

1. Productionはprivate Vercel Blobのcreate-only slotを使う。
   - `addRandomSuffix:false`
   - `allowOverwrite:false`
   - `access:"private"`
2. Local/testは設定ディレクトリに対する`fs`の`wx`で同じ競合制御をする。
3. 予約スロットは `guard/<surface>/<yyyymm>/<slot>.json` 相当。
4. 部分予約失敗は削除して再利用せず、abandoned markerを残す。
5. `actualCostUsd:null` は予約を保持し、`outstanding_unreconciled` により次回を停止。
6. 1つのbillable actionだけが進めるglobal concurrency lockをcreate-onlyで取る。既知のreconcile完了後だけ解放できる。未知状態はlockを保持する。
7. 各surfaceについて以下の非秘密設定が揃わなければ対応コードで拒否:
   - native unit
   - confirmed remaining sponsor cap allocated to this app
   - spent snapshot
   - slot cost
   - conservative max action cost
   - official price source URL and effective date
   - hard-limit state
8. hard-limit=`unavailable` は明示的なoperator acknowledgementがなければ `hard_limit_unknown`。
9. paid fallback、auto top-upはコード上false、billable concurrencyは1で環境変数から変更不可。
10. `guardStatus()` とhealthは秘密値、長さ、prefix、hash、URL中のcredential、env dumpを返さない。
11. `lib/env.ts` はpresence-only health用APIを提供し、credential値を呼び出し元へ返さない。
12. `scripts/with-secrets.sh` はKeychainから子プロセスenvへ渡すだけ。値を表示しない、`set -x`禁止、ファイルへ保存禁止。
13. `.env.example` は値なしの変数名と説明だけ。Qwen canonical keyは`DASHSCOPE_API_KEY`、alias `QWEN_API_KEY`はdeprecatedとして残す。
14. live testsを通常`npm test`から除外する。
15. このWPでは外部ネットワークを一切呼ばない。

## 完了条件

- cap / price / estimate / hard-limit / store不明がそれぞれ正しいfailure codeになる。
- 最後の1slotを2並列で実予約し、成功が厳密に1件。
- unknown reconciliation後の次予約が`outstanding_unreconciled`。
- health JSONの値はboolean、integer、closed enumのみ。
- `npm run typecheck`、`npm test`が通る。ただし並列WPの未完了に起因する一時的エラーは、対象ファイル完成後に再試行してよい。

## テスト

`tests/guard.test.ts`に少なくとも以下を含める:

- 全fail-closed設定
- parallel `wx` race
- create-only slot exhaustion
- partial reservationのabandoned marker
- known / unknown reconciliation
- month partition
- global concurrency lock
- health出力key/value型
- networkが呼ばれていないこと

## 出力してほしい内容

- 変更ファイル
- 実装要約
- 実行したテストと結果
- 凍結契約の不足、残る懸念

