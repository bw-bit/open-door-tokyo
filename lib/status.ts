import type { CardState, FieldStatus, LocalizedText, ProviderMode } from "./types";

export const fieldStatusLabels: Record<FieldStatus, LocalizedText> = {
  ai_observed: { ja: "動画から推定", en: "Estimated from video" },
  staff_stated: { ja: "店舗確認", en: "Venue confirmed" },
  staff_measured: { ja: "実測", en: "Measured" },
  confirmed: { ja: "店舗確認", en: "Venue confirmed" },
  unknown: { ja: "要確認", en: "Needs confirmation" },
  conflict: { ja: "矛盾", en: "Conflict" }
};

export const providerModeLabels: Record<ProviderMode, string> = {
  live: "実API",
  verified_sample: "検証済みサンプル",
  fallback: "安全フォールバック",
  not_configured: "未接続"
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
