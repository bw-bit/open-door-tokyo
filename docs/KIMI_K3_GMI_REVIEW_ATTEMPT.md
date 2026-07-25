# Kimi K3 / GMI Cloud UIレビュー実行記録

実行日: 2026-07-25

## 結果

- GMI Cloudの認証済み `/v1/models` で
  `moonshotai/kimi-k3` が利用可能であることを確認した。
- ai&のモデル一覧にはKimi K3はなく、Kimi系は
  `moonshotai/kimi-k2.7-code` だったため、K3はGMIを選択した。
- UIレビューは5セント上限、同時実行1、再試行なしで1回だけ送信した。
- 応答のusageを確定できず、ローカルガードが
  `outstanding_unreconciled` 相当の不明状態へ移行した。
- 二重消費を避けるため再送していない。レビュー本文は採用していない。

## 安全設定

- モデル: `moonshotai/kimi-k3`
- 予約上限: USD 0.05
- 自動課金追加: 無効
- 有料フォールバック: 無効
- 再試行: なし
- ガード台帳: `.guard/`（Git管理外）

このため、公開UIの採否はClaude Code Opus 5の設計、
決定論ルール、TypeScript/Vitest/Playwright、実画面確認を根拠にする。
