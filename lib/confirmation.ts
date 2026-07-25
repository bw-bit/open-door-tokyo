import type {
  AccessCard,
  StaffConfirmation
} from "./types";

export interface StaffCorrection {
  field: string;
  descriptionJa: string;
  descriptionEn: string;
  markUnknown: boolean;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function descriptionFor(
  field: string,
  value: string | number | boolean
): { ja: string; en: string } | null {
  const descriptions: Record<string, { ja: string; en: string }> = {
    "entrance.step_presence": {
      ja: value ? "入口に1段の段差があります" : "入口に段差はありません",
      en: value
        ? "There is one step at the entrance"
        : "There is no step at the entrance"
    },
    "entrance.step_height_cm": {
      ja: `段差の高さは約${value}cmです`,
      en: `The step is approximately ${value}cm high`
    },
    "entrance.door_width_cm": {
      ja: `入口の最も狭い部分は${value}cmです`,
      en: `The narrowest clear doorway width is ${value}cm`
    },
    "path_to_seat.chairs_movable": {
      ja: value ? "椅子は移動できます" : "椅子は移動できません",
      en: value ? "The chairs can be moved" : "The chairs cannot be moved"
    },
    "path_to_seat.narrowest_passage_cm": {
      ja: `一部に幅約${value}cmの通路があります`,
      en: `One part of the route is approximately ${value}cm wide`
    },
    "communication.writing_support": {
      ja: value ? "筆談に対応しています" : "筆談対応はありません",
      en: value
        ? "Staff can communicate in writing"
        : "Written communication is not available"
    },
    "communication.english_menu": {
      ja: value ? "英語メニューがあります" : "英語メニューはありません",
      en: value
        ? "An English menu is available"
        : "An English menu is not available"
    }
  };
  return descriptions[field] ?? null;
}

export function applyStaffConfirmations(
  source: AccessCard,
  confirmations: StaffConfirmation[],
  reviewerName: string,
  corrections: StaffCorrection[] = []
): AccessCard {
  const card = clone(source);
  const capturedAt = new Date().toISOString();
  const verifiedDate = capturedAt.slice(0, 10);

  for (const confirmation of confirmations) {
    const item = card.items.find(
      (candidate) => candidate.field === confirmation.field
    );
    if (!item) continue;
    item.value = confirmation.value;
    item.status = confirmation.method;
    item.confirmedByStaff = true;
    item.confidence = 1;
    item.lastVerifiedAt = verifiedDate;
    const description = descriptionFor(
      confirmation.field,
      confirmation.value
    );
    if (description) item.description = description;
    item.provenance.push({
      kind: "staff_input",
      staffLabel: {
        ja: `${reviewerName}が確認`,
        en: `Confirmed by ${reviewerName}`
      },
      capturedAt
    });
  }

  for (const correction of corrections) {
    const item = card.items.find(
      (candidate) => candidate.field === correction.field
    );
    if (!item) continue;
    item.description = {
      ja: correction.descriptionJa,
      en: correction.descriptionEn
    };
    item.value = correction.markUnknown ? null : item.value;
    item.status = correction.markUnknown ? "unknown" : "staff_stated";
    item.confirmedByStaff = !correction.markUnknown;
    item.confidence = correction.markUnknown ? 0 : 1;
    item.lastVerifiedAt = verifiedDate;
    item.provenance.push({
      kind: "staff_input",
      staffLabel: {
        ja: `${reviewerName}がAI解析を修正`,
        en: `AI analysis corrected by ${reviewerName}`
      },
      capturedAt
    });
  }

  card.unknowns = card.items
    .filter((item) => item.status === "unknown")
    .map((item) => item.field);
  const requiredFields = card.items
    .filter((item) => item.requiredForPublish)
    .map((item) => item.field);
  const allRequiredConfirmed = requiredFields.every((field) =>
    confirmations.some((confirmation) => confirmation.field === field)
  );
  if (allRequiredConfirmed) {
    card.safetyAudit.blocked = card.safetyAudit.blocked.map((claim) => ({
      ...claim,
      resolved: true
    }));
  }
  card.state = "card_built";
  card.publishedAt = null;
  card.lastVerifiedAt = verifiedDate;
  card.updatedAt = capturedAt;
  return card;
}
