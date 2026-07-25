import type { EvidenceFrame } from "@/lib/types";

type Lang = "ja" | "en";

function formatTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function EvidenceGallery({
  frames,
  lang = "ja",
  compact = false
}: {
  frames: EvidenceFrame[];
  lang?: Lang;
  compact?: boolean;
}) {
  if (frames.length === 0) return null;
  return (
    <section className={`evidence-gallery ${compact ? "is-compact" : ""}`}>
      <div className="evidence-gallery-heading">
        <div>
          <span className="eyebrow">
            {lang === "ja" ? "動画から自動キャプチャ" : "Automatically captured"}
          </span>
          <h2>
            {lang === "ja"
              ? "AIが見た画像を、そのまま根拠として表示"
              : "The same frames seen by AI are shown as evidence"}
          </h2>
        </div>
        <p>
          {lang === "ja"
            ? `${frames.length}枚 · 時刻付き`
            : `${frames.length} timestamped frames`}
        </p>
      </div>
      <div className="evidence-gallery-grid">
        {frames.map((frame, index) => (
          <figure key={frame.frameId}>
            <img src={frame.url} alt={frame.alt[lang]} />
            <figcaption>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {formatTime(frame.tSec)}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
