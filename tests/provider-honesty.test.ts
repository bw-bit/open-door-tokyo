import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/guard", () => ({
  reserve: vi.fn().mockResolvedValue({
    ok: true,
    reservationId: "test-reservation",
    slots: 1
  }),
  reconcile: vi.fn().mockResolvedValue({ ok: true })
}));

import { getDemoAnalysisCard } from "@/lib/fixtures";
import { phraseWithAiAnd } from "@/lib/providers/aiand";
import { auditInDaytona } from "@/lib/providers/daytona";
import { auditWithGmi } from "@/lib/providers/gmi";
import { analyzeWithQwen } from "@/lib/providers/qwen";
import { reconcile } from "@/lib/guard";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.QWEN_BASE_URL;
  delete process.env.QWEN_MODEL;
  delete process.env.QWEN_REGION;
  delete process.env.QWEN_WORKSPACE_ID;
  delete process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD;
  delete process.env.GMI_API_KEY;
  delete process.env.GMI_MODEL;
  delete process.env.GUARD_GMI_CHAT_MAX_ACTION_COST_USD;
  delete process.env.DAYTONA_API_KEY;
  delete process.env.AIAND_API_KEY;
  delete process.env.AIAND_MODEL;
  delete process.env.GUARD_AIAND_CHAT_MAX_ACTION_COST_USD;
});

describe("provider mode honesty", () => {
  it("applies a validated Qwen response before reporting LIVE", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://qwen.invalid/v1";
    process.env.QWEN_REGION = "intl";
    process.env.QWEN_WORKSPACE_ID = "test-workspace";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "request-live",
          model: "qwen3.6-flash",
          usage: {
            prompt_tokens: 30,
            completion_tokens: 12,
            total_tokens: 42
          },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  observations: [
                    {
                      field: "entrance.step_presence",
                      description_ja: "ライブ観察を反映",
                      description_en: "Applied live observation",
                      status: "ai_observed",
                      confidence: 0.88,
                      frame_id: "frame-01"
                    }
                  ],
                  unknowns: ["restroom.interior_equipment"],
                  proposed_claims: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal(
      "fetch",
      fetchMock
    );

    const result = await analyzeWithQwen({
      cardId: "live-test",
      brief: {
        name: "Live Venue",
        category: "cafe",
        languages: ["ja", "en"]
      },
      frames: [
        {
          frameId: "frame-01",
          tSec: 3,
          dataUrl: "data:image/jpeg;base64,TEST"
        }
      ],
      useFixture: false
    });

    expect(result.trace.mode).toBe("live");
    expect(result.data.items[0].description.ja).toBe("ライブ観察を反映");
    expect(result.data.frames[0].url).toBe("data:image/jpeg;base64,TEST");
    expect(result.data.items[1].status).toBe("unknown");
    expect(result.data.items[1].description.ja).toBe(
      "映像からは確認できていません"
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "X-DashScope-WorkSpace": "test-workspace"
    });
    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body)
    ) as {
      enable_thinking?: boolean;
      max_tokens?: number;
      messages?: Array<{ content?: string | Array<{ text?: string }> }>;
    };
    expect(requestBody.enable_thinking).toBe(false);
    expect(requestBody.max_tokens).toBe(768);
    expect(JSON.stringify(requestBody.messages)).toContain(
      "entrance.step_presence"
    );
    expect(result.data.items[0].provenance[0]).toMatchObject({
      kind: "video_frame",
      frameId: "frame-01",
      tSec: 3
    });
    expect(result.data.unknowns).toContain("restroom.interior_equipment");
    expect(vi.mocked(reconcile)).toHaveBeenCalledWith({
      reservationId: "test-reservation",
      actualCostUsd: 0.0000255
    });
  });

  it("does not call Qwen when its configured region is unsupported", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://qwen.invalid/v1";
    process.env.QWEN_MODEL = "test-model";
    process.env.QWEN_REGION = "cn-beijing";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzeWithQwen({
      cardId: "tuple-incomplete",
      brief: { name: "Venue", category: "cafe", languages: ["ja", "en"] },
      frames: [{ frameId: "frame", tSec: 1, dataUrl: "data:image/jpeg;base64,X" }],
      useFixture: false
    });
    expect(result.trace).toMatchObject({
      mode: "not_configured",
      ok: false,
      errorCode: "config_missing",
      validation: "not_run"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses official intl defaults without a workspace header", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("closed", { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzeWithQwen({
      cardId: "official-defaults",
      brief: { name: "Venue", category: "cafe", languages: ["ja", "en"] },
      frames: [{ frameId: "frame", tSec: 1, dataUrl: "data:image/jpeg;base64,X" }],
      useFixture: false
    });
    expect(result.trace.errorCode).toBe("provider_http_error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("X-DashScope-WorkSpace");
    expect(JSON.parse(String(init.body)).model).toBe("qwen3.6-flash");
    expect(JSON.parse(String(init.body)).enable_thinking).toBe(false);
  });

  it.each([
    [
      "unknown field",
      JSON.stringify({
        observations: [{
          field: "entrance.invented_field",
          description_ja: "存在しない項目",
          description_en: "Invented field",
          status: "ai_observed",
          confidence: 0.9,
          frame_id: "frame-01"
        }],
        unknowns: [],
        proposed_claims: []
      })
    ],
    ["malformed JSON", "{not-json"]
  ])("fails closed for a Qwen response with %s", async (_label, content) => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://qwen.invalid/v1";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "qwen3.6-flash",
      usage: {
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 20
      },
      choices: [{ message: { content } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzeWithQwen({
      cardId: `invalid-${_label}`,
      brief: { name: "Venue", category: "cafe", languages: ["ja", "en"] },
      frames: [{
        frameId: "frame-01",
        tSec: 2,
        dataUrl: "data:image/jpeg;base64,REAL"
      }],
      useFixture: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.trace).toMatchObject({
      mode: "fallback",
      ok: false,
      errorCode: "schema_invalid",
      validation: "failed"
    });
    expect(result.data.items.every((item) => item.status === "unknown")).toBe(true);
    expect(result.data.frames[0].frameId).toBe("frame-01");
  });

  it.each([
    ["missing", undefined],
    [
      "inconsistent",
      { prompt_tokens: 10, completion_tokens: 5, total_tokens: 99 }
    ],
    [
      "negative",
      { prompt_tokens: -1, completion_tokens: 5, total_tokens: 4 }
    ],
    [
      "outside the supported pricing window",
      {
        prompt_tokens: 256_000,
        completion_tokens: 1,
        total_tokens: 256_001
      }
    ]
  ])("quarantines Qwen reservation when usage is %s", async (_label, usage) => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "qwen3.6-flash",
      ...(usage ? { usage } : {}),
      choices: [{ message: { content: JSON.stringify({
        observations: [{
          field: "entrance.step_presence",
          description_ja: "入口に段差が見えます",
          description_en: "A step is visible at the entrance",
          status: "ai_observed",
          confidence: 0.8,
          frame_id: "frame-01"
        }],
        unknowns: [],
        proposed_claims: []
      }) } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzeWithQwen({
      cardId: `usage-${_label}`,
      brief: { name: "Venue", category: "cafe", languages: ["ja", "en"] },
      frames: [{
        frameId: "frame-01",
        tSec: 2,
        dataUrl: "data:image/jpeg;base64,REAL"
      }],
      useFixture: false
    });
    expect(result.trace.errorCode).toBe("semantic_invalid");
    expect(vi.mocked(reconcile)).toHaveBeenCalledWith({
      reservationId: "test-reservation",
      actualCostUsd: null
    });
  });

  it("does not apply qwen3.6-flash rates to an override model", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_MODEL = "another-model";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "another-model",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      },
      choices: [{ message: { content: JSON.stringify({
        observations: [{
          field: "entrance.step_presence",
          description_ja: "入口に段差が見えます",
          description_en: "A step is visible at the entrance",
          status: "ai_observed",
          confidence: 0.8,
          frame_id: "frame-01"
        }],
        unknowns: [],
        proposed_claims: []
      }) } }]
    }), { status: 200 })));
    const result = await analyzeWithQwen({
      cardId: "override-model",
      brief: { name: "Venue", category: "cafe", languages: ["ja", "en"] },
      frames: [{
        frameId: "frame-01",
        tSec: 2,
        dataUrl: "data:image/jpeg;base64,REAL"
      }],
      useFixture: false
    });
    expect(result.trace.errorCode).toBe("semantic_invalid");
    expect(vi.mocked(reconcile)).toHaveBeenCalledWith({
      reservationId: "test-reservation",
      actualCostUsd: null
    });
  });

  it("never substitutes demo facts or frames for a real upload when Qwen is not configured", async () => {
    const result = await analyzeWithQwen({
      cardId: "real-upload",
      brief: {
        name: "Real Venue",
        category: "cafe",
        languages: ["ja", "en"]
      },
      frames: [
        {
          frameId: "uploaded-frame",
          tSec: 2.5,
          dataUrl: "data:image/jpeg;base64,REAL_UPLOAD"
        }
      ],
      transcript: "",
      useFixture: false
    });

    expect(result.trace.mode).toBe("not_configured");
    expect(result.data.frames).toHaveLength(1);
    expect(result.data.frames[0].url).toBe(
      "data:image/jpeg;base64,REAL_UPLOAD"
    );
    expect(result.data.items.every((item) => item.status === "unknown")).toBe(
      true
    );
    expect(result.data.items.every((item) => item.value === null)).toBe(true);
    expect(
      result.data.items.every((item) => item.provenance.length === 0)
    ).toBe(true);
    expect(result.data.unknowns).toHaveLength(result.data.items.length);
  });

  it("fails closed to the real upload frames when the live Qwen call fails", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://qwen.invalid/v1";
    process.env.QWEN_MODEL = "test-model";
    process.env.QWEN_REGION = "intl";
    process.env.QWEN_WORKSPACE_ID = "test-workspace";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await analyzeWithQwen({
      cardId: "real-upload-fallback",
      brief: {
        name: "Real Venue",
        category: "cafe",
        languages: ["ja", "en"]
      },
      frames: [
        {
          frameId: "uploaded-frame",
          tSec: 6,
          dataUrl: "data:image/jpeg;base64,REAL_UPLOAD"
        }
      ],
      transcript: "",
      useFixture: false
    });

    expect(result.trace.mode).toBe("fallback");
    expect(result.data.frames[0].url).toBe(
      "data:image/jpeg;base64,REAL_UPLOAD"
    );
    expect(result.data.items.every((item) => item.status === "unknown")).toBe(
      true
    );
    expect(result.data.safetyAudit.blocked[0].suggestion.ja).not.toContain(
      "1段"
    );
  });

  it("keeps a deterministic safety block unresolved before staff review", async () => {
    const result = await auditWithGmi(getDemoAnalysisCard());
    expect(result.trace.mode).toBe("not_configured");
    expect(result.data.safetyAudit.blocked[0].resolved).toBe(false);
  });

  it("reports zero Daytona checks when the sandbox is not configured", async () => {
    const result = await auditInDaytona(getDemoAnalysisCard());
    expect(result.trace.mode).toBe("not_configured");
    expect(result.data.sandbox?.checksRun).toBe(0);
    expect(result.data.sandbox?.issuesFixed).toBe(0);
  });

  it("does not report ai& LIVE when its verdict rejects the copy", async () => {
    process.env.AIAND_API_KEY = "test-key";
    process.env.AIAND_MODEL = "test-model";
    process.env.GUARD_AIAND_CHAT_MAX_ACTION_COST_USD = "0.01";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "test-model",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: "reject",
                    issues: ["unsupported wording"]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const result = await phraseWithAiAnd(getDemoAnalysisCard());
    expect(result.trace.mode).toBe("fallback");
    expect(result.trace.errorCode).toBe("semantic_invalid");
  });
});
