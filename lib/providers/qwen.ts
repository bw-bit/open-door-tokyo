import "server-only";

import { z } from "zod";
import { getDemoAnalysisCard } from "../fixtures";
import { reconcile, reserve } from "../guard";
import { auditClaim } from "../safety/deterministic";
import {
  canUseReferenceEstimate,
  encodeReferenceEstimate,
  referenceEstimateDescription
} from "../reference-estimate";
import type { AccessCard, AnalyzeRequest, ProviderResult } from "../types";
import {
  type ChatContentPart,
  openAICompatibleChat,
  providerTrace,
  safeJson,
  closedError,
  configuredMaxCost,
  ProviderCallError,
  reserveFailureCode
} from "./shared";

const ACCESS_FIELDS = [
  "entrance.step_presence",
  "entrance.step_height_cm",
  "entrance.door_width_cm",
  "entrance.door_type",
  "entrance.portable_ramp",
  "entrance.ramp_assistance",
  "path_to_seat.table_count",
  "path_to_seat.chairs_movable",
  "path_to_seat.narrowest_passage_cm",
  "communication.writing_support",
  "communication.english_menu",
  "restroom.interior_equipment",
  "path_to_seat.turning_space"
] as const;

const STAFF_ONLY_FIELDS = new Set<string>([
  "entrance.step_height_cm",
  "entrance.door_width_cm",
  "entrance.ramp_assistance",
  "path_to_seat.narrowest_passage_cm",
  "communication.writing_support",
  "path_to_seat.turning_space"
]);

const extractionSchema = z.object({
  observations: z.array(
    z.object({
      field: z.enum(ACCESS_FIELDS),
      description_ja: z.string().min(1).max(240),
      description_en: z.string().min(1).max(240),
      status: z.enum(["ai_observed", "unknown"]),
      observation_type: z
        .enum(["visible_fact", "reference_estimate"])
        .optional()
        .default("visible_fact"),
      estimate_range_cm: z
        .object({
          min: z.number().min(0).max(500),
          max: z.number().min(0).max(500)
        })
        .strict()
        .nullable()
        .optional(),
      confidence: z.number().min(0).max(1),
      frame_id: z.string().nullable()
    }).strict()
  ).max(ACCESS_FIELDS.length),
  unknowns: z.array(z.enum(ACCESS_FIELDS)).max(ACCESS_FIELDS.length),
  proposed_claims: z.array(z.string().max(240)).max(ACCESS_FIELDS.length)
}).strict().superRefine((value, context) => {
  if (value.observations.length === 0 && value.unknowns.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "empty extraction" });
  }
  for (const observation of value.observations) {
    if (
      observation.status === "unknown" &&
      (observation.frame_id !== null || observation.confidence !== 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unknown observation cannot cite evidence"
      });
    }
    const estimate = observation.estimate_range_cm;
    if (observation.observation_type === "reference_estimate") {
      if (
        observation.status !== "ai_observed" ||
        !observation.frame_id ||
        !canUseReferenceEstimate(observation.field) ||
        !estimate ||
        estimate.max - estimate.min < 1 ||
        observation.confidence > 0.75
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "unsafe reference estimate"
        });
      }
    } else if (estimate !== undefined && estimate !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "visible fact cannot contain an estimate range"
      });
    }
  }
  const observationFields = value.observations.map(({ field }) => field);
  if (new Set(observationFields).size !== observationFields.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate field" });
  }
  const unknowns = new Set(value.unknowns);
  if (observationFields.some((field) => unknowns.has(field))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "field cannot be observed and unknown"
    });
  }
});

const DEFAULT_QWEN_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_MODEL = "qwen3.6-flash";
const DEFAULT_QWEN_REGION = "intl";
const QWEN_INPUT_USD_PER_MILLION_TOKENS = 0.25;
const QWEN_OUTPUT_USD_PER_MILLION_TOKENS = 1.5;

function reconciledQwenCost(input: {
  model: string;
  promptTokens: number | undefined;
  completionTokens: number | undefined;
  totalTokens: number | undefined;
  reservedMaxCostUsd: number;
}): number | null {
  if (input.model !== DEFAULT_QWEN_MODEL) return null;
  const { promptTokens, completionTokens, totalTokens } = input;
  if (
    !Number.isSafeInteger(promptTokens) ||
    !Number.isSafeInteger(completionTokens) ||
    !Number.isSafeInteger(totalTokens) ||
    promptTokens! < 0 ||
    completionTokens! < 0 ||
    totalTokens! <= 0 ||
    totalTokens! > 256_000 ||
    promptTokens! + completionTokens! !== totalTokens
  ) return null;
  const cost =
    (promptTokens! * QWEN_INPUT_USD_PER_MILLION_TOKENS +
      completionTokens! * QWEN_OUTPUT_USD_PER_MILLION_TOKENS) /
    1_000_000;
  return Number.isFinite(cost) &&
    cost >= 0 &&
    cost <= input.reservedMaxCostUsd
    ? cost
    : null;
}

function requestFrames(request: AnalyzeRequest): AccessCard["frames"] {
  return request.frames.flatMap((frame, index) => {
    const url = frame.dataUrl ?? frame.fixtureUrl;
    if (!url) return [];
    return [
      {
        frameId: frame.frameId,
        tSec: frame.tSec,
        url,
        alt: {
          ja: `店舗動画の証拠フレーム ${index + 1}`,
          en: `Venue video evidence frame ${index + 1}`
        }
      }
    ];
  });
}

function unknownCardForRequest(request: AnalyzeRequest): AccessCard {
  const card = getDemoAnalysisCard();
  for (const item of card.items) {
    item.description = {
      ja: "映像からは確認できていません",
      en: "Not verified from this video"
    };
    item.value = null;
    item.status = "unknown";
    item.confidence = 0;
    item.provenance = [];
    item.confirmedByStaff = false;
    item.lastVerifiedAt = null;
  }
  card.frames = requestFrames(request);
  card.unknowns = card.items.map((item) => item.field);
  card.conflicts = [];
  card.safetyAudit.llmVerdicts = [];
  card.safetyAudit.blocked = card.safetyAudit.blocked.map((claim) => ({
    ...claim,
    reason: {
      ja: "実動画の解析だけでは、個人ごとの利用可否を断定できません。",
      en: "A venue video alone cannot establish usability for every individual."
    },
    suggestion: {
      ja: "確認済みの具体的事実、または実測ではないと明示した幅付き参考推定だけを記載してください。",
      en: "State only verified concrete facts or range-based reference estimates explicitly labeled as not measured."
    },
    resolved: false
  }));
  card.state = "analyzing";
  card.publishedAt = null;
  card.lastVerifiedAt = null;
  card.updatedAt = new Date().toISOString();
  return card;
}

export async function analyzeWithQwen(
  request: AnalyzeRequest
): Promise<ProviderResult<AccessCard>> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const task = {
    ja: "動画フレームから観察事実と未確認事項を構造化",
    en: "Structure observed facts and unknowns from video frames"
  };

  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL;
  const model = process.env.QWEN_MODEL || DEFAULT_QWEN_MODEL;
  const region = process.env.QWEN_REGION || DEFAULT_QWEN_REGION;
  const workspaceId = process.env.QWEN_WORKSPACE_ID;
  const fallback = request.useFixture
    ? getDemoAnalysisCard()
    : unknownCardForRequest(request);

  if (request.useFixture) {
    return {
      data: fallback,
      trace: providerTrace(
        "qwen",
        "verified_sample",
        task,
        startedAt,
        Date.now() - started,
        true,
        {
          detail: {
            ja: "検証済みのサンプル解析を使用",
            en: "Using the verified sample analysis"
          },
          validation: "verified_sample"
        }
      )
    };
  }
  if (!apiKey || region !== DEFAULT_QWEN_REGION) {
    return {
      data: fallback,
      trace: providerTrace("qwen", "not_configured", task, startedAt, Date.now() - started, false, {
        errorCode: "config_missing",
        validation: "not_run",
        detail: { ja: "API未設定のため、実動画の事実はすべて未確認です", en: "API is not configured; upload facts remain unknown" }
      })
    };
  }

  let reservationId: string | undefined;
  let reservedMaxCostUsd: number | null = null;
  let actualCostUsd: number | null = null;
  try {
    if (request.frames.length > 4) throw new ProviderCallError("payload_too_large");
    if (requestFrames(request).length === 0) {
      throw new ProviderCallError("schema_invalid");
    }
    const content: ChatContentPart[] = [
      {
        type: "text",
        text: JSON.stringify({
          venue: {
            name: request.brief.name,
            category: request.brief.category
          },
          transcript: (request.transcript ?? "").slice(0, 4_000),
          frame_manifest: request.frames.map((frame) => ({
            frame_id: frame.frameId,
            time_seconds: frame.tSec
          })),
          allowed_fields: ACCESS_FIELDS,
          exact_measurement_fields: Array.from(STAFF_ONLY_FIELDS),
          reference_estimate_fields: ACCESS_FIELDS.filter((field) =>
            canUseReferenceEstimate(field)
          )
        })
      },
      ...request.frames.flatMap<ChatContentPart>((frame) => {
        const url = frame.dataUrl ?? frame.fixtureUrl;
        if (!url) return [];
        return [
          {
            type: "text",
            text: `frame_id=${frame.frameId}; time_seconds=${frame.tSec}`
          },
          { type: "image_url", image_url: { url } }
        ];
      })
    ];
    const payloadCap = Number(process.env.QWEN_MAX_PAYLOAD_BYTES ?? 8_000_000);
    const payloadBytes = new TextEncoder().encode(
      JSON.stringify(content)
    ).byteLength;
    if (
      !Number.isSafeInteger(payloadCap) ||
      payloadCap < 1 ||
      payloadBytes > payloadCap
    ) throw new ProviderCallError("payload_too_large");

    const maxCostUsd = configuredMaxCost(
      process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD
    );
    if (maxCostUsd === null) throw new ProviderCallError("budget_unknown");
    const reserved = await reserve({
      surface: "qwen.chat",
      maxCostUsd,
      idempotencyKey: `qwen-${request.cardId}`
    });
    if (!reserved.ok) throw new ProviderCallError(reserveFailureCode(reserved.code));
    reservationId = reserved.reservationId;
    reservedMaxCostUsd = maxCostUsd;
    const response = await openAICompatibleChat({
      baseUrl,
      apiKey,
      model,
      maxTokens: 768,
      enableThinking: false,
      extraHeaders: workspaceId
        ? { "X-DashScope-WorkSpace": workspaceId }
        : undefined,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Return JSON only: {"observations":[{"field":"allowed field","description_ja":"short description","description_en":"short description","status":"ai_observed","observation_type":"visible_fact or reference_estimate","estimate_range_cm":null or {"min":3,"max":5},"confidence":0.0,"frame_id":"exact frame id"}],"unknowns":["allowed field"],"proposed_claims":[]}. Use only allowed fields and exact frame ids. Directly visible non-measurement facts use visible_fact and no range. For reference_estimate_fields only, you may provide a deliberately conservative width-bearing approximate range in centimeters when the frame has enough visual context; never provide a single exact number. A reference estimate must cite one exact frame, have min < max with at least 1 cm width, confidence <= 0.75, and is not a measured fact. If visual context is insufficient, put the field in unknowns. Never estimate assistance, communication service, turning suitability, certification, legal compliance, safety, or wheelchair usability. Never decide whether a wheelchair user can use the venue. proposed_claims must be empty.'
        },
        {
          role: "user",
          content
        }
      ]
    });
    if (response.model !== model) throw new ProviderCallError("semantic_invalid");
    actualCostUsd = reconciledQwenCost({
      model,
      promptTokens: response.usage?.promptTokens,
      completionTokens: response.usage?.completionTokens,
      totalTokens: response.usage?.totalTokens,
      reservedMaxCostUsd
    });
    if (actualCostUsd === null) throw new ProviderCallError("semantic_invalid");
    const extraction = extractionSchema.parse(safeJson(response.content));
    if (
      extraction.proposed_claims.length > 0 ||
      extraction.proposed_claims.some((claim) => auditClaim(claim))
    ) {
      throw new ProviderCallError("semantic_invalid");
    }
    const liveCard = unknownCardForRequest(request);
    let appliedObservations = 0;
    for (const observation of extraction.observations) {
      const item = liveCard.items.find(
        (candidate) => candidate.field === observation.field
      );
      if (!item) continue;
      if (
        auditClaim(observation.description_ja) ||
        auditClaim(observation.description_en)
      ) throw new ProviderCallError("semantic_invalid");
      if (
        observation.status === "ai_observed" &&
        (!observation.frame_id ||
          !liveCard.frames.some((frame) => frame.frameId === observation.frame_id))
      ) continue;
      appliedObservations += 1;
      if (observation.observation_type === "reference_estimate") {
        const estimate = observation.estimate_range_cm;
        if (!estimate) throw new ProviderCallError("semantic_invalid");
        item.description = referenceEstimateDescription({
          minCm: estimate.min,
          maxCm: estimate.max
        });
        item.value = encodeReferenceEstimate({
          minCm: estimate.min,
          maxCm: estimate.max
        });
        item.unit = "cm";
      } else {
        if (
          observation.status === "ai_observed" &&
          STAFF_ONLY_FIELDS.has(observation.field)
        ) {
          throw new ProviderCallError("semantic_invalid");
        }
        item.description = {
          ja: observation.description_ja,
          en: observation.description_en
        };
      }
      item.status = observation.status;
      item.confidence =
        observation.status === "unknown" ? 0 : observation.confidence;
      if (observation.frame_id) {
        const frame = liveCard.frames.find(
          (candidate) => candidate.frameId === observation.frame_id
        );
        if (frame) {
          item.provenance = [
            {
              kind: "video_frame",
              frameId: frame.frameId,
              tSec: frame.tSec,
              capturedAt: new Date().toISOString()
            }
          ];
        }
      }
    }
    if (appliedObservations === 0) {
      throw new ProviderCallError("semantic_invalid");
    }
    liveCard.unknowns = Array.from(
      new Set([
        ...extraction.unknowns,
        ...liveCard.items
          .filter((item) => item.status === "unknown")
          .map((item) => item.field)
      ])
    );

    return {
      data: liveCard,
      trace: providerTrace(
        "qwen",
        "live",
        task,
        startedAt,
        Date.now() - started,
        true,
        {
          model,
          requestId: response.requestId,
          reservationId,
          validation: "schema_and_semantic_passed",
          detail: {
            ja: `${appliedObservations}件のライブ抽出を反映`,
            en: `Applied ${appliedObservations} live observations`
          }
        }
      )
    };
  } catch (error) {
    return {
      data: fallback,
      trace: providerTrace(
        "qwen",
        "fallback",
        task,
        startedAt,
        Date.now() - started,
        false,
        {
          model,
          reservationId,
          errorCode: closedError(error),
          validation: "failed",
          detail: {
            ja: "API応答を検証できなかったため、実動画の事実はすべて未確認として継続",
            en: "The API response failed validation; all facts from this upload remain unknown"
          }
        }
      )
    };
  } finally {
    if (reservationId) await reconcile({ reservationId, actualCostUsd });
  }
}
