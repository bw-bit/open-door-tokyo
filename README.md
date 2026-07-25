# OPEN DOOR TOKYO

電話せず、行く前に判断できる情報へ。

店舗の短いガイド動画から4枚の時刻付き画像を自動抽出し、入口・通路・席・
コミュニケーション方法を整理して、画像付きの来店前アクセス案内を公開する
AIエージェントです。店舗を「利用可能」と認定するのではなく、AI観察、
幅付きの参考推定、スタッフが測定・回答した事実、未確認事項を分けて示します。

本番デモ: https://open-door-tokyo.vercel.app

## デモで起きること

1. スマートフォンで撮影した MP4 / MOV の店舗ツアー動画を入力
2. 最大4枚の代表フレームを端末内で抽出し、分析中・店舗確認・公開ページに同じ画像を表示
3. Qwen 3.7 Plus が動画ファイルを直接理解し、観察事実、幅付き参考推定、未確認事項を構造化
4. 接続時は Nosana がGPU証拠フレーム索引ジョブを実行・追跡
5. 決定論ルールが「車椅子で利用可能」という根拠不足の断定を停止し、接続時は GMI Cloud が再監査
6. 店舗スタッフがAIの記述を手動修正し、入口幅などを測定・確認
7. 接続時は ai& が日英表現を確認
8. 接続時は Daytona が公開カードを隔離サンドボックスで検査
9. 人が明示的に公開し、QR、公開URL、Google掲載文、iframe埋め込みを生成
10. 接続時は署名付きWebhookで利用者向けマップへ冪等に自動掲載

各サービスは `実API`、`検証済みサンプル`、`安全フォールバック`、`未接続`
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
- 安全ルール・状態遷移・プロバイダー表示: 125 tests pass
- ブラウザ一連操作: desktop / mobile、12 tests pass
  （モバイル専用2ケースはdesktop projectで意図的にskip）
- Next.js production build: pass
- production dependencies: 0 vulnerabilities
- 読取接続: ai& / Daytona / GMI / Nosana / Qoder は認証成功
- Qwen読取接続: 公式intl既定tupleでread-only `/models`認証に成功し、
  `qwen3.7-plus`と固定版`qwen3.7-plus-2026-05-26`の利用可能性を確認
- Qwen生成境界: 直接動画テストは1リクエスト最大11セント、同時実行1、
  再試行なしの永続クレジットガードで保護
  （provider側のhard limitは利用不可のため、アプリ側ガードの範囲）
- Qwen実動画proof: 提供されたトイレ動画を`video_url`で
  `qwen3.7-plus`へ直接入力し、同時に4枚の証拠フレームを保存。
  `LIVE` / `SCHEMA + SEMANTIC PASS`、22.247秒、再試行0。
  表示、床切替、通路幅、設備、手すりの5件を根拠フレーム付きで採用

## データ安全性

- APIキーはサーバー側環境変数だけで扱います。
- Vercel Blob を使う場合、カードJSONは private Blob として保存します。
- ブラウザへキーや生のプロバイダー応答を返しません。
- クレジットガードは、既知の最大費用をprivate Blobのcreate-only slotへ
  永続予約してから課金処理を始めます。paid fallback、auto top-up、
  automatic retryは無効です。
- 包括的なアクセシビリティ認定、WCAG適合、法令適合を生成しません。
- 必須事実の店舗確認、明示的な同意、10分有効のサーバー署名付き承認が揃うまで公開APIは拒否します。
- 利用者向けマップ連携は、共有秘密によるHMAC署名、固定イベント名、
  カードID由来の冪等キーを付けた1回だけのWebhookです。接続先がなければ
  外部送信せず、公開URL・Google掲載文・埋め込みHTMLだけを表示します。
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
- `lib/listing-webhook.ts`: 利用者向けマップへの署名付き自動掲載
- `fixtures/`: 成功済みデモデータ
- `docs/DEMO_SCRIPT.md`: 3分台本
- `docs/RUNBOOK.md`: 当日運用
- `docs/SUBMISSION_COPY.md`: 提出フォーム用の日英コピー
- `docs/SPONSOR_INTEGRATIONS.md`: 審査員向けコード索引
- `docs/OPUS5_IMPLEMENTATION_PLAN.md`: Opus 5が作成した実装計画
- `docs/OPUS5_FINAL_ACCEPTANCE.md`: Opus 5の最終PASS判定
- `outputs/submission/open-door-tokyo-deck.pdf`: 提出用8ページPDF
- `outputs/submission/open-door-tokyo-deck-ja.pdf`: 日本語版8ページPDF
- `outputs/submission/open-door-tokyo-demo-final.mp4`: 47秒の最終デモ
  （実Qwen proof + 検証済み公開フロー）

## 実装構成

```text
動画 / 代表フレーム / 音声
  → Qwen: 観察事実・幅付き参考推定・未確認項目
  → Nosana: GPU証拠フレーム索引
  → 決定論ルール + GMI: 断定表現の監査
  → 店舗スタッフの測定・回答
  → ai&: 日英表現確認
  → Daytona: 隔離サンドボックス検査
  → 人が公開
  → 画像付き来店前アクセス案内 + QR + 利用者向け地図
```

プロダクトの原則は一つです。

> 認定ではなく、判断材料を。
