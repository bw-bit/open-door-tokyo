import "server-only";

import type { AccessCard, ProviderResult } from "../types";
import { auditClaims } from "../safety/deterministic";
import { reconcile, reserve } from "../guard";
import {
  openAICompatibleChat,
  providerTrace,
  safeJson, closedError, configuredMaxCost, ProviderCallError, reserveFailureCode
} from "./shared";

type Verdict = {
  verdict: "supported" | "unsupported";
  reason: string;
  rewrite_ja?: string;
  rewrite_en?: string;
};

export async function auditWithGmi(
  card: AccessCard
): Promise<ProviderResult<AccessCard>> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const task = {
    ja: "包括的なアクセシビリティ断定を検出し、具体的事実へ書換",
    en: "Block universal accessibility claims and rewrite them as concrete facts"
  };
  const apiKey = process.env.GMI_API_KEY;
  const model = process.env.GMI_MODEL;
  const baseUrl =
    process.env.GMI_BASE_URL || "https://api.gmi-serving.com/v1";
  const candidate = "車椅子で利用可能";

  const existingBlocked = card.safetyAudit.blocked.find(
    (claim) => claim.text === candidate
  );
  const blocked = auditClaims([candidate]);
  card.safetyAudit.blocked = blocked.map((claim) => ({
    ...claim,
    reason: existingBlocked?.reason ?? claim.reason,
    suggestion: existingBlocked?.suggestion ?? claim.suggestion,
    resolved: false
  }));

  if (!apiKey || !model) {
    card.safetyAudit.auditedBy.gmi = "not_configured";
    return {
      data: card,
      trace: providerTrace(
        "gmi",
        "not_configured",
        task,
        startedAt,
        Date.now() - started,
        false,
        {
          errorCode: "config_missing",
          validation: "not_run",
          detail: {
            ja: "決定論ルールが断定表現を停止",
            en: "Deterministic rules stopped the unsupported claim"
          }
        }
      )
    };
  }

  let reservationId: string | undefined;
  try {
    const maxCostUsd = configuredMaxCost(
      process.env.GUARD_GMI_CHAT_MAX_ACTION_COST_USD
    );
    if (maxCostUsd === null) throw new ProviderCallError("budget_unknown");
    const reserved = await reserve({ surface: "gmi.chat", maxCostUsd, idempotencyKey: `gmi-${card.brief.cardId}` });
    if (!reserved.ok) throw new ProviderCallError(reserveFailureCode(reserved.code));
    reservationId = reserved.reservationId;
    const response = await openAICompatibleChat({
      baseUrl,
      apiKey,
      model,
      maxTokens: 64,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Audit one accessibility claim against the supplied evidence. Never certify. Return JSON: verdict, reason, rewrite_ja, rewrite_en."
        },
        {
          role: "user",
          content: JSON.stringify({
            claim: candidate,
            evidence: card.items.map((item) => ({
              field: item.field,
              status: item.status,
              description: item.description.ja
            }))
          })
        }
      ]
    });
    const verdict = safeJson<Verdict>(response.content);
    if (!response.usage?.totalTokens || response.usage.totalTokens <= 0) {
      throw new ProviderCallError("semantic_invalid");
    }
    if (!["supported", "unsupported"].includes(verdict.verdict)) {
      throw new ProviderCallError("semantic_invalid");
    }
    if (typeof verdict.reason !== "string" || verdict.reason.trim() === "") throw new ProviderCallError("semantic_invalid");
    if (
      verdict.verdict === "unsupported" &&
      (typeof verdict.rewrite_ja !== "string" ||
        verdict.rewrite_ja.trim() === "" ||
        typeof verdict.rewrite_en !== "string" ||
        verdict.rewrite_en.trim() === "")
    ) throw new ProviderCallError("semantic_invalid");
    card.safetyAudit.auditedBy.gmi = "live";
    card.safetyAudit.llmVerdicts = [
      {
        claim: candidate,
        verdict: verdict.verdict,
        reason: verdict.reason,
        rewrite:
          verdict.rewrite_ja && verdict.rewrite_en
            ? { ja: verdict.rewrite_ja, en: verdict.rewrite_en }
            : undefined
      }
    ];
    if (
      verdict.verdict === "unsupported" &&
      verdict.rewrite_ja &&
      verdict.rewrite_en &&
      card.safetyAudit.blocked[0]
    ) {
      card.safetyAudit.blocked[0].reason = {
        ja: verdict.reason,
        en: verdict.reason
      };
      card.safetyAudit.blocked[0].suggestion = {
        ja: verdict.rewrite_ja,
        en: verdict.rewrite_en
      };
    }
    return {
      data: card,
      trace: providerTrace(
        "gmi",
        "live",
        task,
        startedAt,
        Date.now() - started,
        true,
        { model, requestId: response.requestId, reservationId, validation: "schema_and_semantic_passed" }
      )
    };
  } catch (error) {
    card.safetyAudit.auditedBy.gmi = "fallback";
    return {
      data: card,
      trace: providerTrace(
        "gmi",
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
            ja: "決定論ルールで安全監査を継続",
            en: "Continued safety audit with deterministic rules"
          }
        }
      )
    };
  } finally {
    if (reservationId) await reconcile({ reservationId, actualCostUsd: null });
  }
}
