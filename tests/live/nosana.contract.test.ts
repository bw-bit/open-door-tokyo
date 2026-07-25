import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDemoAnalysisCard } from "@/lib/fixtures";
import { indexWithNosana } from "@/lib/providers/nosana";

describe.skipIf(process.env.RUN_LIVE_PROVIDER_TESTS !== "1")("Nosana live contract", () => {
  it("reads exactly one configured existing job", async () => {
    const result = await indexWithNosana(getDemoAnalysisCard());
    expect(result.trace.mode).toBe("live");
    expect(result.trace.validation).toBe("schema_and_semantic_passed");
  });
});
