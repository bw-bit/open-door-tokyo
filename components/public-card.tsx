import Link from "next/link";
import { isReferenceEstimate } from "@/lib/reference-estimate";
import type { AccessCard, EvidenceSection } from "@/lib/types";
import { AccessOverview } from "./access-overview";
import { EvidenceGallery } from "./evidence-gallery";

type Lang = "ja" | "en";

const sectionLabels: Record<
  EvidenceSection,
  { ja: string; en: string; index: string }
> = {
  entrance: { ja: "入口", en: "Entrance", index: "01" },
  path_to_seat: { ja: "席までの経路", en: "Route to seating", index: "02" },
  communication: { ja: "コミュニケーション", en: "Communication", index: "03" },
  restroom: { ja: "トイレ", en: "Restroom", index: "04" }
};

function sourceLabel(
  kind: "video_frame" | "audio_transcript" | "staff_input" | "system",
  lang: Lang
) {
  const labels = {
    video_frame: { ja: "動画フレーム", en: "Video frame" },
    audio_transcript: { ja: "店舗音声", en: "Staff audio" },
    staff_input: { ja: "店舗スタッフ", en: "Venue staff" },
    system: { ja: "システム検査", en: "System check" }
  };
  return labels[kind][lang];
}

function formatTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function PublicCard({
  card,
  lang,
  embed = false
}: {
  card: AccessCard;
  lang: Lang;
  embed?: boolean;
}) {
  const sections: EvidenceSection[] = [
    "entrance",
    "path_to_seat",
    "communication",
    "restroom"
  ];
  const estimates = card.items.filter((item) => isReferenceEstimate(item));
  const observations = card.items.filter(
    (item) => item.status === "ai_observed" && !isReferenceEstimate(item)
  );
  const staffConfirmed = card.items.filter(
    (item) =>
      ["staff_stated", "staff_measured", "confirmed"].includes(item.status)
  );
  const unknown = card.items.filter((item) => item.status === "unknown");
  const heroFrame = card.frames[0];

  return (
    <main className={`public-card ${embed ? "is-embedded" : ""}`}>
      {!embed && <header className="public-header">
        <Link href="/capture" className="public-brand">
          <span className="brand-mark">O</span>
          <strong>OPEN DOOR TOKYO</strong>
        </Link>
        <nav className="language-toggle" aria-label="表示言語">
          <Link className={lang === "ja" ? "active" : ""} href={`/c/${card.brief.cardId}?lang=ja`}>
            日本語
          </Link>
          <Link className={lang === "en" ? "active" : ""} href={`/c/${card.brief.cardId}?lang=en`}>
            EN
          </Link>
        </nav>
      </header>}

      <section className="venue-hero">
        <div className="venue-copy">
          <span className="verified-date">
            {lang === "ja" ? "店舗確認済み" : "Venue verified"} · {card.lastVerifiedAt ?? "2026-07-25"}
          </span>
          <h1>
            {card.brief.name}
            <small>
              {lang === "ja" ? "来店前アクセス案内" : "Before-you-visit access guide"}
            </small>
          </h1>
          <p>
            {lang === "ja"
              ? "お店に電話しなくても、入口の段差・幅・筆談の様子を、行く前に自分の目で確かめられます。"
              : "Concrete facts and range-based reference estimates to help you decide before visiting, without a phone call."}
          </p>
          <div className="fact-summary">
            <span>
              <strong>{observations.length}</strong>
              {lang === "ja" ? "AI観察" : "AI observations"}
            </span>
            <span>
              <strong>{staffConfirmed.length}</strong>
              {lang === "ja" ? "スタッフ確認済み" : "staff confirmed"}
            </span>
            <span>
              <strong>{estimates.length}</strong>
              {lang === "ja" ? "AI参考推定" : "AI estimates"}
            </span>
            <span>
              <strong>{unknown.length}</strong>
              {lang === "ja" ? "未確認項目" : "unknowns"}
            </span>
          </div>
        </div>
        {heroFrame ? (
          <figure className="venue-image">
            <img src={heroFrame.url} alt={heroFrame.alt[lang]} />
            <figcaption>
              {lang === "ja" ? "店舗の記録画像" : "Venue evidence"} · {formatTime(heroFrame.tSec)}
            </figcaption>
          </figure>
        ) : (
          <div className="venue-image venue-image-missing">
            {lang === "ja" ? "入口画像は未確認です" : "Entrance image is not verified"}
          </div>
        )}
      </section>

      <AccessOverview card={card} lang={lang} />
      <EvidenceGallery frames={card.frames} lang={lang} />

      <aside className="scope-notice">
        <strong>{lang === "ja" ? "このカードについて" : "About this card"}</strong>
        <p>
          {lang === "ja"
            ? "これは認定や利用可否の判定ではありません。AI参考推定は映像から得た幅付きの目安で、実測値と明確に区別しています。具体的な事実と未確認事項を合わせて、ご自身の来店判断にお使いください。"
            : "This is not certification or a usability decision. AI reference estimates are video-based ranges, clearly separated from measured values. Use the concrete facts and unknowns to make your own visit decision."}
        </p>
      </aside>

      <div className="public-sections">
        {sections.map((section) => {
          const items = card.items.filter(
            (item) => item.section === section && item.status !== "unknown"
          );
          if (items.length === 0) return null;
          const meta = sectionLabels[section];
          return (
            <section className="fact-section" key={section}>
              <div className="fact-section-title">
                <span>{meta.index}</span>
                <h2>{meta[lang]}</h2>
                {lang === "en" && <small>{meta.ja}</small>}
              </div>
              <div className="fact-list">
                {items.map((item) => {
                  const isEstimate = isReferenceEstimate(item);
                  const frameId = item.provenance.find((source) => source.frameId)?.frameId;
                  const frame = card.frames.find((candidate) => candidate.frameId === frameId);
                  return (
                    <article
                      className={`public-fact ${isEstimate ? "is-estimate" : ""}`}
                      key={item.id}
                    >
                      <div className="fact-check" aria-hidden="true">
                        {isEstimate ? "≈" : "●"}
                      </div>
                      <div>
                        <span className="public-fact-origin">
                          {isEstimate
                            ? lang === "ja"
                              ? "AI参考推定"
                              : "AI reference estimate"
                            : item.status === "ai_observed"
                              ? lang === "ja"
                                ? "AI観察"
                                : "AI observed"
                              : lang === "ja"
                                ? "スタッフ確認済み"
                                : "Staff confirmed"}
                        </span>
                        <h3>{item.label[lang]}</h3>
                        <p>{item.description[lang]}</p>
                        {isEstimate && (
                          <p className="reference-estimate-disclaimer">
                            {lang === "ja"
                              ? "映像からの参考推定、実測ではありません。"
                              : "Video-based reference estimate; not a measured value."}
                          </p>
                        )}
                        <details>
                          <summary>
                            {lang === "ja" ? "根拠を見る" : "View evidence"}
                          </summary>
                          <div className="evidence-detail">
                            {frame && <img src={frame.url} alt={frame.alt[lang]} />}
                            <ul>
                              {item.provenance.map((source, index) => (
                                <li key={`${item.id}-${index}`}>
                                  <strong>{sourceLabel(source.kind, lang)}</strong>
                                  {source.tSec !== undefined && (
                                    <span>{formatTime(source.tSec)}</span>
                                  )}
                                  {source.staffLabel && <span>{source.staffLabel[lang]}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </details>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section className="unknown-section">
        <div className="unknown-heading">
          <span>?</span>
          <div>
            <h2>{lang === "ja" ? "まだ確認できていないこと" : "Not yet verified"}</h2>
            <p>
              {lang === "ja"
                ? "安全な幅付き推定もできない項目は、未確認として公開しています。"
                : "Items without enough evidence for a safe range estimate remain unknown."}
            </p>
          </div>
        </div>
        <ul>
          {unknown.map((item) => (
            <li key={item.id}>
              <strong>{item.label[lang]}</strong>
              <span>{item.description[lang]}</span>
            </li>
          ))}
        </ul>
      </section>

      {!embed && <footer className="public-footer">
        <div>
          <strong>OPEN DOOR TOKYO</strong>
          <span>{lang === "ja" ? "認定ではなく、判断材料を。" : "We do not certify. We clarify."}</span>
        </div>
        <p>
          {lang === "ja"
            ? `最終確認 ${card.lastVerifiedAt ?? "2026-07-25"} · 参考推定は実測値ではなく、利用可否を保証しません。`
            : `Last verified ${card.lastVerifiedAt ?? "2026-07-25"} · Reference estimates are not measurements and do not guarantee usability.`}
        </p>
      </footer>}
    </main>
  );
}
