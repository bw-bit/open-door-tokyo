"use client";

import { useState } from "react";
import { fieldStatusLabels } from "@/lib/status";
import type { EvidenceFrame, EvidenceItem } from "@/lib/types";

export function EvidenceRow({
  item,
  frames,
  editable = false,
  onCorrect
}: {
  item: EvidenceItem;
  frames: EvidenceFrame[];
  editable?: boolean;
  onCorrect?: (
    field: string,
    correction: {
      descriptionJa: string;
      descriptionEn: string;
      markUnknown: boolean;
    }
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
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
        {editable && (
          <div className="manual-correction">
            <button
              type="button"
              className="correction-toggle"
              onClick={() => setEditing((value) => !value)}
              aria-expanded={editing}
            >
              {editing ? "修正欄を閉じる" : "AI解析を手動で修正"}
            </button>
            {editing && (
              <div className="correction-fields">
                <label>
                  <span>日本語</span>
                  <textarea
                    aria-label={`${item.label.ja}の日本語説明`}
                    value={item.description.ja}
                    maxLength={240}
                    onChange={(event) =>
                      onCorrect?.(item.field, {
                        descriptionJa: event.target.value,
                        descriptionEn: item.description.en,
                        markUnknown: item.status === "unknown"
                      })
                    }
                  />
                </label>
                <label>
                  <span>English</span>
                  <textarea
                    aria-label={`${item.label.ja}の英語説明`}
                    value={item.description.en}
                    maxLength={240}
                    onChange={(event) =>
                      onCorrect?.(item.field, {
                        descriptionJa: item.description.ja,
                        descriptionEn: event.target.value,
                        markUnknown: item.status === "unknown"
                      })
                    }
                  />
                </label>
                <label className="unknown-correction">
                  <input
                    type="checkbox"
                    checked={item.status === "unknown"}
                    onChange={(event) =>
                      onCorrect?.(item.field, {
                        descriptionJa: item.description.ja,
                        descriptionEn: item.description.en,
                        markUnknown: event.target.checked
                      })
                    }
                  />
                  <span>映像では判断できないため「未確認」にする</span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="evidence-source-label">
        <span>SOURCE</span>
        <strong>{sourceLabel}</strong>
        <small>{sourceCount > 0 ? `根拠 ${sourceCount}件` : "根拠未確認"}</small>
      </div>
    </article>
  );
}
