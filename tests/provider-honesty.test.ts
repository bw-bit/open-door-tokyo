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
          model: "qwen3.7-plus",
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
                    },
                    {
                      field: "entrance.door_operation",
                      description_ja: "手前に引いて開ける手動ドアと推定",
                      description_en: "Appears to be a manual pull door",
                      status: "ai_observed",
                      observation_type: "visible_fact",
                      observed_value: "manual_pull_outward",
                      confidence: 0.81,
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
      "この短い映像では確認できていないため要確認です"
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
    expect(requestBody.max_tokens).toBe(2400);
    expect(JSON.stringify(requestBody.messages)).toContain(
      "entrance.step_presence"
    );
    expect(JSON.stringify(requestBody.messages)).toContain(
      "entrance.glass_visibility"
    );
    expect(JSON.stringify(requestBody.messages)).toContain(
      "Do not mark a field unknown merely because it was not physically measured"
    );
    expect(
      result.data.items.find(
        (item) => item.field === "entrance.door_operation"
      )
    ).toMatchObject({
      status: "ai_observed",
      value: "manual_pull_outward",
      description: {
        ja: "手前に引いて開ける手動ドアと推定",
        en: "Appears to be a manual pull door"
      }
    });
    expect(result.data.items[0].provenance[0]).toMatchObject({
      kind: "video_frame",
      frameId: "frame-01",
      tSec: 3
    });
    expect(result.data.unknowns).toContain("restroom.interior_equipment");
    expect(vi.mocked(reconcile)).toHaveBeenCalledWith({
      reservationId: "test-reservation",
      actualCostUsd: 0.0000312
    });
  });

  it("applies a width-bearing Qwen reference estimate without presenting it as measured", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://qwen.invalid/v1";
    process.env.QWEN_REGION = "intl";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "request-estimate",
          model: "qwen3.7-plus",
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
                      field: "entrance.step_height_cm",
                      description_ja: "段差は4cm程度に見えます",
                      description_en: "The step appears about 4 cm high",
                      status: "ai_observed",
                      observation_type: "reference_estimate",
                      estimate_range_cm: { min: 3, max: 5 },
                      confidence: 0.62,
                      frame_id: "frame-01"
                    }
                  ],
                  unknowns: [],
                  proposed_claims: []
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeWithQwen({
      cardId: "reference-estimate",
      brief: { name: "Venue", category: "cafe", languages: ["ja", "en"] },
      frames: [
        {
          frameId: "frame-01",
          tSec: 2.5,
          dataUrl: "data:image/jpeg;base64,REAL"
        }
      ],
      useFixture: false
    });

    const estimate = result.data.items.find(
      (item) => item.field === "entrance.step_height_cm"
    );
    expect(result.trace.mode).toBe("live");
    expect(estimate).toMatchObject({
      status: "ai_observed",
      value: "reference_estimate_cm:3-5",
      confirmedByStaff: false,
      description: {
        ja: "映像からの参考推定：約3〜5cm（実測ではありません）",
        en: "Video-based reference estimate: approx. 3-5 cm (not a measured value)"
      }
    });
    expect(estimate?.provenance[0]).toMatchObject({
      kind: "video_frame",
      frameId: "frame-01",
      tSec: 2.5
    });
    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body)
    ) as { messages: unknown };
    expect(JSON.stringify(requestBody.messages)).toContain(
      "Never decide whether a wheelchair user can use the venue"
    );
    expect(JSON.stringify(requestBody.messages)).toContain(
      "reference_estimate_fields"
    );
  });

  it.each([
    [
      "an exact number without range width",
      {
        description_ja: "段差は4cmです",
        description_en: "The step is 4 cm",
        estimate_range_cm: { min: 4, max: 4 },
        confidence: 0.6
      }
    ],
    [
      "an overconfident estimate",
      {
        description_ja: "段差は約3〜5cmです",
        description_en: "The step is about 3-5 cm",
        estimate_range_cm: { min: 3, max: 5 },
        confidence: 0.96
      }
    ],
    [
      "a wheelchair usability decision",
      {
        description_ja: "約3〜5cmなので車椅子で利用可能です",
        description_en: "The 3-5 cm step is wheelchair accessible",
        estimate_range_cm: { min: 3, max: 5 },
        confidence: 0.6
      }
    ]
  ])("fails closed for Qwen reference estimate with %s", async (_label, unsafe) => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://qwen.invalid/v1";
    process.env.QWEN_REGION = "intl";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "qwen3.7-plus",
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              total_tokens: 30
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    observations: [
                      {
                        field: "entrance.step_height_cm",
                        status: "ai_observed",
                        observation_type: "reference_estimate",
                        frame_id: "frame-01",
                        ...unsafe
                      }
                    ],
                    unknowns: [],
                    proposed_claims: []
                  })
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
    );

    const result = await analyzeWithQwen({
      cardId: `unsafe-estimate-${_label}`,
      brief: { name: "Venue", category: "cafe", languages: ["ja", "en"] },
      frames: [
        {
          frameId: "frame-01",
          tSec: 2,
          dataUrl: "data:image/jpeg;base64,REAL"
        }
      ],
      useFixture: false
    });
    expect(result.trace).toMatchObject({
      mode: "fallback",
      ok: false,
      validation: "failed"
    });
    expect(result.data.items.every((item) => item.status === "unknown")).toBe(
      true
    );
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
    expect(JSON.parse(String(init.body)).model).toBe("qwen3.7-plus");
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
      }),
      "semantic_invalid"
    ],
    ["malformed JSON", "{not-json", "schema_invalid"]
  ] as const)("fails closed for a Qwen response with %s", async (_label, content, errorCode) => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://qwen.invalid/v1";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "qwen3.7-plus",
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
      errorCode,
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
        prompt_tokens: 256_001,
        completion_tokens: 1,
        total_tokens: 256_002
      }
    ]
  ])("quarantines Qwen reservation when usage is %s", async (_label, usage) => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "qwen3.7-plus",
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

  it("reconciles qwen3.7-plus at the <=256K price tier within the $0.11 guard", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.11";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "qwen3.7-plus",
            usage: {
              prompt_tokens: 256_000,
              completion_tokens: 2_400,
              total_tokens: 258_400
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    observations: [
                      {
                        field: "entrance.step_presence",
                        description_ja: "入口の段差が見えます",
                        description_en: "An entrance step is visible",
                        status: "ai_observed",
                        observed_value: true,
                        confidence: 0.8,
                        frame_id: "frame-01"
                      }
                    ],
                    unknowns: [],
                    proposed_claims: []
                  })
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
    );

    const result = await analyzeWithQwen({
      cardId: "qwen37-upper-price-tier",
      brief: { name: "Venue", category: "cafe", languages: ["ja", "en"] },
      frames: [
        {
          frameId: "frame-01",
          tSec: 1,
          dataUrl: "data:image/jpeg;base64,REAL"
        }
      ],
      useFixture: false
    });

    expect(result.trace.mode).toBe("live");
    expect(vi.mocked(reconcile)).toHaveBeenCalledWith({
      reservationId: "test-reservation",
      actualCostUsd: 0.10624
    });
  });

  it("sends direct video at fps 1 while preserving the four evidence frames", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.11";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "qwen3.7-plus",
          usage: {
            prompt_tokens: 30,
            completion_tokens: 10,
            total_tokens: 40
          },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  observations: [
                    {
                      field: "restroom.visible_fixture_types",
                      description_ja: "洋式便器が見えます",
                      description_en: "A toilet is visible",
                      status: "ai_observed",
                      observed_value: "toilet",
                      confidence: 0.8,
                      frame_id: "frame-02"
                    },
                    {
                      field: "restroom.provider_format_drift",
                      description_ja: "この不正項目だけを無視",
                      description_en: "Skip only this invalid item",
                      status: "ai_observed",
                      observed_value: "invalid_field",
                      confidence: 0.9,
                      frame_id: "frame-02"
                    }
                  ],
                  unknowns: [],
                  proposed_claims: []
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const frames = Array.from({ length: 4 }, (_, index) => ({
      frameId: `frame-0${index + 1}`,
      tSec: index + 1,
      dataUrl: `data:image/jpeg;base64,FRAME${index + 1}`
    }));

    const result = await analyzeWithQwen({
      cardId: "direct-video",
      brief: { name: "Venue", category: "other", languages: ["ja", "en"] },
      frames,
      videoDataUrl: "data:video/mp4;base64,QUJDRA==",
      useFixture: false
    });

    expect(result.trace.mode).toBe("live");
    expect(result.data.frames).toHaveLength(4);
    expect(result.data.frames.map(({ frameId }) => frameId)).toEqual(
      frames.map(({ frameId }) => frameId)
    );
    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body)
    ) as {
      model: string;
      max_tokens: number;
      messages: Array<{ content: unknown }>;
    };
    expect(requestBody.model).toBe("qwen3.7-plus");
    expect(requestBody.max_tokens).toBe(2400);
    expect(requestBody.messages[1].content).toEqual(
      expect.arrayContaining([
        {
          type: "video_url",
          video_url: { url: "data:video/mp4;base64,QUJDRA==" },
          fps: 1
        }
      ])
    );
  });

  it("rejects an unsafe accessibility claim hidden in observed_value", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.11";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "qwen3.7-plus",
            usage: {
              prompt_tokens: 30,
              completion_tokens: 10,
              total_tokens: 40
            },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    observations: [
                      {
                        field: "entrance.door_operation",
                        description_ja: "手動ドアが見えます",
                        description_en: "A manual door is visible",
                        status: "ai_observed",
                        observation_type: "visible_fact",
                        observed_value: "wheelchair accessible",
                        confidence: 0.8,
                        frame_id: "frame-01"
                      }
                    ],
                    unknowns: [],
                    proposed_claims: []
                  })
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
    );

    const result = await analyzeWithQwen({
      cardId: "unsafe-observed-value",
      brief: { name: "Venue", category: "other", languages: ["ja", "en"] },
      frames: [
        {
          frameId: "frame-01",
          tSec: 1,
          dataUrl: "data:image/jpeg;base64,REAL"
        }
      ],
      useFixture: false
    });

    expect(result.trace).toMatchObject({
      mode: "fallback",
      ok: false,
      errorCode: "semantic_invalid",
      validation: "failed"
    });
    expect(result.data.items.every((item) => item.status === "unknown")).toBe(
      true
    );
  });

  it("does not apply known model rates to an unsupported override model", async () => {
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
