import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/guard", () => ({
  reserve: vi.fn().mockResolvedValue({
    ok: true,
    reservationId: "restroom-reservation",
    slots: 1
  }),
  reconcile: vi.fn().mockResolvedValue({ ok: true })
}));

import { getDemoAnalysisCard, getDemoPublishedCard } from "@/lib/fixtures";
import { analyzeWithQwen } from "@/lib/providers/qwen";

const restroomFields = [
  "restroom.signage_type",
  "restroom.entrance_threshold_height_cm",
  "restroom.path_clear_width_cm",
  "restroom.visible_fixture_types",
  "restroom.grab_bars",
  "restroom.accessible_stall",
  "restroom.diaper_changing_station",
  "restroom.emergency_call_button",
  "restroom.sink_approach_clearance",
  "restroom.turning_space"
] as const;

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.QWEN_BASE_URL;
  delete process.env.QWEN_REGION;
  delete process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD;
});

describe("restroom video analysis", () => {
  it("keeps every unshown restroom detail as needs confirmation", () => {
    for (const card of [getDemoAnalysisCard(), getDemoPublishedCard()]) {
      for (const field of restroomFields) {
        const item = card.items.find((candidate) => candidate.field === field);
        expect(item, field).toBeDefined();
        expect(item?.section, field).toBe("restroom");
        expect(item?.status, field).toBe("unknown");
        expect(item?.value, field).toBeNull();
        expect(item?.description.ja, field).toContain("要確認");
        expect(item?.description.en, field).toContain("Needs confirmation");
        expect(card.unknowns, field).toContain(field);
      }
    }
  });

  it("applies structured visible restroom facts and conservative ranges with exact frame evidence", async () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    process.env.QWEN_BASE_URL = "https://qwen.invalid/v1";
    process.env.QWEN_REGION = "intl";
    process.env.GUARD_QWEN_CHAT_MAX_ACTION_COST_USD = "0.01";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "restroom-live",
          model: "qwen3.7-plus",
          usage: {
            prompt_tokens: 40,
            completion_tokens: 20,
            total_tokens: 60
          },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  observations: [
                    {
                      field: "restroom.visible_fixture_types",
                      description_ja: "洋式便器と洗面台が見えます",
                      description_en: "A toilet and sink are visible",
                      status: "ai_observed",
                      observation_type: "visible_fact",
                      observed_value: "toilet,sink",
                      confidence: 0.9,
                      frame_id: "restroom-02"
                    },
                    {
                      field: "restroom.grab_bars",
                      description_ja: "便器横に水平手すりが1本見えます",
                      description_en: "One horizontal grab bar is visible beside the toilet",
                      status: "ai_observed",
                      observation_type: "visible_fact",
                      observed_value: "one_horizontal_beside_toilet",
                      confidence: 0.86,
                      frame_id: "restroom-02"
                    },
                    {
                      field: "restroom.entrance_threshold_height_cm",
                      description_ja: "入口の床切り替わりは小さく見えます",
                      description_en: "The entrance floor transition appears small",
                      status: "ai_observed",
                      observation_type: "reference_estimate",
                      estimate_range_cm: { min: 1, max: 4 },
                      confidence: 0.58,
                      frame_id: "restroom-01"
                    },
                    {
                      field: "restroom.path_clear_width_cm",
                      description_ja: "入口から便器までの有効幅の参考推定",
                      description_en: "Reference estimate of the clear route width",
                      status: "ai_observed",
                      observation_type: "reference_estimate",
                      estimate_range_cm: { min: 75, max: 95 },
                      confidence: 0.62,
                      frame_id: "restroom-02"
                    }
                  ],
                  unknowns: [
                    "restroom.diaper_changing_station",
                    "restroom.emergency_call_button"
                  ],
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
      cardId: "restroom-live",
      brief: {
        name: "Restroom Sample",
        category: "other",
        languages: ["ja", "en"]
      },
      frames: [
        {
          frameId: "restroom-01",
          tSec: 2,
          dataUrl: "data:image/jpeg;base64,ENTRANCE"
        },
        {
          frameId: "restroom-02",
          tSec: 5,
          dataUrl: "data:image/jpeg;base64,INTERIOR"
        }
      ],
      useFixture: false
    });

    expect(result.trace.mode).toBe("live");
    expect(
      result.data.items.find(
        (item) => item.field === "restroom.visible_fixture_types"
      )
    ).toMatchObject({
      status: "ai_observed",
      value: "toilet,sink",
      provenance: [
        {
          kind: "video_frame",
          frameId: "restroom-02",
          tSec: 5
        }
      ]
    });
    expect(
      result.data.items.find((item) => item.field === "restroom.grab_bars")
    ).toMatchObject({
      value: "one_horizontal_beside_toilet",
      provenance: [{ frameId: "restroom-02", tSec: 5 }]
    });
    expect(
      result.data.items.find(
        (item) => item.field === "restroom.entrance_threshold_height_cm"
      )
    ).toMatchObject({
      value: "reference_estimate_cm:1-4",
      description: {
        ja: "映像からの参考推定：約1〜4cm（実測ではありません）",
        en: "Video-based reference estimate: approx. 1-4 cm (not a measured value)"
      },
      provenance: [{ frameId: "restroom-01", tSec: 2 }]
    });
    expect(
      result.data.items.find(
        (item) => item.field === "restroom.path_clear_width_cm"
      )?.value
    ).toBe("reference_estimate_cm:75-95");
    expect(
      result.data.items.find(
        (item) => item.field === "restroom.diaper_changing_station"
      )
    ).toMatchObject({
      status: "unknown",
      value: null,
      description: {
        ja: "この短い映像では確認できていないため要確認です",
        en: "Needs confirmation because it is not visible in this short video"
      }
    });

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body)
    ) as { messages: unknown };
    const prompt = JSON.stringify(requestBody.messages);
    for (const field of restroomFields) {
      expect(prompt, field).toContain(field);
    }
    expect(prompt).toContain(
      "A short video not showing an item is not evidence that the item is unavailable"
    );
    expect(prompt).toContain(
      "For every observed restroom visible_fact, return a concise structured observed_value"
    );
  });

  it("uses the Japanese description when a valid restroom fact omits observed_value", async () => {
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
                        field: "restroom.grab_bars",
                        description_ja: "手すりが見えます",
                        description_en: "A grab bar is visible",
                        status: "ai_observed",
                        observation_type: "visible_fact",
                        confidence: 0.8,
                        frame_id: "restroom-01"
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
      cardId: "restroom-invalid",
      brief: { name: "Restroom", category: "other", languages: ["ja", "en"] },
      frames: [
        {
          frameId: "restroom-01",
          tSec: 2,
          dataUrl: "data:image/jpeg;base64,RESTROOM"
        }
      ],
      useFixture: false
    });

    expect(result.trace).toMatchObject({ mode: "live", ok: true });
    expect(
      result.data.items.find((item) => item.field === "restroom.grab_bars")
    ).toMatchObject({
      status: "ai_observed",
      value: "手すりが見えます",
      provenance: [{ frameId: "restroom-01", tSec: 2 }]
    });
  });
});
