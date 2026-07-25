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
});
