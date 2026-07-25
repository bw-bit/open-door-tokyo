import { fieldStatusLabels } from "@/lib/status";
import type { EvidenceFrame, EvidenceItem } from "@/lib/types";

export function EvidenceRow({
  item,
  frames
}: {
  item: EvidenceItem;
  frames: EvidenceFrame[];
}) {
  const frameId = item.provenance.find((source) => source.frameId)?.frameId;
  const frame = frames.find((candidate) => candidate.frameId === frameId);
  const isUnknown = item.status === "unknown";
  const sourceLabel = fieldStatusLabels[item.status].ja;
  const sourceCount = item.provenance.length;

  return (
    <article className={`evidence-row ${isUnknown ? "is-unknown" : ""}`}>
      <div className="evidence-source">
        {frame ? (
          <img src={frame.url} alt={frame.alt.ja} />
        ) : (
          <div className="no-frame">
            <span>STAFF</span>
            <small>回答が必要</small>
          </div>
        )}
        {frame && (
          <span className="timecode">
            00:{String(frame.tSec).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="evidence-body">
        <div className="evidence-label">
          <span className={`status status-${item.status}`}>
            {fieldStatusLabels[item.status].ja}
          </span>
          <small>{item.field}</small>
        </div>
        <h3>{item.label.ja}</h3>
        <p>{item.description.ja}</p>
        {item.staffPrompt && <strong className="staff-prompt">{item.staffPrompt.ja}</strong>}
      </div>
      <div className="evidence-source-label">
        <span>SOURCE</span>
        <strong>{sourceLabel}</strong>
        <small>{sourceCount > 0 ? `根拠 ${sourceCount}件` : "根拠未確認"}</small>
      </div>
    </article>
  );
}
