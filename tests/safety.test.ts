import { describe, expect, it } from "vitest";
import { auditClaim, canPublish, safetyRules } from "@/lib/safety/deterministic";
import { getDemoAnalysisCard, getDemoPublishedCard } from "@/lib/fixtures";

const blockedClaims = [
  "この店舗は完全にバリアフリーです",
  "完全なバリアフリー施設です",
  "この施設はバリアフリーです",
  "車椅子で利用可能です",
  "車椅子でも問題なく利用できます",
  "車椅子対応です",
  "誰でも利用できます",
  "誰でも安心して利用できます",
  "問題なく来店できます",
  "安心して利用できます",
  "アクセシビリティ基準を満たしています",
  "この施設は基準に適合しています",
  "WCAG 2.2に準拠しています",
  "アクセシビリティ認定済みです",
  "This venue is fully accessible.",
  "The cafe is wheelchair accessible.",
  "This is a barrier-free venue.",
  "It is safe for everyone.",
  "This meets accessibility standards.",
  "The page is WCAG-compliant."
];

const safeClaims = [
  "入口には1段あります",
  "入口の最も狭い部分は82cmです",
  "簡易スロープがあります",
  "利用時はスタッフへお声掛けください",
  "車椅子対応トイレ：未確認",
  "これは認定や適合判定ではありません",
  "利用しやすさは状況により異なります",
  "There is one step at the entrance.",
  "The doorway is 82cm wide.",
  "Restroom equipment has not been verified."
];

describe("deterministic safety rules", () => {
  it("keeps the expected rule inventory", () => {
    expect(safetyRules).toHaveLength(20);
  });

  it.each(blockedClaims)("blocks unsupported universal claim: %s", (claim) => {
    expect(auditClaim(claim)).not.toBeNull();
  });

  it.each(safeClaims)("allows concrete or explicitly unknown fact: %s", (claim) => {
    expect(auditClaim(claim)).toBeNull();
  });
});

describe("publication gate", () => {
  it("blocks the analysis fixture before staff confirmation", () => {
    expect(canPublish(getDemoAnalysisCard()).ok).toBe(false);
  });

  it("allows the confirmed fixture with only resolved audit history", () => {
    expect(canPublish(getDemoPublishedCard())).toEqual({ ok: true });
  });

  it("blocks an unresolved safety claim", () => {
    const card = getDemoPublishedCard();
    card.safetyAudit.blocked[0].resolved = false;

    expect(canPublish(card).ok).toBe(false);
  });

  it("blocks a required fact that has not been confirmed", () => {
    const card = getDemoPublishedCard();
    const required = card.items.find((item) => item.requiredForPublish);
    expect(required).toBeDefined();
    if (required) {
      required.status = "ai_observed";
    }

    expect(canPublish(card).ok).toBe(false);
  });
});
