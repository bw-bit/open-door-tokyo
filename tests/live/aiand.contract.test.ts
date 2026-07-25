import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { reconcile, reserve } from "@/lib/guard";
import { openAICompatibleChat, safeJson } from "@/lib/providers/shared";

describe.skipIf(process.env.RUN_LIVE_PROVIDER_TESTS !== "1")("ai& live contract", () => {
  it("performs one guarded 64-token bilingual review", async () => {
    const apiKey = process.env.AIAND_API_KEY, model = process.env.AIAND_MODEL;
    const baseUrl = process.env.AIAND_BASE_URL || "https://api.aiand.com/v1";
    const maxCostUsd = Number(process.env.GUARD_AIAND_CHAT_MAX_ACTION_COST_USD);
    if (!apiKey || !model || !(maxCostUsd > 0)) throw new Error("live_config_missing");
    const held = await reserve({ surface: "aiand.chat", maxCostUsd, idempotencyKey: `aiand-proof-${Date.now()}` });
    expect(held.ok).toBe(true); if (!held.ok) return;
    let known = false;
    try {
      const result = await openAICompatibleChat({
        baseUrl, apiKey, model, maxTokens: 64, responseFormat: { type: "json_object" },
        messages: [{ role: "user", content: 'Review "段差は未確認 / Step is unknown" without adding facts. Return exactly {"verdict":"ok","issues":[]}.' }]
      });
      const proof = safeJson<{ verdict: string; issues: unknown[] }>(result.content);
      expect(proof).toEqual({ verdict: "ok", issues: [] });
      expect(result.model?.length).toBeGreaterThan(0);
      known = true;
    } finally { await reconcile({ reservationId: held.reservationId, actualCostUsd: known ? maxCostUsd : null }); }
  });
});
