import "server-only";

import { createHmac } from "node:crypto";
import type {
  AccessCard,
  EvidenceItem,
  LocalizedText,
  Provenance
} from "./types";
import { parseReferenceEstimate } from "./reference-estimate";
import { listingPublishPayloadSchema } from "./listing-contract";

export type ListingSyncStatus =
  | "not_configured"
  | "missing_location"
  | "schema_invalid"
  | "delivered"
  | "rejected"
  | "timeout"
  | "transport_failed";

type ListingFeatureKey =
  | "wheelchair_access"
  | "stroller_access"
  | "hearing_writing_support"
  | "english_menu"
  | "step_free"
  | "wide_entrance"
  | "movable_seating";

type ListingEvidence = {
  sourceType:
    | "staff_statement"
    | "on_site_observation"
    | "public_card";
  sourceLabel: LocalizedText;
  observedAt: string;
  url: string;
};

type ListingFeature = {
  key: ListingFeatureKey;
  status: "confirmed" | "unconfirmed" | "not_available";
  detail: LocalizedText;
  evidence: ListingEvidence;
};

export type ListingAccessCard = {
  id: string;
  name: LocalizedText;
  category: LocalizedText;
  address: LocalizedText;
  location: { lat: number; lng: number };
  googleMapsUrl: string;
  accessCards: {
    ja: { summary: string };
    en: { summary: string };
  };
  features: ListingFeature[];
  lastReviewedAt: string;
};

const categoryLabels: Record<AccessCard["brief"]["category"], LocalizedText> = {
  cafe: { ja: "カフェ", en: "Cafe" },
  restaurant: { ja: "レストラン", en: "Restaurant" },
  other: { ja: "その他", en: "Other" }
};

function usableLocation(card: AccessCard): boolean {
  const { address, googleMapsUrl, location } = card.brief;
  if (
    !address?.ja.trim() ||
    !address.en.trim() ||
    !googleMapsUrl ||
    !location ||
    !Number.isFinite(location.lat) ||
    location.lat < 35.4 ||
    location.lat > 35.95 ||
    !Number.isFinite(location.lng) ||
    location.lng < 138.9 ||
    location.lng > 140.1
  ) return false;
  try {
    new URL(googleMapsUrl);
    return true;
  } catch {
    return false;
  }
}

function supportedProvenance(
  item: EvidenceItem | undefined
): Provenance | undefined {
  if (!item) return undefined;
  if (
    ["staff_stated", "staff_measured", "confirmed"].includes(item.status)
  ) {
    return item.provenance.find(({ kind }) => kind === "staff_input");
  }
  if (item.status === "ai_observed") {
    return item.provenance.find(({ kind }) => kind === "video_frame");
  }
  return undefined;
}

function evidenceFor(
  card: AccessCard,
  publicUrl: string,
  item?: EvidenceItem
): ListingEvidence {
  const provenance = supportedProvenance(item);
  if (provenance?.kind === "staff_input") {
    return {
      sourceType: "staff_statement",
      sourceLabel: {
        ja: "店舗スタッフが確認したAccess Card",
        en: "Access Card confirmed by venue staff"
      },
      observedAt: provenance.capturedAt,
      url: publicUrl
    };
  }
  if (provenance?.kind === "video_frame") {
    return {
      sourceType: "on_site_observation",
      sourceLabel: {
        ja: "店舗動画の時刻付き観察",
        en: "Timestamped venue-video observation"
      },
      observedAt: provenance.capturedAt,
      url: publicUrl
    };
  }
  return {
    sourceType: "public_card",
    sourceLabel: {
      ja: "OPEN DOOR TOKYO公開カード（要確認）",
      en: "OPEN DOOR TOKYO public card (unconfirmed)"
    },
    observedAt: card.updatedAt,
    url: publicUrl
  };
}

function item(card: AccessCard, field: string): EvidenceItem | undefined {
  return card.items.find((candidate) => candidate.field === field);
}

function booleanFeature(
  card: AccessCard,
  publicUrl: string,
  key: ListingFeatureKey,
  field: string,
  confirmedDetail: LocalizedText,
  unavailableDetail: LocalizedText,
  unconfirmedDetail: LocalizedText,
  allowVideoObservation = false
): ListingFeature {
  const source = item(card, field);
  const provenance = supportedProvenance(source);
  const evidencedBoolean =
    (provenance?.kind === "staff_input" ||
      (allowVideoObservation && provenance?.kind === "video_frame")) &&
    typeof source?.value === "boolean";
  const status =
    evidencedBoolean
      ? source!.value
        ? "confirmed"
        : "not_available"
      : "unconfirmed";
  return {
    key,
    status,
    detail:
      status === "confirmed"
        ? confirmedDetail
        : status === "not_available"
          ? unavailableDetail
          : unconfirmedDetail,
    evidence: evidenceFor(card, publicUrl, status === "unconfirmed" ? undefined : source)
  };
}

export function toListingAccessCard(
  card: AccessCard,
  publicUrl: string
): ListingAccessCard | null {
  if (!usableLocation(card)) return null;
  const step = item(card, "entrance.step_presence");
  const stepEvidence = supportedProvenance(step);
  const measuredWidth = item(card, "entrance.door_width_cm");
  const doorType = item(card, "entrance.door_type");
  const doorOperation = item(card, "entrance.door_operation");
  const estimatedWidth = measuredWidth
    ? parseReferenceEstimate(measuredWidth.value)
    : null;
  const hasMeasuredWidth =
    supportedProvenance(measuredWidth)?.kind === "staff_input" &&
    typeof measuredWidth?.value === "number";
  const doorSummaryJa = [doorType, doorOperation]
    .filter((entry) => entry && entry.status !== "unknown")
    .map((entry) => entry!.description.ja)
    .join(" ");
  const doorSummaryEn = [doorType, doorOperation]
    .filter((entry) => entry && entry.status !== "unknown")
    .map((entry) => entry!.description.en)
    .join(" ");
  const widthSummaryJa = hasMeasuredWidth
    ? `入口幅は実測${measuredWidth!.value}cmです。`
    : estimatedWidth
      ? `入口幅は動画から約${estimatedWidth.minCm}〜${estimatedWidth.maxCm}cmと推定しています（実測ではありません）。`
      : "入口幅は要確認です。";
  const widthSummaryEn = hasMeasuredWidth
    ? `The measured entrance width is ${measuredWidth!.value} cm.`
    : estimatedWidth
      ? `The entrance width is estimated from video at approx. ${estimatedWidth.minCm}-${estimatedWidth.maxCm} cm (not measured).`
      : "The entrance width needs confirmation.";

  const features: ListingFeature[] = [
    {
      key: "wheelchair_access",
      status: "unconfirmed",
      detail: {
        ja: "車椅子での利用可否は認定しません。段差や幅など個別の事実を公開カードで確認してください。",
        en: "This does not certify wheelchair suitability. Review the individual step and width facts on the public card."
      },
      evidence: evidenceFor(card, publicUrl)
    },
    {
      key: "stroller_access",
      status: "unconfirmed",
      detail: {
        ja: "ベビーカーでの利用可否は認定しません。段差や幅の具体情報をご確認ください。",
        en: "Stroller suitability is unconfirmed."
      },
      evidence: evidenceFor(card, publicUrl)
    },
    booleanFeature(
      card,
      publicUrl,
      "hearing_writing_support",
      "communication.writing_support",
      { ja: "店舗スタッフが筆談対応を確認しました。", en: "Venue staff confirmed written communication support." },
      { ja: "店舗スタッフが筆談対応なしと回答しました。", en: "Venue staff reported that written communication support is unavailable." },
      { ja: "筆談対応は要確認です。", en: "Written communication support needs confirmation." }
    ),
    booleanFeature(
      card,
      publicUrl,
      "english_menu",
      "communication.english_menu",
      { ja: "英語メニューを確認しました。", en: "An English menu was confirmed." },
      { ja: "英語メニューはありません。", en: "An English menu is not available." },
      { ja: "英語メニューは要確認です。", en: "English-menu availability needs confirmation." },
      true
    ),
    {
      key: "step_free",
      status:
        stepEvidence?.kind === "staff_input" && step?.value === false
          ? "confirmed"
          : stepEvidence?.kind === "staff_input" && step?.value === true
            ? "not_available"
            : "unconfirmed",
      detail:
        stepEvidence?.kind === "staff_input" && step?.value === false
          ? { ja: "店舗スタッフが入口に段差なしと確認しました。", en: "Venue staff confirmed no entrance step." }
          : stepEvidence?.kind === "staff_input" && step?.value === true
            ? { ja: "店舗スタッフが入口の段差ありと確認しました。", en: "Venue staff confirmed an entrance step." }
            : { ja: "入口の段差有無は要確認です。", en: "Entrance step status needs confirmation." },
      evidence: evidenceFor(
        card,
        publicUrl,
        stepEvidence?.kind === "staff_input" ? step : undefined
      )
    },
    {
      key: "wide_entrance",
      status: "unconfirmed",
      detail: hasMeasuredWidth
        ? {
            ja: `入口幅は${measuredWidth!.value}cmです。「広い」という適合判定は行いません。`,
            en: `The measured entrance width is ${measuredWidth!.value} cm; this is not a suitability certification.`
          }
        : estimatedWidth
          ? {
              ja: `入口幅は動画から約${estimatedWidth.minCm}〜${estimatedWidth.maxCm}cmと推定しています。実測ではありません。`,
              en: `The entrance width is estimated from video at approx. ${estimatedWidth.minCm}-${estimatedWidth.maxCm} cm; it is not measured.`
            }
          : { ja: "入口幅は要確認です。", en: "Entrance width needs confirmation." },
      evidence: evidenceFor(
        card,
        publicUrl,
        hasMeasuredWidth || estimatedWidth ? measuredWidth : undefined
      )
    },
    booleanFeature(
      card,
      publicUrl,
      "movable_seating",
      "path_to_seat.chairs_movable",
      { ja: "可動椅子を確認しました。", en: "Movable seating was confirmed." },
      { ja: "椅子は移動できません。", en: "The chairs cannot be moved." },
      { ja: "可動席は要確認です。", en: "Movable seating needs confirmation." },
      true
    )
  ];

  return {
    id: card.brief.cardId,
    name: { ja: card.brief.name, en: card.brief.name },
    category: categoryLabels[card.brief.category],
    address: card.brief.address!,
    location: card.brief.location!,
    googleMapsUrl: card.brief.googleMapsUrl!,
    accessCards: {
      ja: {
        summary:
          `店舗動画とスタッフ確認に基づく具体情報です。${doorSummaryJa ? ` ${doorSummaryJa}` : ""} ${widthSummaryJa} 認定や個人ごとの利用可否判定ではありません。`
      },
      en: {
        summary:
          `Concrete facts from venue video and staff review.${doorSummaryEn ? ` ${doorSummaryEn}` : ""} ${widthSummaryEn} This is not a certification or individual suitability decision.`
      }
    },
    features,
    lastReviewedAt: card.updatedAt
  };
}

export async function syncPublishedCard(
  card: AccessCard
): Promise<ListingSyncStatus> {
  let publicUrl: string;
  try {
    publicUrl = new URL(
      `/c/${encodeURIComponent(card.brief.cardId)}`,
      process.env.NEXT_PUBLIC_APP_URL ||
        "https://open-door-tokyo.vercel.app"
    ).toString();
  } catch {
    return "not_configured";
  }

  const listingCard = toListingAccessCard(card, publicUrl);
  if (!listingCard) return "missing_location";

  const endpoint = process.env.LISTING_WEBHOOK_URL;
  const secret = process.env.LISTING_WEBHOOK_SECRET;
  if (!endpoint || !secret) return "not_configured";
  try {
    new URL(endpoint);
  } catch {
    return "not_configured";
  }

  const payload = {
    event: "access_card.published",
    schemaVersion: 1,
    cardId: card.brief.cardId,
    publicUrl,
    card: listingCard
  };
  if (!listingPublishPayloadSchema.safeParse(payload).success) {
    return "schema_invalid";
  }
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `open-door:${card.brief.cardId}`,
        "x-open-door-event": "access_card.published",
        "x-open-door-signature": `sha256=${signature}`
      },
      body,
      signal: AbortSignal.timeout(5_000),
      cache: "no-store"
    });
    return response.ok ? "delivered" : "rejected";
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError"
      ? "timeout"
      : "transport_failed";
  }
}
