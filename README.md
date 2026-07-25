# OPEN DOOR TOKYO

入口から席までを、行く前に分かる情報へ。

店舗の短いガイド動画から、入口・通路・席・コミュニケーション方法を整理し、根拠付きの日英 Access Card を公開するAIエージェントです。店舗を「利用可能」と認定するのではなく、映像で観察した事実、スタッフが測定・回答した事実、未確認事項を分けて示します。

本番デモ: https://open-door-tokyo.vercel.app

## デモで起きること

1. 20秒の店舗ツアー動画を入力
2. Qwen が動画フレームから観察事実と未確認事項を構造化
3. Nosana がGPU証拠フレーム索引ジョブを実行・追跡
4. GMI Cloud と決定論ルールが「車椅子で利用可能」という根拠不足の断定を停止
5. 店舗スタッフが入口幅などを測定・確認
6. ai& が日英表現を確認
7. Daytona が公開カードを隔離サンドボックスで検査
8. 人が明示的に公開し、QRコードから日英 Access Card を表示

各サービスは `LIVE`、`VERIFIED SAMPLE`、`FALLBACK`、`NOT CONFIGURED`
のいずれかを実行履歴に表示します。サンプル、ライブ失敗、未設定を混同しません。

## ローカル起動

```bash
npm install
npm run dev
```

サンプルデモはAPIキーなしで動きます。
ライブ接続時はAPIキーをmacOS Keychainから子プロセスへ注入し、ファイルへ
保存しません。残存スポンサー枠と現在価格を確認できないproviderは呼びません。

- 撮影画面: `http://localhost:3000/capture`
- 証拠レビュー: `http://localhost:3000/review/demo-cafe`
- 公開カード: `http://localhost:3000/c/demo-cafe`
- 接続状態: `http://localhost:3000/api/health/providers`

## 検証

```bash
npm run verify
npm run test:e2e
npm run preflight:readonly
npm audit --omit=dev
```

`preflight:readonly` は、Keychainから1社分だけを子プロセスへ注入し、
公式の読取専用エンドポイントを逐次1回だけ確認します。推論、GPUジョブ、
サンドボックス作成は行わず、生の応答本文や秘密値も表示しません。

検証済み結果:

- TypeScript: pass
- 安全ルール・状態遷移・プロバイダー表示: 74 tests pass
- ブラウザ一連操作: desktop / mobile、8 tests pass
- Next.js production build: pass
- production dependencies: 0 vulnerabilities
- 読取接続: ai& / Daytona / GMI / Nosana / Qoder は認証成功
- Qwen読取接続: 公式intl既定tupleでread-only `/models`認証を実行可能
  （推論はguard readyになるまで未実行）

## データ安全性

- APIキーはサーバー側環境変数だけで扱います。
- Vercel Blob を使う場合、カードJSONは private Blob として保存します。
- ブラウザへキーや生のプロバイダー応答を返しません。
- クレジットガードは、既知の最大費用をprivate Blobのcreate-only slotへ
  永続予約してから課金処理を始めます。paid fallback、auto top-up、
  automatic retryは無効です。
- 包括的なアクセシビリティ認定、WCAG適合、法令適合を生成しません。
- 必須事実の店舗確認、明示的な同意、10分有効のサーバー署名付き承認が揃うまで公開APIは拒否します。
- Nosanaの接続確認は既存jobのread-only `jobs.get()`だけです。有料GPU
  ジョブ投稿は管理秘密、既知quote、残存cap、provider hard limit、
  明示確認、冪等キー、永続予約が揃う専用APIに隔離し、通常デモでは呼びません。

## 主要ファイル

- `app/capture/page.tsx`: 動画入力
- `app/review/[cardId]/page.tsx`: Evidence Review
- `app/c/[cardId]/page.tsx`: 公開 Access Card
- `lib/safety/deterministic.ts`: 禁止断定の決定論ブロック
- `lib/providers/`: 5社のサーバー側アダプター
- `app/api/publish/route.ts`: 人の明示確認を必須にする公開ゲート
- `fixtures/`: 成功済みデモデータ
- `docs/DEMO_SCRIPT.md`: 3分台本
- `docs/RUNBOOK.md`: 当日運用
- `docs/SUBMISSION_COPY.md`: 提出フォーム用の日英コピー
- `docs/SPONSOR_INTEGRATIONS.md`: 審査員向けコード索引
- `docs/OPUS5_IMPLEMENTATION_PLAN.md`: Opus 5が作成した実装計画
- `docs/OPUS5_FINAL_ACCEPTANCE.md`: Opus 5の最終PASS判定

## 実装構成

```text
動画 / 代表フレーム / 音声
  → Qwen: 観察事実・未確認項目
  → Nosana: GPU証拠フレーム索引
  → 決定論ルール + GMI: 断定表現の監査
  → 店舗スタッフの測定・回答
  → ai&: 日英表現確認
  → Daytona: 隔離サンドボックス検査
  → 人が公開
  → 証拠付き日英 Access Card + QR
```

プロダクトの原則は一つです。

> We do not certify. We clarify.
