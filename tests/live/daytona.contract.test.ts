import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDemoAnalysisCard } from "@/lib/fixtures";
import { auditInDaytona } from "@/lib/providers/daytona";

describe.skipIf(process.env.RUN_LIVE_PROVIDER_TESTS !== "1")("Daytona live contract", () => {
  it("creates at most one ephemeral sandbox and completes deletion", async () => {
    const result = await auditInDaytona(getDemoAnalysisCard());
    expect(result.trace.mode).toBe("live");
    expect(result.trace.validation).toBe("schema_and_semantic_passed");
  });
});
