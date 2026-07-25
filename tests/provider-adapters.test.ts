import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/guard", () => ({
  reserve: vi.fn().mockResolvedValue({ ok: true, reservationId: "reservation", slots: 1 }),
  reconcile: vi.fn().mockResolvedValue({ ok: true })
}));
const deleteSandbox = vi.fn();
const codeRun = vi.fn();
const nosanaGet = vi.fn();
vi.mock("@daytona/sdk", () => ({
  Daytona: class {
    create = vi.fn().mockResolvedValue({ process: { codeRun } });
    delete = deleteSandbox;
  }
}));
vi.mock("@nosana/kit", () => ({
  NosanaNetwork: { MAINNET: "mainnet" },
  createNosanaClient: () => ({ api: { jobs: { get: nosanaGet } } })
}));

import { getDemoAnalysisCard } from "@/lib/fixtures";
import { auditInDaytona, resetDaytonaLifecycleForTests } from "@/lib/providers/daytona";
import { auditWithGmi } from "@/lib/providers/gmi";
import { phraseWithAiAnd } from "@/lib/providers/aiand";
import { indexWithNosana } from "@/lib/providers/nosana";
import {
  openAICompatibleChat,
  ProviderCallError
} from "@/lib/providers/shared";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  resetDaytonaLifecycleForTests();
  delete process.env.DAYTONA_API_KEY;
  delete process.env.DAYTONA_API_URL;
  delete process.env.DAYTONA_TARGET;
  delete process.env.GUARD_DAYTONA_SANDBOX_MAX_ACTION_COST_USD;
  for (const name of [
    "GMI_API_KEY", "GMI_MODEL", "GMI_BASE_URL", "GUARD_GMI_CHAT_MAX_ACTION_COST_USD",
    "AIAND_API_KEY", "AIAND_MODEL", "AIAND_BASE_URL", "GUARD_AIAND_CHAT_MAX_ACTION_COST_USD",
    "NOSANA_API_KEY", "NOSANA_JOB_ID"
  ]) delete process.env[name];
});

describe("provider adapter transport contract", () => {
  it.each([
    [429, "rate_limited"],
    [500, "provider_http_error"]
  ] as const)("makes one attempt for HTTP %i", async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("closed", { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      openAICompatibleChat({
        baseUrl: "https://provider.invalid/v1",
        apiKey: "test-only",
        model: "fixed-model",
        messages: [{ role: "user", content: "{}" }],
        maxTokens: 64
      })
    ).rejects.toEqual(new ProviderCallError(code));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never preserves a caught transport message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("SECRET_PROVIDER_DIAGNOSTIC"))
    );
    let caught: unknown;
    try {
      await openAICompatibleChat({
        baseUrl: "https://provider.invalid/v1",
        apiKey: "test-only",
        model: "fixed-model",
        messages: [{ role: "user", content: "{}" }],
        maxTokens: 64
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderCallError);
    expect(String(caught)).not.toContain("SECRET_PROVIDER_DIAGNOSTIC");
  });

  it("attempts Daytona deletion exactly once when codeRun rejects", async () => {
    process.env.DAYTONA_API_KEY = "test";
    process.env.DAYTONA_API_URL = "https://daytona.invalid/api";
    process.env.DAYTONA_TARGET = "test-target";
    process.env.GUARD_DAYTONA_SANDBOX_MAX_ACTION_COST_USD = "0.01";
    codeRun.mockRejectedValueOnce(new Error("raw sdk diagnostic"));
    deleteSandbox.mockResolvedValueOnce(undefined);
    const result = await auditInDaytona(getDemoAnalysisCard());
    expect(deleteSandbox).toHaveBeenCalledTimes(1);
    expect(result.trace.ok).toBe(false);
    expect(result.trace.errorCode).toBe("transport_failed");
    expect(JSON.stringify(result.trace)).not.toContain("raw sdk diagnostic");
  });

  it("uses closed not-configured traces for GMI and ai&", async () => {
    for (const result of [
      await auditWithGmi(getDemoAnalysisCard()),
      await phraseWithAiAnd(getDemoAnalysisCard())
    ]) {
      expect(result.trace).toMatchObject({
        mode: "not_configured",
        ok: false,
        errorCode: "config_missing",
        validation: "not_run"
      });
    }
  });

  it("rejects unsupported GMI verdicts without bilingual rewrites", async () => {
    process.env.GMI_API_KEY = "test";
    process.env.GMI_MODEL = "model";
    process.env.GMI_BASE_URL = "";
    process.env.GUARD_GMI_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        verdict: "unsupported", reason: "unsafe", rewrite_ja: "具体的"
      }) } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await auditWithGmi(getDemoAnalysisCard());
    expect(result.trace.errorCode).toBe("semantic_invalid");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.gmi-serving.com/v1/chat/completions"
    );
  });

  it("requires ai& verdict enum and issues array", async () => {
    process.env.AIAND_API_KEY = "test";
    process.env.AIAND_MODEL = "model";
    process.env.AIAND_BASE_URL = "";
    process.env.GUARD_AIAND_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ verdict: "ok" }) } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await phraseWithAiAnd(getDemoAnalysisCard());
    expect(result.trace.errorCode).toBe("semantic_invalid");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.aiand.com/v1/chat/completions"
    );
  });

  it("rejects a mismatched Nosana job identifier", async () => {
    process.env.NOSANA_API_KEY = "test";
    process.env.NOSANA_JOB_ID = "expected-job";
    nosanaGet.mockResolvedValueOnce({ address: "different-job", state: "running" });
    const result = await indexWithNosana(getDemoAnalysisCard());
    expect(nosanaGet).toHaveBeenCalledTimes(1);
    expect(result.trace.errorCode).toBe("semantic_invalid");
    expect(result.trace.ok).toBe(false);
  });

  it("rejects an unknown Nosana job state without a paid call", async () => {
    process.env.NOSANA_API_KEY = "test";
    process.env.NOSANA_JOB_ID = "expected-job";
    nosanaGet.mockResolvedValueOnce({ address: "expected-job", state: 99 });
    const result = await indexWithNosana(getDemoAnalysisCard());
    expect(nosanaGet).toHaveBeenCalledTimes(1);
    expect(result.trace.errorCode).toBe("semantic_invalid");
  });
});
