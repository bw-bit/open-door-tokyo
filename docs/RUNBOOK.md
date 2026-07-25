# 当日ランブック

## 0. デモ成功の定義

`/capture` のサンプルから始め、断定ブロックを見せ、店舗確認、Daytona監査、公開、QRからスマホカード表示まで3分以内に到達する。

## 1. 10:00まで

- Qoder と Qwen Cloud のクレジット申請が反映されているか確認
- 充電器、テザリング、HDMI変換、予備ブラウザを用意
- このリポジトリと `docs/OPUS5_IMPLEMENTATION_PLAN.md` を開く
- `npm run verify` と `npm run test:e2e` を実行
- `/capture`、`/review/demo-cafe`、`/c/demo-cafe` を別タブで開く
- 20秒動画がローカル再生できることを確認

## 2. 10:45 技術ワークショップ

各社について、次の**非秘密情報**を先に記録する。推測したモデルIDや
別リージョンのURLを使わない。

- 正確な製品surface、base URL、model / job / target ID
- Qwenは公式intl既定
  (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`,
  `qwen3.6-flash`)を使う。workspace routingが必要な場合だけ
  `QWEN_WORKSPACE_ID`を設定
- このアプリ専用に割り当てた残存スポンサー枠
- 既使用額、保守的な1回最大費用、公式価格URLと適用日
- provider側のcredit-only / hard spending limitの状態
- paid fallbackとauto top-upが無効であること

Daytonaの100米ドルとGMI Cloudの10米ドルは当初の配布額であり、そのまま
現在の残存枠とは扱わない。手動利用分を引いた現在値をsurfaceごとに確認する。
上限・価格・最大見積・hard-limit状態の一つでも不明なら、そのproviderは
`NOT CONFIGURED`のままにする。

APIキーはチャットや `.env.local` に貼らず、運営者がmacOS Keychainへ直接入力する。

```bash
security add-generic-password -s open-door-tokyo -a DASHSCOPE_API_KEY -w
security add-generic-password -s open-door-tokyo -a GMI_API_KEY -w
security add-generic-password -s open-door-tokyo -a AIAND_API_KEY -w
security add-generic-password -s open-door-tokyo -a DAYTONA_API_KEY -w
security add-generic-password -s open-door-tokyo -a NOSANA_API_KEY -w
```

値を表示せず、存在だけを確認する。

```bash
security find-generic-password -s open-door-tokyo -a DASHSCOPE_API_KEY >/dev/null
```

本番は `vercel env add <NAME> production` へ値を対話入力し、追加後に必ず
再デプロイする。`vercel env pull`、環境変数のdump、prefix/hash/長さの表示は禁止。
接続前に `GET /api/health/providers` を開く。返るのは設定有無とクレジットガード
のclosedな状態だけで、キー値は返らない。

## 3. 11:30 プロジェクトセットアップ

優先順位:

1. Vercel本番URLを確保
2. `GET /api/health/providers` で秘密値なしのreadinessを確認
3. ガード済みlive contract suiteを**一度だけ**直列実行
4. Qwenの固定64-token JSON proofを1回検証
5. GMIの固定claim auditを1回検証
6. ai&の固定bilingual reviewを1回検証
7. Daytonaのephemeral sandboxを1回だけ作り、`finally`削除を確認
8. Nosanaは既存 `NOSANA_JOB_ID` を `jobs.get()` で読み取るだけ

```bash
RUN_LIVE_PROVIDER_TESTS=1 npm run test:live
```

この実行は、Keychainから子プロセスへ秘密を渡し、各surfaceの永続予約が
成功した場合だけ外部処理を開始する。自動再試行は0、同時billable処理は1。
402、quota不足、429、timeout、schema不正が出てもその場で停止し、別modelへ
切り替えない。

Nosanaの `jobs.list()` はインストール済みSDKでは読み取りではなく、
creditsを使うbulk-createである。接続確認には絶対に使わない。
GPUジョブ投稿はデモの必須条件ではない。正確なquote、market/bid/runtime、
残存cap、provider側hard limit、人間の明示確認、冪等キー、永続予約が揃った
場合だけ管理APIから1回行う。どれか不明なら投稿しない。

## 4. 13:00 中間ゲート

以下の一つでも失敗していたら、機能追加を止めてデモ復旧へ移る。

- 本番URLがスマホ回線から開く
- サンプル解析がレビュー画面へ遷移する
- 「車椅子で利用可能」が赤いブロックとして表示される
- 店舗確認後に公開ボタンが有効になる
- 公開カードに「未確認」と免責が残る
- QRコードが現在の本番URLを指す

## 5. 15:00 デモ固定

- 本番URLを再度スマホで開く
- 成功済みの `/review/demo-cafe` を予備タブに固定
- 成功済みの `/c/demo-cafe` をスマホのホーム画面へ追加
- サンプルは `VERIFIED SAMPLE`、試行後の障害だけが `FALLBACK`、
  未設定は `NOT CONFIGURED` と表示されることを確認
- 画面録画を30秒だけ作成
- `docs/DEMO_SCRIPT.md` を2回通し、2分45秒以内にする
- 提出URLとGitHub URLをクリップボード用メモへ置く

## 6. 15:45 最終チェック

```bash
npm run verify
npm run test:e2e
npm run preflight:readonly
npm audit --omit=dev
```

ブラウザで以下を確認する。

- Console error なし
- 画面倍率100%
- 通知をオフ
- パスワードやAPIキーのタブを閉じる
- QRコードを会場Wi-Fi以外の回線で読む

## 7. 障害時の切替

### Qwen / GMI / ai& が失敗

ライブ試行後の失敗は `FALLBACK` と表示する。サンプルを使っている場合は
`VERIFIED SAMPLE` と表示し、失敗したライブ結果と混同しない。

> API障害はFALLBACKとして明示し、デモ自体は検証済みサンプルで継続しています。

### Daytona が失敗

画面には `FALLBACK` と検査未実行を表示し、決定論の公開ゲートだけで継続する。
削除結果が不明なら `lifecycle_unknown` として以後のsandbox作成を停止する。
コードは `lib/providers/daytona.ts` を開いて見せる。

### Nosana が遅い

デモのクリティカルパスから外している。事前ジョブIDと結果を表示し、投稿APIコードを見せる。

### Vercelが開かない

スマホの成功済みタブを見せ、PCではlocalhostを実演する。ただし提出前に本番復旧を最優先する。

## 8. やらないこと

- 実在店舗を無断で公開しない
- 「完全バリアフリー」「車椅子対応」「WCAG準拠」と断定しない
- APIキーを画面、ログ、README、コミットへ出さない
- APIキーのprefix、hash、長さも証拠として表示しない
- 残存cap、価格、最大見積、hard-limit状態が不明な処理を投稿しない
- 402、quota不足、timeout、非同期job失敗を自動再試行しない
- Nosanaの `jobs.list()` を状態確認に使わない
- provider側のpaid fallback / auto top-upを有効にしない
- デモ直前にデザインや依存関係を大きく変更しない
