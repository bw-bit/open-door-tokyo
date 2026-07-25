/goal
以下の実装を完了してください。調査だけで終わらず、必要なコード変更・テスト・確認まで行い、実装完了状態にしてください。

## 目的

OPEN DOOR TOKYOの既存3画面と公開ゲートを壊さず、billable providerの逐次実行、server-side sample判定、正直なtrace UI、定量的根拠のないconfidence表示の除去を実装する。

## 先に読むもの

1. `docs/OPUS5_LIVE_API_REDESIGN.md`
2. `docs/HACKATHON_API_INTEGRATION_CONSTRAINTS.md`
3. 凍結済みの `lib/providers/contract.ts`
4. 凍結済みの `lib/types.ts`
5. 既存 `tests/e2e/demo-flow.spec.ts`

## 対象ファイル（この範囲だけ変更可）

- `app/api/analyze/route.ts`
- `app/api/confirm/route.ts`
- `components/provider-trace.tsx`
- `components/evidence-row.tsx`
- `components/capture-client.tsx`
- `app/globals.css`（関連classのみ）
- `tests/e2e/demo-flow.spec.ts`
- 必要なら新規 `tests/orchestration.test.ts`

## 変更禁止

- `lib/providers/**`
- `lib/guard/**`
- `lib/types.ts`
- `lib/status.ts`
- `lib/store.ts`
- `lib/confirmation.ts`
- `lib/safety/**`
- `lib/approval.ts`
- `app/api/publish/**`
- `app/api/health/**`
- `app/api/nosana/**`
- その他のcomponents
- `docs/**`
- `.env*`
- `package.json`
- 既存fixture

既存のsample publishデモ、10分approval token、deterministic publish gateを維持する。必要な凍結契約変更は編集せず報告する。

## 実装要件

1. `/api/analyze`:
   - Qwen → GMI → Nosanaを逐次実行
   - 同じmutable cardを並列adapterへ渡さない
   - billable operationを`Promise.all`に入れない
2. `useFixture`を単独で信用しない。sample扱いは少なくとも:
   - 全frameがfixtureUrl
   - dataUrlが1つもない
   - 許可されたsample card id
   をserver側で満たす場合だけ。`useFixture:true` + dataUrlはreal uploadとしてfail closed。
3. `/api/confirm`のai& → Daytonaは逐次のまま維持。生error messageをAPI responseに返さずclosed static codeへ変更。
4. `capture-client.tsx`のreal-upload frameは最長辺512px、JPEG quality 0.6以下、最大4枚。sample fixture URLは変えない。
5. Agent Trace rail:
   - provider
   - purpose
   - LIVE / VERIFIED SAMPLE / FALLBACK / NOT CONFIGURED
   - latency
   - opaque request/job reference
   - validation result
   を既存rail内だけに表示。
6. raw response、raw error、credential情報、confidence percentageは表示しない。
7. evidence rowの`CONFIDENCE xx%`を、AI観察／スタッフ実測／未確認など既存provenance/statusに基づく定性的なSOURCE表示へ変更。
8. 既存navy/teal/white、Mincho、赤いblocked claimと緑のrewriteを維持。新panel、gradient、glass、emoji、logo wallを追加しない。
9. fake progress durationを追加しない。
10. sample publish E2Eとreal-upload fail-closed E2Eを壊さない。

## 完了条件

- API routeにprovider同時実行がない。
- `useFixture:true` + dataUrlのunit/API testがreal pathになる。
- `components/evidence-row.tsx`に`%`表示がない。
- railが4 modeを表示でき、生errorを描画しない。
- upload frame boundがtestまたは実装上明白。
- 既存6 Playwright testsが通り、additive testでsample railがFALLBACKではない。
- `npm run typecheck`が通る。

## 出力してほしい内容

- 変更ファイル
- 実装要約
- 実行したテストと結果
- visual identityを維持した根拠
- 凍結契約の不足、残る懸念

