import { z } from "zod";
import { guardStatus, reconcile, reserve } from "../lib/guard";

const MODEL = "moonshotai/kimi-k3";
const BASE_URL = "https://api.gmi-serving.com/v1";
const IDEMPOTENCY_KEY = "gmi-kimi-k3-ui-review-20260725-v2";
const MAX_COST_USD = 0.05;
const INPUT_PRICE_PER_MILLION = 3;
const OUTPUT_PRICE_PER_MILLION = 15;

const reviewSchema = z
  .object({
    verdict: z.enum(["採用", "要修正"]),
    summary: z.string().min(1).max(400),
    top_fixes: z.array(z.string().min(1).max(240)).max(5),
    copy_changes: z.array(z.string().min(1).max(240)).max(5),
    pictogram_risks: z.array(z.string().min(1).max(240)).max(5),
    safety_checks: z.array(z.string().min(1).max(240)).max(6)
  })
  .strict();

function jsonFromText(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "");
  return JSON.parse(trimmed);
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

async function main() {
  const apiKey = process.env.GMI_API_KEY;
  if (!apiKey) {
    throw new Error("GMI_API_KEY is unavailable");
  }

const before = await guardStatus("gmi.chat");
if (
  !before.capKnown ||
  !before.priceKnown ||
  before.remainingSlots < 1 ||
  before.outstanding !== 0
) {
  throw new Error(`guard_preflight_failed:${JSON.stringify(before)}`);
}

const reservation = await reserve({
  surface: "gmi.chat",
  maxCostUsd: MAX_COST_USD,
  idempotencyKey: IDEMPOTENCY_KEY
});
if (!reservation.ok) {
  throw new Error(`guard_reservation_failed:${reservation.code}`);
}

let actualCostUsd: number | null = null;
let output: unknown = null;
try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 128,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "あなたは日本のアクセシビリティ情報サービスを審査するシニアUXライター兼安全レビュー担当です。利用可否の認定はせず、証拠と未確認を区別してください。指定JSONだけを返してください。"
          },
          {
            role: "user",
            content: JSON.stringify({
              product:
                "OPEN DOOR TOKYO。店舗動画から時刻付き画像を自動抽出し、Qwen VLが入口・段差・幅・通路・筆談などを整理。店舗が手動修正・確認後、来店前案内と利用者向け地図へ掲載する。",
              value:
                "電話をしなくても、車椅子、ベビーカー、白杖・見えにくさ等の利用者が行く前に具体情報を確認できる。",
              planned_copy: {
                capture:
                  "お店の入口を撮ると、行く前に分かる案内になります。20秒の動画から、段差・入口の幅・通路・筆談などをAIが整理します。",
                review: "公開前に、お店の方が確かめてください。",
                public: "{店名} 来店前アクセス案内"
              },
              states: [
                "AI観察",
                "AI参考推定（幅付き・実測ではない）",
                "スタッフ確認済み",
                "未確認"
              ],
              overview: [
                "車椅子",
                "ベビーカー",
                "白杖・見えにくさ",
                "筆談",
                "段差",
                "入口の幅"
              ],
              visual:
                "ChatGPT Images 2.0で生成した6ピクトグラムと、Qwen VLへ渡した同じ時刻付きキャプチャ画像をレビュー・公開画面に表示。",
              constraints: [
                "正確な高さではなく安全な幅付き参考推定を許す",
                "車椅子対応・バリアフリー等の包括認定をしない",
                "情報ありは可否ではなく具体情報の有無",
                "電話を必須にしない",
                "日本語を主表示にする"
              ],
              requested_json: {
                verdict: "採用 または 要修正",
                summary: "400字以内",
                top_fixes: "最大5件",
                copy_changes: "最大5件",
                pictogram_risks: "最大5件",
                safety_checks: "最大6件"
              }
            })
          }
        ]
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`gmi_http_${response.status}`);
  const payload = (await response.json()) as {
    id?: unknown;
    model?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
    };
  };
  const promptTokens = nonNegativeInteger(payload.usage?.prompt_tokens);
  const completionTokens = nonNegativeInteger(payload.usage?.completion_tokens);
  const totalTokens = nonNegativeInteger(payload.usage?.total_tokens);
  const usageKnown =
    promptTokens !== null &&
    completionTokens !== null &&
    totalTokens !== null &&
    promptTokens + completionTokens === totalTokens;
  if (usageKnown) {
    actualCostUsd =
      (promptTokens * INPUT_PRICE_PER_MILLION +
        completionTokens * OUTPUT_PRICE_PER_MILLION) /
      1_000_000;
    if (actualCostUsd > MAX_COST_USD) throw new Error("gmi_cost_exceeded");
  }
  if (
    typeof payload.model !== "string" ||
    payload.model.toLowerCase() !== MODEL
  ) {
    throw new Error(`gmi_model_mismatch:${String(payload.model)}`);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("gmi_empty_response");
  }
  const review = reviewSchema.parse(jsonFromText(content));
  output = {
    provider: "GMI Cloud",
    model: payload.model,
    requestId: typeof payload.id === "string" ? payload.id : undefined,
    usage: usageKnown ? { promptTokens, completionTokens, totalTokens } : null,
    settlement: usageKnown ? "provider_usage" : "reserved_max",
    settledCostUsd: Number((actualCostUsd ?? MAX_COST_USD).toFixed(6)),
    review
  };
} finally {
  const reconciled = await reconcile({
    reservationId: reservation.reservationId,
    actualCostUsd
  });
  if (!reconciled.ok) {
    throw new Error(`guard_reconciliation_failed:${reconciled.code}`);
  }
}

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  process.stderr.write(`Kimi K3 review failed: ${message}\n`);
  process.exitCode = 1;
});
