import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { reconcile, reserve } from "@/lib/guard";
import { openAICompatibleChat, safeJson } from "@/lib/providers/shared";

describe.skipIf(process.env.RUN_LIVE_PROVIDER_TESTS !== "1")("GMI live contract", () => {
  it("performs one guarded 64-token claim audit", async () => {
    const apiKey = process.env.GMI_API_KEY, model = process.env.GMI_MODEL;
    const baseUrl = process.env.GMI_BASE_URL || "https://api.gmi-serving.com/v1";
    const maxCostUsd = Number(process.env.GUARD_GMI_CHAT_MAX_ACTION_COST_USD);
    if (!apiKey || !model || !(maxCostUsd > 0)) throw new Error("live_config_missing");
    const held = await reserve({ surface: "gmi.chat", maxCostUsd, idempotencyKey: `gmi-proof-${Date.now()}` });
    expect(held.ok).toBe(true); if (!held.ok) return;
    let known = false;
    try {
      const result = await openAICompatibleChat({
        baseUrl, apiKey, model, maxTokens: 64, responseFormat: { type: "json_object" },
        messages: [{ role: "user", content: 'Audit unsupported universal claim "accessible to everyone". Return exactly {"verdict":"unsupported"}.' }]
      });
      expect(safeJson<{ verdict: string }>(result.content).verdict).toBe("unsupported");
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
      known = true;
    } finally { await reconcile({ reservationId: held.reservationId, actualCostUsd: known ? maxCostUsd : null }); }
  }, 30_000);
});
