import { describe, expect, it } from "vitest";
import { applyStaffConfirmations } from "@/lib/confirmation";
import { getDemoAnalysisCard } from "@/lib/fixtures";
import { canPublish } from "@/lib/safety/deterministic";

describe("staff confirmation", () => {
  it("preserves analyzed evidence instead of replacing the card", () => {
    const source = getDemoAnalysisCard();
    source.brief.name = "REAL VENUE NAME";
    source.items[0].description.ja = "ライブ解析で得た観察";

    const confirmed = applyStaffConfirmations(
      source,
      [
        {
          field: "entrance.step_presence",
          value: true,
          method: "staff_stated"
        }
      ],
      "店舗担当者"
    );

    expect(confirmed.brief.name).toBe("REAL VENUE NAME");
    expect(confirmed.items).toHaveLength(source.items.length);
    expect(confirmed.safetyAudit.blocked.every((claim) => claim.resolved)).toBe(
      true
    );
    expect(canPublish(confirmed)).toEqual({ ok: true });
  });

  it("updates measured values and provenance", () => {
    const confirmed = applyStaffConfirmations(
      getDemoAnalysisCard(),
      [
        {
          field: "entrance.door_width_cm",
          value: 82,
          method: "staff_measured"
        },
        {
          field: "entrance.step_presence",
          value: true,
          method: "staff_stated"
        }
      ],
      "店舗担当者"
    );
    const width = confirmed.items.find(
      (item) => item.field === "entrance.door_width_cm"
    );
    expect(width?.value).toBe(82);
    expect(width?.description.ja).toContain("82cm");
    expect(width?.provenance.some((source) => source.kind === "staff_input")).toBe(
      true
    );
  });

  it("does not resolve safety claims without every required fact", () => {
    const confirmed = applyStaffConfirmations(
      getDemoAnalysisCard(),
      [],
      "店舗担当者"
    );
    expect(confirmed.safetyAudit.blocked[0].resolved).toBe(false);
    expect(canPublish(confirmed).ok).toBe(false);
  });

  it("records a human correction without discarding video provenance", () => {
    const source = getDemoAnalysisCard();
    const original = source.items.find(
      (item) => item.field === "entrance.door_type"
    );
    expect(original?.provenance.some((entry) => entry.kind === "video_frame")).toBe(
      true
    );

    const confirmed = applyStaffConfirmations(
      source,
      [
        {
          field: "entrance.step_presence",
          value: true,
          method: "staff_stated"
        }
      ],
      "店舗担当者",
      [
        {
          field: "entrance.door_type",
          descriptionJa: "手動で開ける引き戸です",
          descriptionEn: "This is a manually opened sliding door",
          markUnknown: false
        }
      ]
    );
    const corrected = confirmed.items.find(
      (item) => item.field === "entrance.door_type"
    );
    expect(corrected).toMatchObject({
      status: "staff_stated",
      confirmedByStaff: true,
      description: {
        ja: "手動で開ける引き戸です",
        en: "This is a manually opened sliding door"
      }
    });
    expect(
      corrected?.provenance.some((entry) => entry.kind === "video_frame")
    ).toBe(true);
    expect(
      corrected?.provenance.some((entry) => entry.kind === "staff_input")
    ).toBe(true);
  });

  it("lets staff return an uncertain AI observation to unknown", () => {
    const confirmed = applyStaffConfirmations(
      getDemoAnalysisCard(),
      [],
      "店舗担当者",
      [
        {
          field: "entrance.door_type",
          descriptionJa: "映像だけではドアの種類を確認できません",
          descriptionEn: "The door type cannot be confirmed from the video",
          markUnknown: true
        }
      ]
    );
    const corrected = confirmed.items.find(
      (item) => item.field === "entrance.door_type"
    );
    expect(corrected).toMatchObject({
      status: "unknown",
      confirmedByStaff: false,
      confidence: 0,
      value: null
    });
    expect(confirmed.unknowns).toContain("entrance.door_type");
  });
});
