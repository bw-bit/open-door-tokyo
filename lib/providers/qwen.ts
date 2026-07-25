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
import { validateQwenVideoDataUrl } from "../video-upload";
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
  "entrance.threshold_height_cm",
  "entrance.door_width_cm",
  "entrance.door_type",
  "entrance.door_operation",
  "entrance.approach_space",
  "entrance.handle_type",
  "entrance.obstruction",
  "entrance.glass_visibility",
  "entrance.lighting",
  "entrance.signage",
  "entrance.portable_ramp",
  "entrance.ramp_assistance",
  "path_to_seat.table_count",
  "path_to_seat.chairs_movable",
  "path_to_seat.narrowest_passage_cm",
  "communication.writing_support",
  "communication.english_menu",
  "restroom.interior_equipment",
  "restroom.signage_type",
  "restroom.entrance_threshold_height_cm",
  "restroom.path_clear_width_cm",
  "restroom.visible_fixture_types",
  "restroom.grab_bars",
  "restroom.accessible_stall",
  "restroom.diaper_changing_station",
  "restroom.emergency_call_button",
  "restroom.sink_approach_clearance",
  "restroom.turning_space",
  "path_to_seat.turning_space"
] as const;

const STAFF_ONLY_FIELDS = new Set<string>([
  "entrance.step_height_cm",
  "entrance.threshold_height_cm",
  "entrance.door_width_cm",
  "entrance.ramp_assistance",
  "path_to_seat.narrowest_passage_cm",
  "communication.writing_support",
  "restroom.entrance_threshold_height_cm",
  "restroom.path_clear_width_cm",
]);

const observationSchema = z
  .object({
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
      observed_value: z
        .union([z.string().max(120), z.number(), z.boolean()])
        .nullable()
        .optional(),
      confidence: z.number().min(0).max(1),
      frame_id: z.string().nullable()
    })
  .strict()
  .superRefine((observation, context) => {
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
        estimate.max - estimate.min < 2 ||
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
  });

const extractionEnvelopeSchema = z
  .object({
    observations: z.array(z.unknown()).max(ACCESS_FIELDS.length),
    unknowns: z.array(z.enum(ACCESS_FIELDS)).max(ACCESS_FIELDS.length),
    proposed_claims: z
      .array(z.string().max(240))
      .max(ACCESS_FIELDS.length)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.observations.length === 0 && value.unknowns.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "empty extraction"
      });
    }
  });

function validObservations(
  extraction: z.infer<typeof extractionEnvelopeSchema>
): Array<z.infer<typeof observationSchema>> {
  const parsed = extraction.observations.flatMap((candidate) => {
    const result = observationSchema.safeParse(candidate);
    return result.success ? [result.data] : [];
  });
  const counts = new Map<string, number>();
  for (const observation of parsed) {
    counts.set(observation.field, (counts.get(observation.field) ?? 0) + 1);
  }
  const unknowns = new Set<string>(extraction.unknowns);
  return parsed.filter(
    (observation) =>
      counts.get(observation.field) === 1 && !unknowns.has(observation.field)
  );
}

const DEFAULT_QWEN_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_MODEL = "qwen3.7-plus";
const DEFAULT_QWEN_REGION = "intl";
const QWEN_MAX_OUTPUT_TOKENS = 2_400;
const QWEN_PRICING: Record<
  string,
  { inputUsdPerMillion: number; outputUsdPerMillion: number; inputTokenLimit: number }
> = {
  "qwen3.7-plus": {
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
    inputTokenLimit: 256_000
  },
  "qwen3.7-plus-2026-05-26": {
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
    inputTokenLimit: 256_000
  },
  "qwen3.6-flash": {
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 1.5,
    inputTokenLimit: 256_000
  }
};

function reconciledQwenCost(input: {
  model: string;
  promptTokens: number | undefined;
  completionTokens: number | undefined;
  totalTokens: number | undefined;
  reservedMaxCostUsd: number;
}): number | null {
  const pricing = QWEN_PRICING[input.model];
  if (!pricing) return null;
  const { promptTokens, completionTokens, totalTokens } = input;
  if (
    !Number.isSafeInteger(promptTokens) ||
    !Number.isSafeInteger(completionTokens) ||
    !Number.isSafeInteger(totalTokens) ||
    promptTokens! < 0 ||
    completionTokens! < 0 ||
    totalTokens! <= 0 ||
    promptTokens! > pricing.inputTokenLimit ||
    completionTokens! > QWEN_MAX_OUTPUT_TOKENS ||
    totalTokens! > pricing.inputTokenLimit + QWEN_MAX_OUTPUT_TOKENS ||
    promptTokens! + completionTokens! !== totalTokens
  ) return null;
  const cost = Number((
    (promptTokens! * pricing.inputUsdPerMillion +
      completionTokens! * pricing.outputUsdPerMillion) /
    1_000_000
  ).toFixed(12));
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
      ja: "この短い映像では確認できていないため要確認です",
      en: "Needs confirmation because it is not visible in this short video"
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
    ja: "動画フレームから来店前に必要な入口・トイレ情報を先回りして構造化",
    en: "Proactively structure entrance and restroom information visitors need from video frames"
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
        detail: { ja: "API未設定のため、実動画の事実はすべて要確認です", en: "API is not configured; upload facts need confirmation" }
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
    if (request.videoDataUrl) {
      const videoValidation = validateQwenVideoDataUrl(request.videoDataUrl);
      if (videoValidation !== "ok") {
        throw new ProviderCallError(
          videoValidation === "payload_too_large"
            ? "payload_too_large"
            : "schema_invalid"
        );
      }
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
          ),
          visitor_questions_to_answer_first: [
            "Is the door automatic, sliding, or hinged?",
            "How does it open and in which direction?",
            "What is the estimated clear opening width?",
            "Is a threshold or step visible and what is its estimated range?",
            "Is there visible approach or turning space?",
            "What handle or opening control is visible?",
            "Are there visible obstructions?",
            "Is glass easy to perceive?",
            "How is the entrance lighting?",
            "Is entrance signage visible?",
            "When a restroom is shown, what restroom type or signage is visibly indicated?",
            "What floor transition or threshold is visible at the restroom entrance, and what is its conservative estimated range?",
            "What is the conservative estimated clear width of the visible route into or within the restroom?",
            "Which fixture types are directly visible, such as toilet, urinal, or sink?",
            "Which grab bars are directly visible and where are they positioned?",
            "Is an accessible-stall sign or a clearly marked accessible stall directly visible?",
            "Is a diaper-changing station directly visible?",
            "Is an emergency call button or cord directly visible?",
            "What sink approach or under-sink clearance is directly visible?",
            "What turning or open floor space is directly visible?"
          ]
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
    if (request.videoDataUrl) {
      content.splice(1, 0, {
        type: "video_url",
        video_url: { url: request.videoDataUrl },
        fps: 1
      });
    }
    const payloadCap = Number(
      process.env.QWEN_MAX_PAYLOAD_BYTES ?? 22_500_000
    );
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
      maxTokens: QWEN_MAX_OUTPUT_TOKENS,
      enableThinking: false,
      extraHeaders: workspaceId
        ? { "X-DashScope-WorkSpace": workspaceId }
        : undefined,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Return JSON only: {"observations":[{"field":"allowed field","description_ja":"short concrete description","description_en":"short concrete description","status":"ai_observed","observation_type":"visible_fact or reference_estimate","estimate_range_cm":null or {"min":3,"max":5},"observed_value":"short structured value, number, boolean, or null","confidence":0.0,"frame_id":"exact frame id"}],"unknowns":["allowed field"],"proposed_claims":[]}. Proactively answer what a visitor needs before arriving. Analyze door type (automatic/sliding/hinged/other), opening method and direction, visible approach or turning layout, handle/control, obstructions, glass visibility markers, lighting, and signage whenever inferable. When any supplied frame shows a restroom, prioritize restroom.signage_type, restroom.entrance_threshold_height_cm, restroom.path_clear_width_cm, restroom.visible_fixture_types, restroom.grab_bars, restroom.accessible_stall, restroom.diaper_changing_station, restroom.emergency_call_button, restroom.sink_approach_clearance, and restroom.turning_space. For every observed restroom visible_fact, return a concise structured observed_value and cite the exact frame_id that proves it. Describe only what is directly visible: signage or type, visible fixtures, the number and position of grab bars, marked accessible-stall evidence, changing station, emergency control, sink approach, and open floor layout. A short video not showing an item is not evidence that the item is unavailable: return unknown, never false, none, absent, unavailable, or no, unless the relevant feature itself is directly and unambiguously shown. Do not turn an accessible symbol, large stall, grab bar, or open area into a certification or usability conclusion. Use only allowed fields and exact frame ids. Directly visible or visually inferable non-measurement facts use visible_fact and no range. For reference_estimate_fields, provide a deliberately conservative approximate range in centimeters whenever the frame has usable visual context; never provide a single exact number. A reference estimate must cite one exact frame, have min < max with at least 2 cm width (use a wider range when visual scale is weak), confidence <= 0.75, and is not a measured fact. Use unknown only when the relevant area is unreadable or not shown. Do not mark a field unknown merely because it was not physically measured. You may describe visible space and layout, but never claim it is sufficient for a specific person. Never infer staff assistance or communication services from appearance. Never claim certification, legal compliance, safety, or wheelchair usability. Never decide whether a wheelchair user can use the venue. proposed_claims must be empty.'
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
    const extraction = extractionEnvelopeSchema.parse(
      safeJson(response.content)
    );
    if (
      extraction.proposed_claims.length > 0 ||
      extraction.proposed_claims.some((claim) => auditClaim(claim))
    ) {
      throw new ProviderCallError("semantic_invalid");
    }
    const liveCard = unknownCardForRequest(request);
    let appliedObservations = 0;
    for (const observation of validObservations(extraction)) {
      const item = liveCard.items.find(
        (candidate) => candidate.field === observation.field
      );
      if (!item) continue;
      if (
        auditClaim(observation.description_ja) ||
        auditClaim(observation.description_en) ||
        (typeof observation.observed_value === "string" &&
          auditClaim(observation.observed_value))
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
        item.value =
          observation.observed_value ??
          observation.description_ja;
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
            ja: "API応答を検証できなかったため、実動画の事実はすべて要確認として継続",
            en: "The API response failed validation; all facts from this upload remain unknown"
          }
        }
      )
    };
  } finally {
    if (reservationId) await reconcile({ reservationId, actualCostUsd });
  }
}
