import { providerModeLabels } from "@/lib/status";
import type { ProviderId, ProviderTrace } from "@/lib/types";

const providerNames: Record<ProviderId, string> = {
  qwen: "Qwen Cloud",
  gmi: "GMI Cloud",
  aiand: "ai&",
  nosana: "Nosana",
  daytona: "Daytona"
};

const defaultTasks: Record<ProviderId, string> = {
  qwen: "映像理解・要件抽出",
  gmi: "断定表現の安全監査",
  aiand: "日英表現の確認",
  nosana: "GPU証拠フレーム索引",
  daytona: "公開カードの隔離検査"
};

const validationLabels = {
  schema_and_semantic_passed: "形式・内容とも合格",
  verified_sample: "サンプル検証済み",
  not_run: "未実行",
  failed: "検証不合格"
} as const;

export function ProviderTraceRail({
  traces = [],
  activeProvider
}: {
  traces?: ProviderTrace[];
  activeProvider?: ProviderId;
}) {
  const ids: ProviderId[] = ["qwen", "nosana", "gmi", "aiand", "daytona"];

  return (
    <aside className="trace-rail" aria-label="AIスタック実行状況">
      <div className="rail-heading">
        <span>AI実行履歴</span>
        <small>コードレベル統合</small>
      </div>
      <div className="trace-list">
        {ids.map((id) => {
          const trace = traces.find((candidate) => candidate.provider === id);
          const active = activeProvider === id;
          const mode = trace?.mode ?? "not_configured";
          return (
            <div className={`trace-item ${active ? "active" : ""}`} key={id}>
              <span className="trace-signal" aria-hidden="true" />
              <div className="trace-copy">
                <strong>{providerNames[id]}</strong>
                <span>{trace?.task.ja ?? defaultTasks[id]}</span>
                {trace && (
                  <dl className="trace-meta">
                    <div>
                      <dt>処理時間</dt>
                      <dd>{trace.latencyMs}ms</dd>
                    </div>
                    <div>
                      <dt>参照ID</dt>
                      <dd>{trace.requestId ?? trace.reservationId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>検証</dt>
                      <dd>
                        {validationLabels[
                          trace.validation ??
                            (trace.mode === "verified_sample"
                              ? "verified_sample"
                              : trace.mode === "live"
                                ? "schema_and_semantic_passed"
                                : "not_run")
                        ]}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
              <span className={`mode mode-${mode}`}>
                {active ? "実行中" : providerModeLabels[mode]}
              </span>
            </div>
          );
        })}
      </div>
      <p className="trace-note">
        APIキー未設定時は状態を明示。サンプルは検証済みデモ、実動画は未確認として安全側へ倒します。
      </p>
    </aside>
  );
}
