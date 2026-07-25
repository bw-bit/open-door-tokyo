# 提出用コピー

## Project

OPEN DOOR TOKYO

## Tagline

店舗の20秒動画を、証拠付きの日英 Access Card へ。  
We do not certify. We clarify.

## One-line description

東京の小規模店舗が撮影した入口から席までの短い動画を、段差・入口幅・通路・コミュニケーション方法の具体的事実、根拠フレーム、未確認事項を備えた日英ページへ変換するAIエージェントです。

## Problem

東京の小さな店舗には、段差や入口幅、筆談対応などの有用な情報があっても、それを調査し、日英で整理し、継続的に公開する人手がありません。一方、来店前の利用者が必要なのは「アクセシブルです」という曖昧な認定ではなく、自分で判断できる具体的な事実です。

## Solution

店舗スタッフが20秒の動画をアップロードすると、OPEN DOOR TOKYOがQwen 3.7 Plusへ動画ファイルを直接入力し、同時に最大4枚の証拠フレームを保存します。AIはドア、段差、通路、トイレ設備などの見えた事実と、実測ではない幅付き参考推定、不足情報を分けて整理します。「車椅子で利用可能」のような包括的な断定は安全ルールで止め、スタッフは日英の記述を手動修正できます。確認後だけ、QR、公開URL、Google掲載文、iframe埋め込みを備えた日英 Access Card を公開し、署名付きWebhookで利用者向けマップへ自動掲載します。

## Why it is an agent

単なる要約画面ではありません。撮影計画、映像からの情報抽出、不足検出、安全監査、スタッフへの質問、日英表現確認、隔離環境での検査、人間による公開承認まで、状態を持って自律的に進めます。外部APIが失敗した場合も、実行していない処理を成功と表示せず、未確認またはフォールバックとして安全側へ倒します。

## Partner stack

- Qwen Cloud: Qwen 3.7 Plusによる動画ファイル直接理解と証拠フレームの構造化
- Nosana: 証拠フレームを扱う分散GPUジョブ
- GMI Cloud: 危険な断定表現の独立セカンドチェック
- ai&: 国内基盤による日英表現の確認
- Daytona: 生成された公開カードの隔離サンドボックス検査
- Qoder: Expert Panel向けタスク分解とRepo Wiki構成

実行画面は `LIVE`、`VERIFIED SAMPLE`、`FALLBACK`、`NOT CONFIGURED`
を区別し、認証確認やサンプルをライブ生成として表示しません。

## Live demo

https://open-door-tokyo.vercel.app

## Repository

https://github.com/bw-bit/open-door-tokyo

## 3-minute demo promise

20秒の店舗動画から始め、AIが言ってはいけない断定を止める場面、スタッフが事実を確認する場面、日英 Access Card がWeb公開されQRからスマホで開く場面までを3分で実演します。

## English summary

OPEN DOOR TOKYO turns a 20-second walkthrough video from a small Tokyo venue into a bilingual, evidence-linked Access Card. It separates AI observations, staff measurements, and unknowns; lets staff correct the bilingual analysis; blocks unsupported claims such as “wheelchair accessible”; and publishes only after explicit human confirmation. The published card can be shared by QR, pasted into a Google listing, embedded on a venue site, or sent to a consumer map through a signed, idempotent webhook. Runtime traces distinguish live execution, verified samples, fallbacks, and unconfigured integrations.
