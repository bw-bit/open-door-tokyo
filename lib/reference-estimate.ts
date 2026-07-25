import type { EvidenceItem, LocalizedText } from "./types";

const ESTIMATE_PREFIX = "reference_estimate_cm:";
const ESTIMATE_PATTERN =
  /^reference_estimate_cm:(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;
const ESTIMATABLE_FIELDS = new Set([
  "entrance.step_height_cm",
  "entrance.door_width_cm",
  "path_to_seat.narrowest_passage_cm"
]);

export type ReferenceEstimate = {
  minCm: number;
  maxCm: number;
};

export function canUseReferenceEstimate(field: string): boolean {
  return ESTIMATABLE_FIELDS.has(field);
}

export function encodeReferenceEstimate(input: ReferenceEstimate): string {
  return `${ESTIMATE_PREFIX}${input.minCm}-${input.maxCm}`;
}

export function parseReferenceEstimate(
  value: EvidenceItem["value"]
): ReferenceEstimate | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = ESTIMATE_PATTERN.exec(value);
  if (!match) return null;
  const minCm = Number(match[1]);
  const maxCm = Number(match[2]);
  if (
    !Number.isFinite(minCm) ||
    !Number.isFinite(maxCm) ||
    minCm < 0 ||
    maxCm > 500 ||
    maxCm - minCm < 1
  ) {
    return null;
  }
  return { minCm, maxCm };
}

export function isReferenceEstimate(
  item: Pick<EvidenceItem, "field" | "status" | "value" | "provenance">
): boolean {
  return (
    item.status === "ai_observed" &&
    canUseReferenceEstimate(item.field) &&
    parseReferenceEstimate(item.value) !== null &&
    item.provenance.some(
      (source) =>
        source.kind === "video_frame" &&
        source.frameId !== undefined &&
        source.tSec !== undefined
    )
  );
}

export function referenceEstimateDescription(
  input: ReferenceEstimate
): LocalizedText {
  return {
    ja: `映像からの参考推定：約${input.minCm}〜${input.maxCm}cm（実測ではありません）`,
    en: `Video-based reference estimate: approx. ${input.minCm}-${input.maxCm} cm (not a measured value)`
  };
}
