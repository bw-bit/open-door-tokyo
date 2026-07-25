import { describe, expect, it } from "vitest";
import { getDemoAnalysisCard, getDemoPublishedCard } from "@/lib/fixtures";
import {
  canUseReferenceEstimate,
  encodeReferenceEstimate,
  isReferenceEstimate,
  parseReferenceEstimate,
  referenceEstimateDescription
} from "@/lib/reference-estimate";

describe("reference estimate contract", () => {
  it("recognizes only an evidenced AI range, not a staff measurement", () => {
    const analysis = getDemoAnalysisCard();
    const estimate = analysis.items.find(
      (item) => item.field === "entrance.step_height_cm"
    );
    expect(estimate && isReferenceEstimate(estimate)).toBe(true);
    expect(parseReferenceEstimate(estimate?.value ?? null)).toEqual({
      minCm: 6,
      maxCm: 10
    });

    const measured = getDemoPublishedCard().items.find(
      (item) => item.field === "entrance.step_height_cm"
    );
    expect(measured && isReferenceEstimate(measured)).toBe(false);
  });

  it("allows ranges only for bounded measurement fields", () => {
    expect(canUseReferenceEstimate("entrance.step_height_cm")).toBe(true);
    expect(canUseReferenceEstimate("entrance.door_width_cm")).toBe(true);
    expect(
      canUseReferenceEstimate("path_to_seat.narrowest_passage_cm")
    ).toBe(true);
    expect(canUseReferenceEstimate("entrance.step_presence")).toBe(false);
    expect(canUseReferenceEstimate("path_to_seat.turning_space")).toBe(false);
  });

  it("rejects malformed, exact, and implausible encoded ranges", () => {
    expect(parseReferenceEstimate("reference_estimate_cm:3-5")).toEqual({
      minCm: 3,
      maxCm: 5
    });
    expect(parseReferenceEstimate("reference_estimate_cm:4-4")).toBeNull();
    expect(parseReferenceEstimate("reference_estimate_cm:5-3")).toBeNull();
    expect(parseReferenceEstimate("reference_estimate_cm:0-501")).toBeNull();
    expect(parseReferenceEstimate("reference_estimate_cm:3-5-9")).toBeNull();
    expect(parseReferenceEstimate(4)).toBeNull();
  });

  it("generates fixed bilingual non-measurement wording", () => {
    const range = { minCm: 3, maxCm: 5 };
    expect(encodeReferenceEstimate(range)).toBe("reference_estimate_cm:3-5");
    expect(referenceEstimateDescription(range)).toEqual({
      ja: "映像からの参考推定：約3〜5cm（実測ではありません）",
      en: "Video-based reference estimate: approx. 3-5 cm (not a measured value)"
    });
  });
});
