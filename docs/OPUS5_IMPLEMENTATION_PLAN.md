# OPEN DOOR TOKYO 実装計画

> Claude Opus 5 / effort high による計画。2026-07-25作成。

## 1. DONEの機械的定義

**公開URL `https://<本番ドメイン>/c/<cardId>` を審査員のスマホで開くと、日英併記のAccess Cardが表示され、各事実をタップすると根拠（フレーム画像＋動画タイムスタンプ、またはスタッフ入力）が開き、未確認・矛盾項目と最終確認日が残ったまま見え、禁止表現ブロックの監査ログがサーバ側に記録されている状態が、16:00時点でインターネット越しに再現できること。**

## 2. 本命として続けるか

**続行（本命維持）。**

理由は3点。

1. 「AIが埋めない・別モデルが断定を止める」は動画要約系と別カテゴリに立つ差別化で、革新性軸を単独で取りにいける。
2. 心のバリアフリー認定制度が情報発信を条件に含むため実在業務であり、実課題軸と日本関連性軸を同時に満たす。
3. スポンサー5社が役割の必然性を持って入るため、統合の深さを短く説明できる。

ピボットのコストが最大の敵なので、以降は本案のみを詰める。

## 3. 勝つデモの物語

「行けるかは○×で決まらない。だが段差と幅が分からなければ、行くかどうかすら決められない」→ 撮影 → 抽出 → **AIが黙る** → 店主が測る → 公開。

**最も記憶に残る一点：GMI監査が `車椅子で利用可能` をその場でブロックし、`入口に1段、約8cmの段差があります。簡易スロープの利用にはスタッフへの声掛けが必要です` に書き換わる画面と監査ログ。**

「AIに何を言わせなかったか」を見せるデモは他チームと重ならない。副次の見せ場は「未確認：3件」がカードに残ること、Daytona上でalt欠落を検出→修正→再検査するループ。

## 4. スコープ

### P0

1. 画面1：店舗ブリーフ入力＋撮影ガイド表示＋動画アップロード
2. ブラウザ内フレーム抽出（6枚・固定タイムスタンプ・canvas）→サーバ保存
3. Qwen解析→厳格スキーマJSON（欠損は `unknown`。埋めない）
4. 決定論的な禁止表現フィルタ（正規表現＋語彙表）＝ネットワーク非依存の安全底板
5. 画面2：Evidence Review（確認済／要スタッフ確認／判断不能／矛盾の4分類）＋スタッフ入力
6. 画面3：Access Card（日英併記・根拠ドロワー・未確認/矛盾・最終確認日・QR）
7. 公開は人間の明示アクション（ボタン＋確認ダイアログ）でのみ発火
8. フィクスチャで全経路が動き、LIVE／FALLBACK／NOT CONFIGURED をUIに正直表示
9. Vercel本番デプロイ＋実機スマホでQR到達

### P1

P0が緑になってから、この順で追加する。

1. GMI監査（LLM版。P0フィルタの上乗せ）
2. ai&による日本語具体化
3. Daytonaでのカード実行・自動検査・alt修正・プレビューURL
4. Nosana文字起こし（常に任意、既定はフィクスチャ）
5. 不足項目からの再撮影リクエスト生成

### 明示的カット

認証・アカウント・複数店舗管理・DB（永続はBlob上JSONのみ）／サーバ側ffmpeg（音声抽出はP1のDaytonaのみ）／利用者プロフィール別ハイライト／トイレ適合判定／地図・検索／差分更新・通知・閲覧解析／スコアリング・認定バッジ・WCAG適合の主張。

## 5. アーキテクチャ

- **フロントエンド**：Next.js 15 App Router + TypeScript + Tailwind。`/capture`, `/review/[cardId]`, `/c/[cardId]` の3画面。フレーム抽出は `<video>`+`canvas` でクライアント実行し、サーバのffmpeg依存を消す。
- **サーバ/API**：Next.js Route Handlers（Node.jsランタイム）。`/api/ingest`, `/api/analyze`, `/api/confirm`, `/api/publish`, `/api/health/providers`。鍵は `import 'server-only'` 経由のみ。
- **ストレージ/状態**：Vercel Blob。`cards/<cardId>.json`（状態の正本）、`media/<cardId>/frame-*.jpg`、`media/<cardId>/source.mp4`。DBなし。`updatedAt` による楽観ロックのみ。フィクスチャはリポジトリ同梱。
- **メディア前処理**：クライアントで6枚（0/12/25/45/70/92%地点）JPEG化＋`tSec` 記録。音声はP1（Daytonaでffmpeg分離→Nosana）。既定は同梱トランスクリプト。
- **プロバイダアダプタ**：`lib/providers/{qwen,gmi,aiand,nosana,daytona}.ts`。全社が同一契約 `run(input): Promise<ProviderResult<T>>` を実装し、`mode: 'live'|'fallback'|'not_configured'`、`latencyMs`、`requestId` を必ず返す。ベースURL・モデルIDは環境変数境界（当日ドキュメントで確定）。
- **公開Access Card**：`/c/[cardId]` はSSRのみでJS無効でも本文が読める（根拠ドロワーは `<details>` で進行的強化）。QRはサーバ生成でdata URL埋め込み。
- **デプロイ**：Vercel（本番ドメイン固定、mainのみ運用）。Daytonaは「実行・検査・プレビュー証拠」に限定し、公開カードの提供元にはしない。

## 6. ステートマシン

```text
draft → uploading → frames_ready → transcribing(任意/失敗即fallback)
 → analyzing(Qwen。失敗→fixture解析) → auditing(決定論必須→GMI任意)
 → review(人間の画面。ここで止まるのが正常) → staff_confirmed
 → phrasing(ai&任意。失敗→テンプレ) → card_built
 → sandbox_checked(Daytona任意) → published(★人間の明示アクションのみ)
 ※ 任意状態から degraded へ落ち、degraded は review 以降へ復帰可
```

不変条件：`published` へは `staff_confirmed` 経由かつ `safetyAudit.blocked.length === 0` でなければ遷移不可（サーバ側で強制）。

## 7. 正準データモデル

```ts
export type FieldStatus =
  | 'ai_observed' | 'staff_stated' | 'staff_measured'
  | 'confirmed' | 'unknown' | 'conflict';
export type ProviderMode = 'live' | 'fallback' | 'not_configured';

export interface VenueBrief {
  cardId: string; name: string; category: 'cafe' | 'restaurant' | 'other';
  sourceUrl?: string; languages: ('ja' | 'en')[]; createdAt: string;
}

export interface Provenance {
  kind: 'video_frame' | 'audio_transcript' | 'staff_input' | 'system';
  frameId?: string; tSec?: number;
  transcriptSpan?: { startSec: number; endSec: number; text: string };
  staffLabel?: string;
  capturedAt: string;
}

export interface EvidenceItem {
  field: string;
  section: 'entrance' | 'path_to_seat' | 'communication' | 'restroom';
  label: { ja: string; en: string };
  value: string | number | boolean | null;
  unit?: 'cm' | 'step' | 'seat';
  status: FieldStatus;
  confidence: number;
  provenance: Provenance[];
  conflictWith?: { source: Provenance; value: string | number };
  lastVerifiedAt: string | null;
}

export interface SafetyAudit {
  passedDeterministic: boolean;
  blocked: {
    text: string;
    rule: string;
    suggestion: { ja: string; en: string };
  }[];
  llmVerdicts: {
    claim: string;
    verdict: 'supported' | 'unsupported';
    reason: string;
    rewrite?: { ja: string; en: string };
  }[];
  auditedBy: { deterministic: true; gmi: ProviderMode };
  auditedAt: string;
}

export interface ProviderTrace {
  provider: 'qwen' | 'gmi' | 'aiand' | 'nosana' | 'daytona';
  mode: ProviderMode;
  model?: string;
  requestId?: string;
  startedAt: string;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
}

export interface AccessCard {
  brief: VenueBrief;
  state:
    | 'draft' | 'frames_ready' | 'analyzing' | 'auditing' | 'review'
    | 'staff_confirmed' | 'card_built' | 'published' | 'degraded';
  items: EvidenceItem[];
  unknowns: string[];
  conflicts: string[];
  safetyAudit: SafetyAudit;
  traces: ProviderTrace[];
  sandbox?: {
    previewUrl?: string;
    checksRun: number;
    issuesFound: number;
    issuesFixed: number;
    humanReviewNeeded: number;
  };
  frames: {
    frameId: string;
    tSec: number;
    url: string;
    alt: { ja: string; en: string };
  }[];
  publishedAt: string | null;
  lastVerifiedAt: string | null;
  updatedAt: string;
}
```

## 8. プロバイダ別コントラクト

| Provider | 入力 | 出力 | Timeout | Retry | Fallback | 審査員に見せる証拠 |
|---|---|---|---|---|---|---|
| Qwen Cloud | frames 6枚＋transcript＋category＋厳格JSON schema | `EvidenceItem[]`候補＋`unknown`列挙＋追加質問 | 25s | 1回 | `fixtures/demo-cafe.analysis.json`で `mode:'fallback'` | 生JSON＋trace（model/latency/requestId）を解析ログに表示 |
| GMI Cloud | 主張文リスト＋根拠有無 | `llmVerdicts[]`（supported/unsupported＋rewrite） | 15s | 0回 | 決定論フィルタのみで続行 | ブロック済み主張カードにモデル名と理由文 |
| ai& | 確定fact配列＋トーン指示 | ja/enの具体文＋追加質問 | 15s | 0回 | `lib/phrasing/template.ts` | 生成前/後の日本語対比1件 |
| Nosana | 音声＋ASRコンテナジョブ定義 | 時刻付きtranscript | 40s | 0回 | 同梱トランスクリプト | ジョブIDと状態遷移ログ。失敗しても停止しない |
| Daytona | カードHTML一式＋検査スクリプト | 検査サマリ＋修正diff＋プレビューURL | 90s | 0回 | 検査「未実行」表示で公開継続 | 検査前後の件数、alt修正diff、プレビューURL |
| Qoder | 開発作業 | Experts ModeとRepo Wiki | - | - | - | 分担スクショ、Repo Wiki URL |

共通則：`PROVIDER_<NAME>_BASE_URL` / `_API_KEY` / `_MODEL` が未設定なら即 `not_configured` を返し、UIはグレー表示。**アダプタが存在することと、ライブ呼び出しが検証済みであることを画面上で必ず区別する。**

## 9. リポジトリ構成

```text
open-door-tokyo/
  app/capture/page.tsx
  app/review/[cardId]/page.tsx
  app/c/[cardId]/page.tsx
  app/api/ingest/route.ts
  app/api/analyze/route.ts
  app/api/confirm/route.ts
  app/api/publish/route.ts
  app/api/health/providers/route.ts
  lib/types.ts
  lib/store.ts
  lib/frames.ts
  lib/safety/deterministic.ts
  lib/safety/audit.ts
  lib/phrasing/template.ts
  lib/providers/*.ts
  lib/providers/registry.ts
  fixtures/
  components/
  tests/
  docs/
```

## 10. 事前実装シーケンス

1. `lib/types.ts` 確定
2. `fixtures/*`（20秒動画＋解析JSON＋トランスクリプト）
3. `lib/safety/deterministic.ts` ＋ vitest 20ケース
4. `lib/store.ts` ＋ `api/ingest`
5. **画面3 → 画面2 → 画面1 の順**で実装
6. `providers/registry.ts` ＋ 5アダプタの契約とfallback経路
7. `api/analyze` オーケストレーション
8. Playwright E2E：アップロード→レビュー→公開→`/c/<id>`
9. Vercel本番デプロイ＋ドメイン確定＋QR実機確認
10. `RUNBOOK.md` / `DEMO_SCRIPT.md` 作成、通し練習1回

当日クレデンシャル到着前に完了できない項目：各社の実モデルID・実エンドポイント・認証ヘッダ形式、ライブのレイテンシ実測、Nosanaジョブ定義の実行可否、Daytonaサンドボックス起動時間。これらは `.env.example` と `/api/health/providers` の形で穴だけ空けておく。

## 11. 当日ランブック

| 時刻 | 作業 | 完了条件 |
|---|---|---|
| 10:00–11:30 | 本番URLでフィクスチャ通しを1回。デモ端末2台充電、テザリング準備 | fallback経路のみで3分デモ完走 |
| 11:30–12:00 | クレデンシャル受領→Vercel環境変数投入→再デプロイ | `/api/health/providers` が5社分のmodeを返す |
| 12:00–12:40 | 各社スモーク1本 | 各社「ライブ成功」か「fallback確定」を二値で記録 |
| 12:40–14:00 | 成功社のみ本経路へ結線。失敗社はfallback固定 | フィクスチャ動画でend-to-endがLIVE表示で通る |
| 14:00 | ゲートA | 判定を記録 |
| 14:00–15:15 | P1をGMI→ai&→Daytona→Nosanaの順に消化。各30分上限 | 追加ごとにE2E再実行が緑 |
| 15:15 | ゲートB＝機能フリーズ | 以降のコード変更は本番障害修正のみ |
| 15:15–15:40 | 通しリハ2回、スクショ、証拠更新 | 3分以内で完了 |
| 15:40–16:00 | 提出。バックアップ録画を二か所へ | 提出完了を確認 |

## 12. 3分デモ

| 時刻 | 操作 | 発話の核 |
|---|---|---|
| 0:00–0:20 | 画面1で静止 | 「○×では決められない。でも段差と幅が分からなければ、行くかすら決められない」 |
| 0:20–0:35 | 動画を選択、撮影ガイド6ステップを指す | 「AIが撮る順番を指示します」 |
| 0:35–1:05 | 根拠を抽出→右ログが点灯 | LIVE/FALLBACK表記に正直に触れる |
| 1:05–1:35 | 画面2で未確認3件を先に見せる | 「空欄を空欄のまま残すことも成果です」 |
| 1:35–1:50 | ブロック済み主張カードを開く | 「別のモデルが断定を止めています」 |
| 1:50–2:10 | 幅82／段差8／スロープ声掛けを入力→確定 | 「測るのは人間、記録するのはAI」 |
| 2:10–2:35 | Access Card→Daytona検査 | 「自動検査で適合とは言いません」 |
| 2:35–2:50 | 公開確認→QR→スマホ→根拠を開く | 「公開は人間のワンアクションだけ」 |
| 2:50–3:00 | 最終確認日で締め | **We do not certify. We clarify.** |

## 13. 受け入れテスト

### 自動

1. 禁止表現20パターンの日英が必ず `blocked`
2. 値を抜いた入力で `value===null && status==='unknown'`
3. `provenance.length===0` の項目は公開ペイロードから除外
4. `staff_confirmed` 未経由または `blocked>0` の `/api/publish` が409
5. trace・HTMLに `API_KEY` 文字列が現れない
6. E2E：アップロード→レビュー→公開→`/c/<id>` が200で「最終確認日」を含む

### 手動

iOS SafariでQR→表示→根拠開閉／キーボードのみで入力〜公開／日本語400%拡大／フレーム画像altの日英説明。自動検査は「WCAG準拠の証明ではない」と画面と口頭の両方で明言する。

## 14. 故障モード

| 事象 | オーナー動作 |
|---|---|
| Qwen認証失敗/モデルID不一致 | 12:40までに未解決ならfallback固定 |
| Qwenが値を捏造 | スキーマ強制＋「根拠なし＝null」へ矯正 |
| GMIタイムアウト | 決定論フィルタのみで続行 |
| ai&不通 | テンプレ日本語へ |
| Nosanaジョブ未完了 | 放棄→フィクスチャ。絶対に待たない |
| Daytona起動遅延 | 検査「未実行」で公開継続。デモは録画 |
| Vercelデプロイ失敗 | 直前デプロイへロールバック |
| 会場Wi-Fi不安定 | テザリング切替、最終手段は録画 |
| アップロードが重い | 同梱20秒720pへ切替 |
| QRが開けない | 短縮URLを表示し直接入力 |

## 15. セキュリティ／プライバシー／安全ゲート

- 鍵はサーバのみ。`import 'server-only'`、プロバイダ変数への `NEXT_PUBLIC_` 接頭辞を禁止。
- アップロード動画は非公開Blob。公開されるのはスタッフが根拠として承認したフレームのみ。
- 外部送信・公開は `/api/publish` の一経路のみ。人間の確認なしには到達不能。
- 安全ゲートは、決定論フィルタを必須、GMI監査を任意の上乗せとする。
- 総合スコア、認定バッジ、「バリアフリー」「安心」「利用可能」等の包括判定、WCAG適合の主張を表示しない。
- カードには `lastVerifiedAt` と「これは認定ではありません」を日英で必ず入れる。

## 16. スポンサー統合の証拠

- [ ] 各社アダプタのソースパスとコミット一覧
- [ ] `/api/health/providers` のスモーク結果
- [ ] Qwen：実リクエスト/レスポンスJSON（鍵マスク）
- [ ] GMI：unsupported判定の実レスポンス＋書き換え文
- [ ] ai&：生成前/後の日本語対比
- [ ] Nosana：ジョブID＋状態遷移ログ
- [ ] Daytona：プレビューURL＋検査前後件数＋alt修正diff
- [ ] Qoder：Experts Mode分担、Repo Wiki URL
- [ ] 各項目に「ライブ検証済／アダプタのみ」を二値併記

## 17. 提出物

- [ ] 本番URL2本（`/capture` と `/c/demo-cafe`）
- [ ] リポジトリURL
- [ ] 3分デモの画面録画MP4
- [ ] スライド4枚（課題／仕組み／安全設計／スポンサー統合）
- [ ] `SPONSOR_EVIDENCE.md`
- [ ] QRコード画像
- [ ] 既知の限界1枚

## 18. 二値ゲート

### ゲートA（14:00）

GO条件：本番URLでフィクスチャend-to-end完走／画面3スマホ表示／決定論フィルタ緑／公開が人間アクション経由のみ。

NO-GO：P1を全放棄し、fallback固定でP0完走のみに投入。ライブ統合は「アダプタあり・未検証」と提示。

### ゲートB（15:15）

GO条件：3分通しリハが2回連続で時間内完走／本番URL安定／提出物6割以上。

NO-GO：録画デモへ切替し、残り時間を提出物とスクリプトへ。15:15以降のコード変更は本番障害修正のみ。

## 19. 最初の5実装タスク

1. `lib/types.ts` と `fixtures/demo-cafe.json`
2. `lib/safety/deterministic.ts` ＋ vitest 20ケース
3. `lib/store.ts` ＋ `app/api/ingest/route.ts`
4. `app/c/[cardId]/page.tsx`
5. `lib/providers/registry.ts` ＋ 5アダプタ雛形

## 20. 懐疑的な反論と回答

**反論**：「結局『動画からWebページを作る』だけで、抽出精度が低ければ誤った寸法を根拠付きで公開する分、普通の生成AIより危険では？」

**回答**：数値はAI出力のままでは公開されない。寸法項目は `staff_measured` または `confirmed` でなければ公開ペイロードに載らず、AI観察は `ai_observed` の定性事実に限定される。精度が低い場合の帰結は「誤った数値の公開」ではなく「未確認項目の増加」であり、失敗が安全側へ倒れる。断定表現は外部依存ゼロの決定論フィルタで常時ブロックされる。ページ生成との差は、**AIが黙る条件をコードで持っていること**にある。

## 21. 確信度

| 領域 | 確信度 | 補足 |
|---|---|---|
| P0の4.5時間内完走（fallback経路） | 高 | 外部依存ゼロで完結 |
| 決定論フィルタ | 高 | 純ローカル・テスト可能 |
| 公開カードのスマホ表示とQR | 高 | SSRのみ |
| クライアント側フレーム抽出 | 中 | iOS Safari保険としてフィクスチャ切替を必須にする |
| Qwenライブ | 中 | 当日のモデルID/エンドポイント次第 |
| GMI・ai&ライブ | 中 | 任意経路のためデモは壊れない |
| Daytona検査ループ | 低 | 録画差し込み前提 |
| Nosanaライブ | 低 | ボーナス扱い |
| 革新性評価 | 中 | 「断定を止める」見せ場に集中 |
