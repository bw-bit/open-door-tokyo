import analysisJson from "@/fixtures/demo-analysis.json";
import publishedJson from "@/fixtures/demo-published.json";
import type { AccessCard } from "./types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getDemoAnalysisCard(): AccessCard {
  return clone(analysisJson as AccessCard);
}

export function getDemoPublishedCard(): AccessCard {
  return clone(publishedJson as AccessCard);
}
