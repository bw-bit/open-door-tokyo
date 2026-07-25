"use client";

import { useEffect, useState } from "react";
import { providerModeLabels } from "@/lib/status";
import type { AccessCard } from "@/lib/types";
import { EvidenceRow } from "./evidence-row";
import { ProviderTraceRail } from "./provider-trace";

type ConfirmationForm = {
  stepPresence: string;
  stepHeight: string;
  doorWidth: string;
  chairsMovable: string;
  passageWidth: string;
  writingSupport: string;
  englishMenu: string;
};

type ManualCorrection = {
  descriptionJa: string;
  descriptionEn: string;
  markUnknown: boolean;
};

const blankConfirmations: ConfirmationForm = {
  stepPresence: "",
  stepHeight: "",
  doorWidth: "",
  chairsMovable: "",
  passageWidth: "",
  writingSupport: "",
  englishMenu: ""
};

const demoConfirmations: ConfirmationForm = {
  stepPresence: "true",
  stepHeight: "8",
  doorWidth: "82",
  chairsMovable: "true",
  passageWidth: "76",
  writingSupport: "true",
  englishMenu: "true"
};

function buildConfirmations(form: ConfirmationForm) {
  const rows: Array<{
    field: string;
    value: string | number | boolean;
    method: "staff_stated" | "staff_measured";
  }> = [];
  const booleanValue = (value: string) => value === "true";
  if (form.stepPresence) {
    rows.push({
      field: "entrance.step_presence",
      value: booleanValue(form.stepPresence),
      method: "staff_stated"
    });
  }
  for (const [field, value] of [
    ["entrance.step_height_cm", form.stepHeight],
    ["entrance.door_width_cm", form.doorWidth],
    ["path_to_seat.narrowest_passage_cm", form.passageWidth]
  ] as const) {
    if (value !== "" && Number.isFinite(Number(value))) {
      rows.push({ field, value: Number(value), method: "staff_measured" });
    }
  }
  for (const [field, value] of [
    ["path_to_seat.chairs_movable", form.chairsMovable],
    ["communication.writing_support", form.writingSupport],
    ["communication.english_menu", form.englishMenu]
  ] as const) {
    if (value) {
      rows.push({
        field,
        value: booleanValue(value),
        method: "staff_stated"
      });
    }
  }
  return rows;
}

export function ReviewClient({ initialCard }: { initialCard: AccessCard }) {
  const isDemo = initialCard.brief.cardId === "demo-cafe";
  const [card, setCard] = useState(initialCard);
  const [busy, setBusy] = useState<"confirm" | "publish" | null>(null);
  const [selectedSection, setSelectedSection] = useState("entrance");
  const [publishedPath, setPublishedPath] = useState("");
  const [approvalToken, setApprovalToken] = useState("");
  const [reviewerName, setReviewerName] = useState("デモ店舗スタッフ");
  const [attested, setAttested] = useState(false);
  const [confirmationForm, setConfirmationForm] = useState<ConfirmationForm>(
    isDemo ? demoConfirmations : blankConfirmations
  );
  const [corrections, setCorrections] = useState<
    Record<string, ManualCorrection>
  >({});
  const [origin, setOrigin] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [listingSync, setListingSync] = useState<
    "not_configured" | "delivered" | "rejected" | "timeout" | "transport_failed"
  >("not_configured");
  const [error, setError] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function correctEvidence(field: string, correction: ManualCorrection) {
    setCorrections((current) => ({ ...current, [field]: correction }));
    setCard((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.field === field
          ? {
              ...item,
              description: {
                ja: correction.descriptionJa,
                en: correction.descriptionEn
              },
              status: correction.markUnknown ? "unknown" : "staff_stated",
              confidence: correction.markUnknown ? 0 : 1,
              confirmedByStaff: !correction.markUnknown
            }
          : item
      )
    }));
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label}をコピーしました`);
    } catch {
      setCopyStatus("コピーできませんでした。表示欄から選択してください。");
    }
  }

  const sections = [
    ["entrance", "入口", "ENTRANCE"],
    ["path_to_seat", "席までの経路", "ROUTE"],
    ["communication", "コミュニケーション", "COMMUNICATION"],
    ["restroom", "トイレ", "RESTROOM"]
  ];
  const sectionItems = card.items.filter(
    (item) => item.section === selectedSection
  );
  const unknownCount = card.items.filter((item) => item.status === "unknown").length;

  async function confirm() {
    setBusy("confirm");
    setError("");
    const confirmations = buildConfirmations(confirmationForm);
    try {
      const response = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.brief.cardId,
          reviewerName,
          attestation: attested,
          confirmations,
          corrections: Object.entries(corrections).map(
            ([field, correction]) => ({ field, ...correction })
          )
        })
      });
      if (!response.ok) throw new Error("スタッフ確認を保存できませんでした");
      const result = (await response.json()) as {
        card: AccessCard;
        approvalToken: string;
      };
      setCard(result.card);
      setApprovalToken(result.approvalToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setError("");
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.brief.cardId,
          approvalToken
        })
      });
      if (!response.ok) {
        const detail = (await response.json()) as { reason?: string };
        throw new Error(detail.reason ?? "公開条件を満たしていません");
      }
      const result = (await response.json()) as {
        card: AccessCard;
        publicPath: string;
        listingSync: typeof listingSync;
      };
      setCard(result.card);
      setPublishedPath(result.publicPath);
      setListingSync(result.listingSync);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "公開に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  const ready = ["card_built", "sandbox_checked", "published"].includes(card.state);
  const blockedClaim = card.safetyAudit.blocked[0];
  const sandboxMode = card.sandbox?.mode ?? "not_configured";
  const publicUrl =
    publishedPath && origin ? `${origin}${publishedPath}` : "";
  const embedUrl = publicUrl ? `${publicUrl}?embed=1` : "";
  const embedCode = embedUrl
    ? `<iframe src="${embedUrl}" title="${card.brief.name} Access Card" loading="lazy" style="width:100%;min-height:720px;border:0"></iframe>`
    : "";
  const mapsCopy = publicUrl
    ? `来店前のアクセス情報（入口・段差・通路・コミュニケーション）: ${publicUrl}`
    : "";

  return (
    <>
      <div className="review-layout">
        <section className="review-main">
          <div className="review-title">
            <div>
              <span className="eyebrow">EVIDENCE REVIEW</span>
              <h1>AIの観察を、店舗の事実へ。</h1>
              <p>
                証拠を見ながら確認してください。測定できない項目は、
                未確認のまま公開できます。
              </p>
            </div>
            <div className="review-counts">
              <span><strong>{card.items.length}</strong>抽出項目</span>
              <span className="confirmed-count">
                <strong>{card.items.length - unknownCount}</strong>観察・回答
              </span>
              <span className="unknown-count"><strong>{unknownCount}</strong>未確認</span>
            </div>
          </div>

          <div className="section-tabs" role="tablist" aria-label="証拠の分類">
            {sections.map(([id, ja, en]) => (
              <button
                key={id}
                className={selectedSection === id ? "active" : ""}
                onClick={() => setSelectedSection(id)}
                type="button"
              >
                <strong>{ja}</strong>
                <small>{en}</small>
              </button>
            ))}
          </div>

          <div className="evidence-list">
            {sectionItems.map((item) => (
              <EvidenceRow
                item={item}
                frames={card.frames}
                key={item.id}
                editable={!ready}
                onCorrect={correctEvidence}
              />
            ))}
          </div>
        </section>

        <div className="review-side">
          <section className="safety-panel">
            <div className="panel-kicker">SAFETY AUDIT</div>
            <div className="blocked-headline">
              <span aria-hidden="true">×</span>
              <div>
                <small>BLOCKED CLAIM</small>
                <strong>「{blockedClaim?.text ?? "車椅子で利用可能"}」</strong>
              </div>
            </div>
            <p>{blockedClaim?.reason.ja}</p>
            <div className="rewrite-box">
              <small>根拠のある表現へ書換</small>
              <strong>{blockedClaim?.suggestion.ja}</strong>
            </div>
            <div className="audit-method">
              <span>決定論ルール</span>
              <strong>PASS</strong>
              <span>GMIセカンドチェック</span>
              <strong>{providerModeLabels[card.safetyAudit.auditedBy.gmi]}</strong>
            </div>
          </section>
          <section className="attestation-panel">
            <div className="panel-kicker">
              STAFF FACTS {isDemo && <span className="inline-demo">DEMO VALUES</span>}
            </div>
            <div className="confirmation-grid">
              <label>
                <span>入口の段差 *</span>
                <select
                  value={confirmationForm.stepPresence}
                  onChange={(event) =>
                    setConfirmationForm((value) => ({
                      ...value,
                      stepPresence: event.target.value
                    }))
                  }
                  disabled={ready}
                >
                  <option value="">未確認</option>
                  <option value="true">1段あり</option>
                  <option value="false">段差なし</option>
                </select>
              </label>
              <label>
                <span>段差高 cm</span>
                <input
                  type="number"
                  min="0"
                  value={confirmationForm.stepHeight}
                  onChange={(event) =>
                    setConfirmationForm((value) => ({
                      ...value,
                      stepHeight: event.target.value
                    }))
                  }
                  placeholder="未確認"
                  disabled={ready}
                />
              </label>
              <label>
                <span>入口幅 cm</span>
                <input
                  type="number"
                  min="0"
                  value={confirmationForm.doorWidth}
                  onChange={(event) =>
                    setConfirmationForm((value) => ({
                      ...value,
                      doorWidth: event.target.value
                    }))
                  }
                  placeholder="未確認"
                  disabled={ready}
                />
              </label>
              <label>
                <span>最狭通路 cm</span>
                <input
                  type="number"
                  min="0"
                  value={confirmationForm.passageWidth}
                  onChange={(event) =>
                    setConfirmationForm((value) => ({
                      ...value,
                      passageWidth: event.target.value
                    }))
                  }
                  placeholder="未確認"
                  disabled={ready}
                />
              </label>
              {[
                ["chairsMovable", "椅子を移動"],
                ["writingSupport", "筆談対応"],
                ["englishMenu", "英語メニュー"]
              ].map(([field, label]) => (
                <label key={field}>
                  <span>{label}</span>
                  <select
                    value={confirmationForm[field as keyof ConfirmationForm]}
                    onChange={(event) =>
                      setConfirmationForm((value) => ({
                        ...value,
                        [field]: event.target.value
                      }))
                    }
                    disabled={ready}
                  >
                    <option value="">未確認</option>
                    <option value="true">あり</option>
                    <option value="false">なし</option>
                  </select>
                </label>
              ))}
            </div>
            <p>空欄は推測せず「未確認」のまま残ります。</p>
          </section>
          <section className="attestation-panel">
            <div className="panel-kicker">HUMAN APPROVAL</div>
            <label>
              <span>確認者名</span>
              <input
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
                disabled={ready}
              />
            </label>
            <label className="attestation-check">
              <input
                type="checkbox"
                checked={attested}
                onChange={(event) => setAttested(event.target.checked)}
                disabled={ready}
              />
              <span>
                映像・実測値・未確認項目を確認し、包括的な利用可否を認定しないことに同意します。
              </span>
            </label>
            <p>確認後、10分間だけ有効な署名付き公開承認を発行します。</p>
          </section>
          <ProviderTraceRail traces={card.traces} />
        </div>
      </div>

      <div className="action-bar">
        <div>
          <span className={`completion-dot ${ready ? "ready" : ""}`} />
          <p>
            <strong>
              {ready
                ? sandboxMode === "live"
                  ? "Daytonaの隔離検査が完了しました"
                  : "公開ゲート確認済み・Daytonaは未実行"
                : isDemo
                  ? "7項目のデモ実測値を確認"
                  : "スタッフが入力した事実だけを確認"}
            </strong>
            <small>
              {ready
                ? sandboxMode === "live"
                  ? `${card.sandbox?.checksRun ?? 0} checks · 人が最終確認して公開`
                  : `${sandboxMode.toUpperCase()} · 人が最終確認して公開`
                : "当日は店舗担当者が同じ欄を確認します"}
            </small>
          </p>
        </div>
        {error && <span className="error-message">{error}</span>}
        {!ready ? (
          <button
            className="button primary"
            onClick={confirm}
            disabled={
              busy !== null ||
              !attested ||
              reviewerName.trim().length < 2 ||
              !confirmationForm.stepPresence
            }
          >
            {busy === "confirm" ? "確認・検査中…" : "店舗スタッフとして確認する"}
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button className="button primary" onClick={publish} disabled={busy !== null || Boolean(publishedPath) || !approvalToken}>
            {publishedPath ? "公開しました" : busy === "publish" ? "公開中…" : "確認して公開する"}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>

      {publishedPath && (
        <div className="publish-overlay" role="dialog" aria-modal="true" aria-labelledby="published-title">
          <div className="publish-dialog">
            <span className="success-label">PUBLISHED</span>
            <h2 id="published-title">来店前 Access Card を公開しました</h2>
            <p>スマートフォンでQRコードを読み、証拠付きの日英カードを確認できます。</p>
            <p className={`listing-sync listing-sync-${listingSync}`}>
              {listingSync === "delivered"
                ? "利用者向けマップにも自動掲載しました。"
                : "マップ自動掲載先は未接続です。下のURL・掲載文・埋め込みHTMLはすぐ使えます。"}
            </p>
            <img
              className="qr-image"
              src={`/api/qr?path=${encodeURIComponent(publishedPath)}`}
              alt="公開カードを開くQRコード"
            />
            <a className="button primary" href={publishedPath} target="_blank" rel="noreferrer">
              公開カードを見る <span aria-hidden="true">↗</span>
            </a>
            {publicUrl && (
              <div className="share-tools">
                <strong>Googleマップ・店舗サイトに掲載</strong>
                <label>
                  <span>公開URL</span>
                  <input value={publicUrl} readOnly aria-label="公開URL" />
                </label>
                <div className="share-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => copyText("公開URL", publicUrl)}
                  >
                    URLをコピー
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => copyText("Googleマップ掲載文", mapsCopy)}
                  >
                    Google掲載文
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => copyText("埋め込みコード", embedCode)}
                  >
                    埋め込みHTML
                  </button>
                </div>
                <textarea
                  value={embedCode}
                  readOnly
                  aria-label="店舗サイト用埋め込みHTML"
                />
                {copyStatus && <small role="status">{copyStatus}</small>}
              </div>
            )}
            <button className="text-button" onClick={() => setPublishedPath("")} type="button">
              レビュー画面へ戻る
            </button>
          </div>
        </div>
      )}
    </>
  );
}
