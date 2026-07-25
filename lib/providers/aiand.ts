import "server-only";

import type { AccessCard, ProviderResult } from "../types";
import { reconcile, reserve } from "../guard";
import {
  openAICompatibleChat,
  providerTrace,
  safeJson, closedError, configuredMaxCost, ProviderCallError, reserveFailureCode
} from "./shared";

export async function phraseWithAiAnd(
  card: AccessCard
): Promise<ProviderResult<AccessCard>> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const task = {
    ja: "国内処理で店舗向けの日英表現を確認",
    en: "Review bilingual venue phrasing on Japan-hosted inference"
  };
  const apiKey = process.env.AIAND_API_KEY;
  const model = process.env.AIAND_MODEL;
  const baseUrl = process.env.AIAND_BASE_URL || "https://api.aiand.com/v1";

  if (!apiKey || !model) {
    return {
      data: card,
      trace: providerTrace(
        "aiand",
        "not_configured",
        task,
        startedAt,
        Date.now() - started,
        false,
        {
          errorCode: "config_missing",
          validation: "not_run",
          detail: {
            ja: "検証済みの日英定型表現を使用",
            en: "Using verified bilingual template copy"
          }
        }
      )
    };
  }

  let reservationId: string | undefined;
  try {
    const maxCostUsd = configuredMaxCost(
      process.env.GUARD_AIAND_CHAT_MAX_ACTION_COST_USD
    );
    if (maxCostUsd === null) throw new ProviderCallError("budget_unknown");
    const reserved = await reserve({ surface: "aiand.chat", maxCostUsd, idempotencyKey: `aiand-${card.brief.cardId}` });
    if (!reserved.ok) throw new ProviderCallError(reserveFailureCode(reserved.code));
    reservationId = reserved.reservationId;
    const response = await openAICompatibleChat({
      baseUrl,
      apiKey,
      model,
      maxTokens: 768,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Review the Japanese and English evidence descriptions. Preserve every measurement and unknown. Do not add claims. Return JSON {"verdict":"ok","issues":[]} only when safe; otherwise verdict must be "reject".'
        },
        {
          role: "user",
          content: JSON.stringify(
            card.items.map((item) => ({
              field: item.field,
              ja: item.description.ja,
              en: item.description.en,
              status: item.status
            }))
          )
        }
      ]
    });
    const review = safeJson<{ verdict?: unknown; issues?: unknown }>(
      response.content
    );
    if (!response.model || response.model.trim() === "") {
      throw new ProviderCallError("semantic_invalid");
    }
    if (
      !["ok", "reject"].includes(String(review.verdict)) ||
      !Array.isArray(review.issues) ||
      !review.issues.every((issue) => typeof issue === "string") ||
      (review.verdict === "ok" && review.issues.length !== 0)
    ) {
      throw new ProviderCallError("semantic_invalid");
    }
    if (review.verdict !== "ok") {
      throw new ProviderCallError("semantic_invalid");
    }

    return {
      data: card,
      trace: providerTrace(
        "aiand",
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
            ja: "日英表現の安全判定を検証",
            en: "Validated the bilingual safety verdict"
          }
        }
      )
    };
  } catch (error) {
    return {
      data: card,
      trace: providerTrace(
        "aiand",
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
            ja: "検証済みの日英定型表現を使用",
            en: "Using verified bilingual template copy"
          }
        }
      )
    };
  } finally {
    if (reservationId) await reconcile({ reservationId, actualCostUsd: null });
  }
}
