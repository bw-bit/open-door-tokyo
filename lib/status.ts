import type { CardState, FieldStatus, LocalizedText, ProviderMode } from "./types";

export const fieldStatusLabels: Record<FieldStatus, LocalizedText> = {
  ai_observed: { ja: "AI観察", en: "AI observed" },
  staff_stated: { ja: "スタッフ回答", en: "Staff stated" },
  staff_measured: { ja: "スタッフ実測", en: "Staff measured" },
  confirmed: { ja: "確認済み", en: "Confirmed" },
  unknown: { ja: "未確認", en: "Unknown" },
  conflict: { ja: "矛盾", en: "Conflict" }
};

export const providerModeLabels: Record<ProviderMode, string> = {
  live: "LIVE",
  verified_sample: "VERIFIED SAMPLE",
  fallback: "FALLBACK",
  not_configured: "NOT CONFIGURED"
};

const transitions: Record<CardState, CardState[]> = {
  draft: ["uploading"],
  uploading: ["frames_ready", "degraded"],
  frames_ready: ["transcribing", "analyzing", "degraded"],
  transcribing: ["analyzing", "degraded"],
  analyzing: ["auditing", "degraded"],
  auditing: ["review", "degraded"],
  review: ["staff_confirmed", "degraded"],
  staff_confirmed: ["phrasing", "card_built", "degraded"],
  phrasing: ["card_built", "degraded"],
  card_built: ["sandbox_checked", "published", "degraded"],
  sandbox_checked: ["published", "degraded"],
  published: [],
  degraded: ["review", "staff_confirmed", "card_built", "published"]
};

export function canTransition(from: CardState, to: CardState): boolean {
  return transitions[from].includes(to);
}
