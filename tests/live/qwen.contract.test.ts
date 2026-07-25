import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { reconcile, reserve } from "@/lib/guard";
import { openAICompatibleChat, safeJson } from "@/lib/providers/shared";

const live = process.env.RUN_LIVE_PROVIDER_TESTS === "1";
describe.skipIf(!live)("Qwen live contract", () => {
  it("performs one guarded 64-token semantic proof", async () => {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    const baseUrl = process.env.QWEN_BASE_URL ||
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    const model = process.env.QWEN_MODEL || "qwen3.7-plus";
    const region = process.env.QWEN_REGION || "intl";
    const workspaceId = process.env.QWEN_WORKSPACE_ID;
    const maxCostUsd = Number(process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD);
    if (!apiKey || region !== "intl" || !(maxCostUsd > 0)) throw new Error("live_config_missing");
    const held = await reserve({ surface: "qwen.chat", maxCostUsd, idempotencyKey: `qwen-proof-${Date.now()}` });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    let known = false;
    try {
      const result = await openAICompatibleChat({
        baseUrl, apiKey, model, maxTokens: 64,
        extraHeaders: workspaceId
          ? { "X-DashScope-WorkSpace": workspaceId }
          : undefined,
        responseFormat: { type: "json_object" },
        messages: [{ role: "user", content: 'Return exactly JSON {"provider":"qwen","proof":"ok"}.' }]
      });
      expect(safeJson(result.content)).toEqual({ provider: "qwen", proof: "ok" });
      expect(result.model).toBe(model);
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
      known = true;
    } finally {
      await reconcile({ reservationId: held.reservationId, actualCostUsd: known ? maxCostUsd : null });
    }
  });
});
