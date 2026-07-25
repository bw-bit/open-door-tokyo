# Qoder当日タスク

## Expert Panel 1: API Integration

目的: 各社ワークショップの正確なモデルIDとレスポンス形式にアダプターを合わせる。

対象:

- `lib/providers/qwen.ts`
- `lib/providers/gmi.ts`
- `lib/providers/aiand.ts`
- `lib/providers/nosana.ts`
- `lib/providers/daytona.ts`

完了条件:

- キーをコミットしない
- 5社すべてのtraceが `LIVE` / `FALLBACK` / `NOT CONFIGURED` を正直に返す
- `npm run verify` が成功

## Expert Panel 2: Safety Review

目的: 認定、適合、包括的利用可否を生成しないことを確認する。

対象:

- `lib/safety/deterministic.ts`
- `tests/safety.test.ts`
- `app/api/publish/route.ts`

完了条件:

- 20件の禁止表現テストが成功
- 人の明示確認なしでは公開APIが400
- 必須事実未確認では公開APIが409

## Expert Panel 3: Demo Resilience

目的: 会場ネットワークやAPI障害でも3分デモを続行できるようにする。

対象:

- `fixtures/`
- `components/provider-trace.tsx`
- `docs/RUNBOOK.md`
- `tests/e2e/demo-flow.spec.ts`

完了条件:

- キーなしで一連デモが成功
- desktop/mobile E2Eが成功
- fallbackをliveと誤表示しない

## Repo Wikiで作るページ

- Product Thesis
- Agent State Machine
- Evidence and Provenance Model
- Safety and Human Approval
- Sponsor Integrations
- Demo and Failure Recovery

