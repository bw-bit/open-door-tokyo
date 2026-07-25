import { isReferenceEstimate } from "@/lib/reference-estimate";
import type { AccessCard, EvidenceItem } from "@/lib/types";

type Lang = "ja" | "en";
type OverviewState = "information" | "estimate" | "unknown";
type Pictogram =
  | "wheelchair"
  | "stroller"
  | "white-cane"
  | "writing"
  | "step"
  | "width";

type OverviewItem = {
  pictogram: Pictogram;
  label: { ja: string; en: string };
  fields: string[];
};

const overviewItems: OverviewItem[] = [
  {
    pictogram: "wheelchair",
    label: { ja: "車椅子", en: "Wheelchair" },
    fields: [
      "entrance.step_presence",
      "entrance.step_height_cm",
      "entrance.door_width_cm",
      "path_to_seat.narrowest_passage_cm"
    ]
  },
  {
    pictogram: "stroller",
    label: { ja: "ベビーカー", en: "Stroller" },
    fields: [
      "entrance.step_presence",
      "entrance.step_height_cm",
      "entrance.door_width_cm",
      "path_to_seat.narrowest_passage_cm"
    ]
  },
  {
    pictogram: "white-cane",
    label: { ja: "白杖・見えにくさ", en: "White cane / low vision" },
    fields: [
      "entrance.step_presence",
      "entrance.step_height_cm",
      "entrance.door_type",
      "path_to_seat.floor_surface"
    ]
  },
  {
    pictogram: "writing",
    label: { ja: "筆談", en: "Written communication" },
    fields: ["communication.writing_support"]
  },
  {
    pictogram: "step",
    label: { ja: "段差", en: "Entrance step" },
    fields: ["entrance.step_presence", "entrance.step_height_cm"]
  },
  {
    pictogram: "width",
    label: { ja: "入口の幅", en: "Entrance width" },
    fields: ["entrance.door_width_cm"]
  }
];

function stateFor(items: EvidenceItem[], fields: string[]): OverviewState {
  const relevant = items.filter((item) => fields.includes(item.field));
  if (
    relevant.some(
      (item) => item.status !== "unknown" && !isReferenceEstimate(item)
    )
  ) {
    return "information";
  }
  if (relevant.some((item) => isReferenceEstimate(item))) return "estimate";
  return "unknown";
}

const stateLabels: Record<OverviewState, { ja: string; en: string }> = {
  information: { ja: "情報あり", en: "Information available" },
  estimate: { ja: "参考推定あり", en: "Reference estimate" },
  unknown: { ja: "未確認", en: "Not yet verified" }
};

const stateMarks: Record<OverviewState, string> = {
  information: "●",
  estimate: "≈",
  unknown: "?"
};

export function AccessOverview({
  card,
  lang = "ja",
  compact = false
}: {
  card: AccessCard;
  lang?: Lang;
  compact?: boolean;
}) {
  return (
    <section
      className={`access-overview ${compact ? "is-compact" : ""}`}
      aria-labelledby={compact ? undefined : "access-overview-title"}
    >
      {!compact && (
        <div className="access-overview-heading">
          <div>
            <span className="eyebrow">
              {lang === "ja" ? "一目で分かる情報" : "At-a-glance information"}
            </span>
            <h2 id="access-overview-title">
              {lang === "ja"
                ? "行く前に知りたい6項目"
                : "Six things to know before visiting"}
            </h2>
          </div>
          <p>
            {lang === "ja"
              ? "「情報あり」は対応可否の認定ではなく、判断材料となる具体情報が掲載されている印です。"
              : "“Information available” means concrete decision-making details are shown; it is not a suitability certification."}
          </p>
        </div>
      )}
      <div className="access-overview-grid">
        {overviewItems.map((item) => {
          const state = stateFor(card.items, item.fields);
          return (
            <article className={`overview-item state-${state}`} key={item.pictogram}>
              <span
                className={`access-pictogram pictogram-${item.pictogram}`}
                aria-hidden="true"
              />
              <strong>{item.label[lang]}</strong>
              <span className="overview-state">
                <b aria-hidden="true">{stateMarks[state]}</b>
                {stateLabels[state][lang]}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
