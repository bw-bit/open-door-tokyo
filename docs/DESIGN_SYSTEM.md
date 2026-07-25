# デザインと視覚QA

## 持ち帰ってほしい一文

「認定ではなく、証拠と未確認を丁寧に見せるプロダクト」と一目で分かること。

## トークン

- 背景: `#F4F7F8`
- 本文・主要操作: `#17324A`
- 確認済み: `#1C827A`
- 未確認: `#A86D0B`
- ブロック: `#A64040`
- 境界線: `#D7E0E4`
- 角丸: 4–6px
- 影: 大きいカードだけに薄く使用
- 見出し: 明朝系
- 本文: 日本語ゴシック系

グラデーション、ガラス表現、過剰なカード分割は使わない。公共情報と編集物の間にある、静かで信頼できる紙面を目指す。

## 画面ごとの情報階層

### Capture

1. 課題を一文で理解
2. サンプル動画
3. 解析ボタン
4. ガイド撮影
5. スポンサー実行履歴

### Evidence Review

1. 証拠フレームと時刻
2. AI観察・スタッフ回答・未確認の区別
3. 危険な断定ブロック
4. 根拠のある書換
5. 人による確認と公開

### Public Access Card

1. 店舗名、確認日
2. 認定ではない旨
3. 入口・経路・コミュニケーションの具体的事実
4. 各事実の根拠
5. 未確認事項

## 生成ビジュアル

ChatGPT Images 2.0で、日本語サインを画像内に含めて生成した。後から文字を合成していない。

- `public/demo/frames/01-entrance.png`
- `public/demo/frames/02-step-measurement.png`
- `public/demo/frames/03-door-width.png`
- `public/demo/frames/04-seating.png`
- `public/demo/cafe-tour.mp4`

`02-step-measurement.png` のメジャー目盛りは厳密な数値証拠として使わず、「スタッフ測定の状況」だけを示す。8cmという値の根拠は `staff_measured` 入力である。

## 実装との照合

1. 濃紺・ティール・白の編集的な画面構成を全3画面で維持
2. Evidence Reviewで赤いブロックと緑の書換を同時に表示
3. すべての観察項目にフレーム、時刻、出典数を表示
4. スマホ公開カードで具体的事実と未確認を明確に分離
5. Agent Traceで5社の役割と実行モードを常時表示
6. 公開カードに日英切替、根拠の展開、最終確認日を実装
7. 認定や適合判定ではない旨を公開カード上部に表示

## QA画像

- `docs/qa/capture-production-final.png`
- `docs/qa/review-production-final.png`
- `docs/qa/card-production-mobile-final.png`

本番URLをPC 1440px幅とスマホ390px幅で目視確認済み。開発用Next.jsバッジはproduction buildには表示されない。
