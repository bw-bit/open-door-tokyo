import "server-only";

import { z } from "zod";
import { getDemoAnalysisCard } from "../fixtures";
import { reconcile, reserve } from "../guard";
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

const extractionSchema = z.object({
  observations: z.array(
    z.object({
      field: z.string(),
      description_ja: z.string(),
      description_en: z.string(),
      status: z.enum(["ai_observed", "unknown"]),
      confidence: z.number().min(0).max(1),
      frame_id: z.string().nullable()
    })
  ).min(1),
  unknowns: z.array(z.string()),
  proposed_claims: z.array(z.string())
});

const DEFAULT_QWEN_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_MODEL = "qwen3.6-flash";
const DEFAULT_QWEN_REGION = "intl";

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
      ja: "段差、幅、設備、利用方法など、店舗スタッフが確認した具体的な事実だけを記載してください。",
      en: "State only concrete facts confirmed by venue staff, such as steps, widths, equipment, and assistance."
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
  try {
    if (request.frames.length > 4) throw new ProviderCallError("payload_too_large");
    const payloadBytes = request.frames.reduce((sum, frame) => {
      const value = frame.dataUrl ?? frame.fixtureUrl ?? "";
      return sum + new TextEncoder().encode(value).byteLength;
    }, 0);
    const payloadCap = Number(process.env.QWEN_MAX_PAYLOAD_BYTES ?? 8_000_000);
    if (!Number.isSafeInteger(payloadCap) || payloadBytes > payloadCap) {
      throw new ProviderCallError("payload_too_large");
    }
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
    const content: ChatContentPart[] = [
      {
        type: "text",
        text: JSON.stringify({
          venue: request.brief,
          transcript: request.transcript ?? "",
          frame_manifest: request.frames.map((frame) => ({
            frame_id: frame.frameId,
            time_seconds: frame.tSec
          })),
          instruction:
            "Match each observation to a frame_id. Images follow in manifest order."
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
    const response = await openAICompatibleChat({
      baseUrl,
      apiKey,
      model,
      maxTokens: 768,
      extraHeaders: workspaceId
        ? { "X-DashScope-WorkSpace": workspaceId }
        : undefined,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract only visible facts. Never infer measurements, certification, or universal usability. Return strict JSON with observations, unknowns, and proposed_claims."
        },
        {
          role: "user",
          content
        }
      ]
    });
    if (
      response.model !== model ||
      !response.usage?.totalTokens ||
      response.usage.totalTokens <= 0
    ) throw new ProviderCallError("semantic_invalid");
    const extraction = extractionSchema.parse(safeJson(response.content));
    const liveCard = unknownCardForRequest(request);
    let appliedObservations = 0;
    for (const observation of extraction.observations) {
      const item = liveCard.items.find(
        (candidate) => candidate.field === observation.field
      );
      if (!item) continue;
      if (
        observation.status === "ai_observed" &&
        (!observation.frame_id ||
          !liveCard.frames.some((frame) => frame.frameId === observation.frame_id))
      ) continue;
      appliedObservations += 1;
      item.description = {
        ja: observation.description_ja,
        en: observation.description_en
      };
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
    if (reservationId) await reconcile({ reservationId, actualCostUsd: null });
  }
}
