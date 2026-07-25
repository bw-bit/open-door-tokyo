import Link from "next/link";
import type { AccessCard, EvidenceSection } from "@/lib/types";

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
  const known = card.items.filter((item) => item.status !== "unknown");
  const unknown = card.items.filter((item) => item.status === "unknown");
  const heroFrame = card.frames[0];

  return (
    <main className={`public-card ${embed ? "is-embedded" : ""}`}>
      {!embed && <header className="public-header">
        <Link href="/capture" className="public-brand">
          <span className="brand-mark">O</span>
          <strong>OPEN DOOR TOKYO</strong>
        </Link>
        <nav className="language-toggle" aria-label="Language">
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
            {lang === "ja" ? "店舗確認" : "Venue verified"} · {card.lastVerifiedAt ?? "2026-07-25"}
          </span>
          <h1>{card.brief.name}</h1>
          <p>
            {lang === "ja"
              ? "入口から席までの、来店前に確認できる具体的な情報です。"
              : "Concrete information you can review before visiting, from the entrance to your seat."}
          </p>
          <div className="fact-summary">
            <span>
              <strong>{known.length}</strong>
              {lang === "ja" ? "確認済みの事実" : "verified facts"}
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

      <aside className="scope-notice">
        <strong>{lang === "ja" ? "このカードについて" : "About this card"}</strong>
        <p>
          {lang === "ja"
            ? "これは認定や適合判定ではありません。店舗の映像とスタッフ確認に基づく、具体的な来店前情報です。必要な配慮は店舗へ直接ご相談ください。"
            : "This is not a certification or conformance assessment. It records concrete facts from venue video and staff confirmation. Contact the venue about your individual needs."}
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
                <small>{meta[lang === "ja" ? "en" : "ja"]}</small>
              </div>
              <div className="fact-list">
                {items.map((item) => {
                  const frameId = item.provenance.find((source) => source.frameId)?.frameId;
                  const frame = card.frames.find((candidate) => candidate.frameId === frameId);
                  return (
                    <article className="public-fact" key={item.id}>
                      <div className="fact-check" aria-hidden="true">✓</div>
                      <div>
                        <h3>{item.label[lang]}</h3>
                        <p>{item.description[lang]}</p>
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
                ? "推測で埋めず、未確認として公開しています。"
                : "These are shown as unknown rather than filled with assumptions."}
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
          <span>We do not certify. We clarify.</span>
        </div>
        <p>
          {lang === "ja"
            ? `最終確認 ${card.lastVerifiedAt ?? "2026-07-25"} · 情報は来店前に店舗へ再確認してください。`
            : `Last verified ${card.lastVerifiedAt ?? "2026-07-25"} · Reconfirm details with the venue before visiting.`}
        </p>
      </footer>}
    </main>
  );
}
