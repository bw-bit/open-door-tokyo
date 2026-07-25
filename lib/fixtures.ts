import analysisJson from "@/fixtures/demo-analysis.json";
import publishedJson from "@/fixtures/demo-published.json";
import {
  encodeReferenceEstimate,
  referenceEstimateDescription
} from "./reference-estimate";
import type { AccessCard } from "./types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getDemoAnalysisCard(): AccessCard {
  const card = clone(analysisJson as AccessCard);
  const stepHeight = card.items.find(
    (item) => item.field === "entrance.step_height_cm"
  );
  if (stepHeight) {
    const estimate = { minCm: 6, maxCm: 10 };
    stepHeight.description = referenceEstimateDescription(estimate);
    stepHeight.value = encodeReferenceEstimate(estimate);
    stepHeight.status = "ai_observed";
    stepHeight.confidence = 0.64;
    stepHeight.confirmedByStaff = false;
    stepHeight.lastVerifiedAt = null;
  }
  card.unknowns = card.items
    .filter((item) => item.status === "unknown")
    .map((item) => item.field);
  return card;
}

export function getDemoPublishedCard(): AccessCard {
  return clone(publishedJson as AccessCard);
}
