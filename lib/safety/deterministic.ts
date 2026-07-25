import type { AccessCard, BlockedClaim, LocalizedText } from "../types";

type SafetyRule = {
  id: string;
  pattern: RegExp;
  reason: LocalizedText;
};

const universalClaimReason: LocalizedText = {
  ja: "個人の状況や未確認項目にかかわらず利用できると断定しています。",
  en: "This makes a universal usability claim despite individual needs and unverified facts."
};

const complianceClaimReason: LocalizedText = {
  ja: "自動解析だけで認定・基準適合・法令適合を断定することはできません。",
  en: "Automated analysis alone cannot establish certification, standards conformance, or legal compliance."
};

export const safetyRules: SafetyRule[] = [
  {
    id: "fully_barrier_free_ja",
    pattern: /完全(に|な)?バリアフリー/u,
    reason: universalClaimReason
  },
  {
    id: "barrier_free_venue_ja",
    pattern: /バリアフリー(な|の)?(店舗|施設)?です/u,
    reason: universalClaimReason
  },
  {
    id: "wheelchair_usable_ja",
    pattern: /車椅子(で)?(問題なく)?利用(可能|できます|できる)/u,
    reason: universalClaimReason
  },
  {
    id: "wheelchair_ready_ja",
    pattern: /車椅子対応です/u,
    reason: universalClaimReason
  },
  {
    id: "everyone_usable_ja",
    pattern: /誰でも(安心して)?利用(可能|できます|できる)/u,
    reason: universalClaimReason
  },
  {
    id: "problem_free_ja",
    pattern: /問題なく(利用|来店)(可能|できます|できる)/u,
    reason: universalClaimReason
  },
  {
    id: "safe_visit_ja",
    pattern: /(安心|安全)(して)?(利用|来店)(できます|できる)/u,
    reason: universalClaimReason
  },
  {
    id: "accessibility_standard_ja",
    pattern: /アクセシビリティ基準を満た/u,
    reason: complianceClaimReason
  },
  {
    id: "standard_compliant_ja",
    pattern: /(基準|規格|法令)に(完全に)?(適合|準拠)/u,
    reason: complianceClaimReason
  },
  {
    id: "wcag_compliant_ja",
    pattern: /WCAG.{0,12}(準拠|適合)/iu,
    reason: complianceClaimReason
  },
  {
    id: "certified_ja",
    pattern: /(アクセシビリティ|バリアフリー)(認定|認証)(済み|です)/u,
    reason: complianceClaimReason
  },
  {
    id: "fully_accessible_en",
    pattern: /\bfully accessible\b/i,
    reason: universalClaimReason
  },
  {
    id: "wheelchair_accessible_en",
    pattern: /\bwheelchair[- ]accessible\b/i,
    reason: universalClaimReason
  },
  {
    id: "barrier_free_en",
    pattern: /\bbarrier[- ]free\b/i,
    reason: universalClaimReason
  },
  {
    id: "safe_for_everyone_en",
    pattern: /\bsafe for (everyone|all visitors)\b/i,
    reason: universalClaimReason
  },
  {
    id: "suitable_for_all_en",
    pattern: /\bsuitable for (everyone|all visitors|all wheelchair users)\b/i,
    reason: universalClaimReason
  },
  {
    id: "no_problem_en",
    pattern: /\b(no problems?|without difficulty) for wheelchair users\b/i,
    reason: universalClaimReason
  },
  {
    id: "meets_accessibility_standards_en",
    pattern: /\bmeets? accessibility standards?\b/i,
    reason: complianceClaimReason
  },
  {
    id: "wcag_compliant_en",
    pattern: /\bWCAG[- ]compliant\b/i,
    reason: complianceClaimReason
  },
  {
    id: "certified_accessible_en",
    pattern: /\bcertified (as )?accessible\b/i,
    reason: complianceClaimReason
  }
];

const defaultSuggestion: LocalizedText = {
  ja: "確認済みの具体的事実、または実測ではないと明示した幅付き参考推定だけを記載してください。",
  en: "State only verified concrete facts or range-based reference estimates explicitly labeled as not measured."
};

export function auditClaim(text: string): BlockedClaim | null {
  const rule = safetyRules.find((candidate) => candidate.pattern.test(text));
  if (!rule) {
    return null;
  }

  return {
    text,
    rule: rule.id,
    reason: rule.reason,
    suggestion: defaultSuggestion,
    resolved: false
  };
}

export function auditClaims(claims: string[]): BlockedClaim[] {
  return claims
    .map(auditClaim)
    .filter((claim): claim is BlockedClaim => claim !== null);
}

export function hasUnresolvedSafetyBlocks(card: AccessCard): boolean {
  return card.safetyAudit.blocked.some((claim) => !claim.resolved);
}

export function canPublish(card: AccessCard): {
  ok: boolean;
  reason?: string;
} {
  if (hasUnresolvedSafetyBlocks(card)) {
    return {
      ok: false,
      reason: "Unresolved safety claims remain."
    };
  }

  const missingRequiredFact = card.items.some(
    (item) =>
      item.requiredForPublish &&
      !["staff_stated", "staff_measured", "confirmed"].includes(item.status)
  );

  if (missingRequiredFact) {
    return {
      ok: false,
      reason: "A required fact has not been confirmed by staff."
    };
  }

  if (!["staff_confirmed", "card_built", "sandbox_checked", "published"].includes(card.state)) {
    return {
      ok: false,
      reason: "Staff confirmation is required before publication."
    };
  }

  return { ok: true };
}
