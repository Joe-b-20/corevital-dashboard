import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { CoreVitalReport } from "../types/report";
import { isEnrichedBlamedLayers } from "../types/report";
import { METRIC_GUIDE } from "../content/metricsCopy";
import CopyButton from "./CopyButton";
import JsonTree from "./JsonTree";
import { getAttentionFromToken, getAttentionToToken, getBasinAnomalies, getTopConnections } from "../utils/attentionQueries";

function severityColor(s: number): string {
  if (s > 0.8) return "#ef4444";
  if (s > 0.5) return "#f97316";
  if (s > 0.3) return "#f97316";
  if (s > 0.2) return "#eab308";
  return "#22c55e";
}

const RISK_FACTOR_LABELS: Record<string, string> = {
  elevated_entropy: "Elevated entropy",
  entropy_rising: "Entropy rising",
  low_confidence_margin: "Low confidence margin",
  low_topk_mass: "Low top-K mass",
  elevated_surprisal: "Elevated surprisal",
  repetition_loop: "Repetition loop",
  mid_layer_anomaly: "Mid-layer anomaly",
  attention_collapse: "Attention collapse",
  nan_or_inf: "NaN/Inf detected",
  high_entropy_steps: "High entropy steps",
  "compound:context_loss": "Context loss (compound)",
  "compound:confident_confusion": "Confident confusion (compound)",
  "compound:degenerating_generation": "Degenerating generation (compound)",
  "compound:attention_bottleneck": "Attention bottleneck (compound)",
  "compound:confident_repetition_risk": "Confident repetition risk (compound)",
};

const EARLY_WARNING_LABELS: Record<string, string> = {
  entropy_accelerating: "Entropy accelerating",
  margin_collapsed: "Margin collapsed",
  margin_declining: "Margin declining",
  surprisal_volatile: "Surprisal volatile",
  entropy_margin_divergence: "Entropy-margin divergence",
  repetition_loop: "Repetition loop",
  mid_layer_anomaly: "Mid-layer anomaly",
  attention_collapse: "Attention collapse",
};

const CHART_THEME = { backgroundColor: "transparent", textStyle: { color: "#94a3b8" } };
const LINE_TOOLTIP = {
  trigger: "axis" as const,
  axisPointer: { type: "cross", label: { backgroundColor: "#334155" } },
  backgroundColor: "var(--bg-card)",
  borderColor: "var(--border)",
  textStyle: { color: "#e2e8f0" },
};

type NumericLogitsField = "entropy" | "perplexity" | "surprisal" | "top_k_margin" | "top1_top2_margin" | "voter_agreement" | "topk_mass";

function extractSeries(
  report: CoreVitalReport,
  field: NumericLogitsField
): { step: number; value: number; token: string }[] {
  const timeline = report.timeline ?? [];
  return timeline
    .map((s) => {
      const logits = s.logits_summary;
      let v: number | undefined;
      if (field === "top_k_margin") {
        v = logits?.top_k_margin ?? (logits as { top1_top2_margin?: number } | undefined)?.top1_top2_margin;
      } else if (field === "topk_mass") {
        v = logits?.topk_mass ?? logits?.voter_agreement;
      } else {
        v = logits?.[field];
      }
      const num = typeof v === "number" && !Number.isNaN(v) ? v : null;
      return {
        step: s.step_index,
        value: num ?? 0,
        token: s.token?.token_text ?? "?",
      };
    })
    .filter((d) => d.value !== 0 || d.step >= 0);
}

function buildLayerStepMatrix(
  report: CoreVitalReport,
  fieldPath: string
): { matrix: (number | null)[][]; numLayers: number; numSteps: number } {
  const timeline = report.timeline ?? [];
  if (!timeline.length) return { matrix: [], numLayers: 0, numSteps: 0 };
  const numSteps = timeline.length;
  const numLayers = timeline[0].layers?.length ?? 0;
  const parts = fieldPath.split(".");
  const matrix: (number | null)[][] = Array.from({ length: numLayers }, () => Array(numSteps).fill(null));
  for (let sIdx = 0; sIdx < timeline.length; sIdx++) {
    const step = timeline[sIdx];
    const layers = step.layers ?? [];
    for (let lIdx = 0; lIdx < layers.length; lIdx++) {
      let val: unknown = layers[lIdx];
      for (const p of parts) {
        val = val && typeof val === "object" && p in val ? (val as Record<string, unknown>)[p] : null;
        if (val === undefined) val = null;
      }
      if (typeof val === "number" && !Number.isNaN(val)) matrix[lIdx][sIdx] = val;
    }
  }
  return { matrix, numLayers, numSteps };
}

const LOGITS_TABS = ["entropy", "perplexity", "surprisal", "top_k_margin", "topk_mass"] as const;
type LogitsTab = (typeof LOGITS_TABS)[number];

export default function RunDetail({ report }: { report: CoreVitalReport }) {
  const model = report.model ?? {};
  const summary = report.summary ?? {};
  const health = report.health_flags ?? {};
  const risk = report.extensions?.risk;
  const ew = report.extensions?.early_warning;
  const rag = report.extensions?.rag;
  const narrative = report.extensions?.narrative;
  const perf = report.extensions?.performance;
  const promptAnalysis = report.prompt_analysis;

  const [logitsTab, setLogitsTab] = useState<LogitsTab>("entropy");
  const [attnMetric, setAttnMetric] = useState("attention_summary.entropy_mean");
  const [paTab, setPaTab] = useState<"Layer transformations" | "Prompt surprisals" | "Sparse Attention" | "Attention Explorer">("Layer transformations");
  const [paLayerIdx, setPaLayerIdx] = useState(0);
  const [paHeadIdx, setPaHeadIdx] = useState(0);
  const [paTokenIdx, setPaTokenIdx] = useState(0);

  const entropyData = useMemo(() => extractSeries(report, "entropy"), [report]);
  const perplexityData = useMemo(() => extractSeries(report, "perplexity"), [report]);
  const surprisalData = useMemo(() => extractSeries(report, "surprisal"), [report]);
  const topkData = useMemo(() => extractSeries(report, "top_k_margin"), [report]);
  const topkMassData = useMemo(() => extractSeries(report, "topk_mass"), [report]);

  const attnMatrix = useMemo(
    () => buildLayerStepMatrix(report, attnMetric),
    [report, attnMetric]
  );
  const l2Matrix = useMemo(
    () => buildLayerStepMatrix(report, "hidden_summary.l2_norm_mean"),
    [report]
  );

  const promptTokens = summary.prompt_tokens ?? report.prompt?.num_tokens ?? 0;
  const opsList = useMemo(() => {
    const raw = perf?.parent_operations;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((op) => ({ name: op.name ?? "?", ms: op.ms ?? 0, pct: op.pct }));
    return Object.entries(raw).map(([name, v]) => ({
      name,
      ms: typeof v === "object" && v?.ms != null ? v.ms : 0,
      pct: typeof v === "object" ? v.pct : undefined,
    }));
  }, [perf]);

  const totalMs = perf?.total_wall_time_ms ?? perf?.total_ms;
  const unaccounted = perf?.unaccounted_time;

  const promptHash = report.extensions?.fingerprint?.prompt_hash ?? "";
  const promptText = report.prompt?.text ?? "—";
  const outputText = report.generated?.output_text ?? "—";

  const logitsMetricCopy: Record<LogitsTab, { meaning: string; formula: string }> = {
    entropy: { meaning: METRIC_GUIDE.entropy.meaning, formula: METRIC_GUIDE.entropy.formula },
    perplexity: { meaning: METRIC_GUIDE.perplexity.meaning, formula: METRIC_GUIDE.perplexity.formula },
    surprisal: { meaning: METRIC_GUIDE.surprisal.meaning, formula: METRIC_GUIDE.surprisal.formula },
    top_k_margin: { meaning: METRIC_GUIDE.topKMargin.meaning, formula: METRIC_GUIDE.topKMargin.formula },
    topk_mass: { meaning: METRIC_GUIDE.topkMass.meaning, formula: METRIC_GUIDE.topkMass.formula },
  };
  const attnHeatmapCopy = METRIC_GUIDE.attentionHeatmapMetrics[attnMetric];

  return (
    <div className="run-detail">
      <h1 style={{ marginTop: 0 }}>CoreVital — {model.hf_id ?? "Unknown Model"}</h1>

      {narrative?.summary && (
        <section className="section">
          <div className="summary-accent">
            <strong>Summary:</strong> {narrative.summary}
          </div>
        </section>
      )}

      <details className="expander">
        <summary>📖 How to read these metrics</summary>
        <div className="metric-guide">
          <p>{METRIC_GUIDE.intro}</p>
          <p><strong>{METRIC_GUIDE.healthFlags.title}</strong></p>
          <ul>{METRIC_GUIDE.healthFlags.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
          <p><strong>Risk score (0–1)</strong> — {METRIC_GUIDE.riskScore}</p>
          <p><strong>Entropy</strong> — {METRIC_GUIDE.entropy.meaning} <em>Formula: {METRIC_GUIDE.entropy.formula}</em></p>
          <p><strong>Perplexity</strong> — {METRIC_GUIDE.perplexity.meaning} <em>Formula: {METRIC_GUIDE.perplexity.formula}</em></p>
          <p><strong>Surprisal</strong> — {METRIC_GUIDE.surprisal.meaning} <em>Formula: {METRIC_GUIDE.surprisal.formula}</em></p>
          <p><strong>Top-K margin</strong> — {METRIC_GUIDE.topKMargin.meaning} <em>Formula: {METRIC_GUIDE.topKMargin.formula}</em></p>
          <p><strong>Top-K mass</strong> — {METRIC_GUIDE.topkMass.meaning} <em>Formula: {METRIC_GUIDE.topkMass.formula}</em></p>
          <p><strong>Attention heatmaps</strong> — {METRIC_GUIDE.attentionHeatmaps}</p>
          <p><strong>Hidden state L2 norms</strong> — {METRIC_GUIDE.l2Norms}</p>
          <p><strong>Prompt analysis</strong> — Layer transformations: {METRIC_GUIDE.promptAnalysis.layerTransforms} Prompt surprisals: {METRIC_GUIDE.promptAnalysis.promptSurprisals} Basin score: {METRIC_GUIDE.promptAnalysis.basinScore} <em>Formula: {METRIC_GUIDE.promptAnalysis.basinFormula}</em></p>
          <p><strong>Compound signals</strong> — {METRIC_GUIDE.compoundSignals}</p>
          <p><strong>Calibration</strong> — {METRIC_GUIDE.calibration}</p>
          <p><strong>Early warning signals</strong> — {METRIC_GUIDE.earlyWarningSignals}</p>
          <p><strong>Performance</strong> — {METRIC_GUIDE.performance.what}</p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "1rem" }}>
            Definitions and formulas follow <a href="https://github.com/Joe-b-20/CoreVital" target="_blank" rel="noopener noreferrer">CoreVital</a> README Glossary and <code>docs/metrics-interpretation.md</code>.
          </p>
        </div>
      </details>

      <details className="expander run-details-expander">
        <summary>Run details</summary>
        <div className="run-details-table-wrap">
          <table className="run-details-table">
            <tbody>
              <tr><th scope="row">Trace ID</th><td><code>{report.trace_id ?? "—"}</code></td></tr>
              <tr><th scope="row">Schema</th><td>v{report.schema_version ?? "—"}</td></tr>
              <tr><th scope="row">Prompt hash</th><td>
                {promptHash ? <><code className="run-detail-hash">{promptHash}</code> <CopyButton text={promptHash} label="Copy" size="sm" /></> : "—"}
              </td></tr>
              <tr><th scope="row">Fingerprint</th><td>
                {report.extensions?.fingerprint?.version === 2
                  ? <span className="badge ok" style={{ fontSize: "0.85rem" }}>v2 (25-dim)</span>
                  : report.extensions?.fingerprint?.vector
                    ? <span className="badge" style={{ fontSize: "0.85rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>v1 (9-dim)</span>
                    : "—"}
              </td></tr>
              <tr><th scope="row">Model</th><td>{model.hf_id ?? "—"}</td></tr>
              <tr><th scope="row">Architecture</th><td>{model.architecture ?? "—"}</td></tr>
              <tr><th scope="row">Layers</th><td>{model.num_layers ?? "—"}</td></tr>
              <tr><th scope="row">Generated tokens</th><td>{summary.generated_tokens ?? "—"}</td></tr>
              <tr><th scope="row">Hidden size</th><td>{model.hidden_size ?? "—"}</td></tr>
              <tr><th scope="row">Attention heads</th><td>{model.num_attention_heads ?? "—"}</td></tr>
              <tr><th scope="row">Quantization</th><td>{model.quantization?.enabled ? (model.quantization?.method ?? "enabled") : "None"}</td></tr>
              <tr><th scope="row">Device / Dtype</th><td>{model.device ?? "—"} / {model.dtype ?? "—"}</td></tr>
              <tr><th scope="row">Temperature</th><td>{report.run_config?.generation?.temperature ?? "—"}</td></tr>
              <tr><th scope="row">Seed</th><td>{report.run_config?.seed ?? "—"}</td></tr>
              <tr><th scope="row">Top-K / Top-P</th><td>{report.run_config?.generation?.top_k ?? "—"} / {report.run_config?.generation?.top_p ?? "—"}</td></tr>
              <tr><th scope="row">Prompt tokens</th><td>{report.prompt?.num_tokens ?? "—"}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="run-detail-block-label">Prompt (full text)</p>
        <div className="prompt-output-block">{promptText}</div>
        <p className="run-detail-block-label">Output (full text)</p>
        <div className="prompt-output-block">{outputText}</div>
      </details>

      {rag && (
        <section className="section">
          <h3>RAG Context</h3>
          <details className="expander">
            <summary>What does this mean?</summary>
            <p>{METRIC_GUIDE.rag}</p>
          </details>
          <div className="metrics-row">
            {rag.context_token_count != null && <div className="metric"><div className="label">Context tokens</div><div className="value">{rag.context_token_count}</div></div>}
            {((rag.retrieved_doc_ids?.length ?? 0) || (rag.retrieved_doc_titles?.length ?? 0)) > 0 && (
              <div className="metric"><div className="label">Retrieved documents</div><div className="value">{(rag.retrieved_doc_titles ?? rag.retrieved_doc_ids ?? []).length}</div></div>
            )}
          </div>
          {(rag.retrieved_doc_titles?.length ?? 0) > 0 && <p><strong>Titles:</strong> {(rag.retrieved_doc_titles ?? []).slice(0, 10).join(", ")}{(rag.retrieved_doc_titles?.length ?? 0) > 10 ? "…" : ""}</p>}
          {rag.retrieval_metadata != null && (
            <details className="expander"><summary>Retrieval metadata</summary><pre className="mono" style={{ fontSize: "0.8rem", maxHeight: 200, overflow: "auto" }}>{JSON.stringify(rag.retrieval_metadata, null, 2)}</pre></details>
          )}
        </section>
      )}

      <section className="section">
        <h3>Health flags</h3>
          <details className="expander">
            <summary>What do these mean?</summary>
            <p>{METRIC_GUIDE.healthFlags.title} — {METRIC_GUIDE.healthFlags.items.join(" ")}</p>
          </details>
        <div className="health-badges">
          {[
            { label: "NaN detected", value: health.nan_detected, goodWhenFalse: true },
            { label: "Inf detected", value: health.inf_detected, goodWhenFalse: true },
            { label: "High entropy steps", value: health.high_entropy_steps ?? 0, goodWhenFalse: false },
            { label: "Repetition loop", value: health.repetition_loop_detected, goodWhenFalse: true },
            { label: "Mid-layer anomaly", value: health.mid_layer_anomaly_detected, goodWhenFalse: true },
          ].map(({ label, value, goodWhenFalse }) => {
            const isGood = typeof value === "boolean" ? (goodWhenFalse ? !value : value) : (value as number) === 0;
            const cls = isGood ? "ok" : (typeof value === "number" && value > 0 ? "warn" : "err");
            const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
            return <span key={label} className={`badge ${cls}`}>{isGood ? "✅" : "🔴"} <strong>{label}:</strong> {display}</span>;
          })}
          {(() => {
            const sev = health.attention_collapse_severity;
            const detected = health.attention_collapse_detected;
            const isGood = !detected && sev == null;
            let display: string;
            let cls: string;
            if (typeof sev === "number") {
              display = `Yes (severity: ${sev.toFixed(2)})`;
              cls = sev > 0.8 ? "err" : sev > 0.5 ? "err" : sev > 0.3 ? "warn" : sev > 0.2 ? "warn" : "ok";
            } else if (detected) {
              display = "Yes";
              cls = "err";
            } else {
              display = "No";
              cls = "ok";
            }
            return (
              <span className={`badge ${cls}`}>
                {isGood ? "✅" : "🔴"} <strong>Attention collapse:</strong> {display}
                {typeof sev === "number" && <span className="severity-bar" style={{ display: "inline-block", width: 60, height: 8, marginLeft: 8, background: "#1e293b", borderRadius: 4, verticalAlign: "middle" }}><span style={{ display: "block", width: `${Math.min(sev * 100, 100)}%`, height: "100%", borderRadius: 4, background: severityColor(sev) }} /></span>}
              </span>
            );
          })()}
        </div>
        {health.attention_collapse_detected && risk?.attention_collapse_detail && (() => {
          const acd = risk.attention_collapse_detail;
          return (
            <details className="expander" style={{ marginTop: "0.5rem" }}>
              <summary>Attention collapse detail</summary>
              <div style={{ fontSize: "0.9rem", padding: "0.5rem 0" }}>
                {acd.mean_collapse_rate != null && (
                  <p>Mean collapse rate: <strong>{(acd.mean_collapse_rate * 100).toFixed(1)}%</strong></p>
                )}
                {acd.trend_detected && (
                  <p><span className="badge warn" style={{ marginRight: 6 }}>Trend</span> Collapse rate increasing (peak deviation: {acd.trend_peak_deviation?.toFixed(3) ?? "—"}){acd.trend_layers?.length ? `, layers: ${acd.trend_layers.join(", ")}` : ""}</p>
                )}
                {acd.catastrophic && (
                  <p><span className="badge err" style={{ marginRight: 6 }}>Catastrophic</span> Mean collapse rate &gt; 70%</p>
                )}
                {acd.calibration_anomaly && (
                  <p><span className="badge warn" style={{ marginRight: 6 }}>Calibration</span> Anomalous vs baseline{acd.calibration_anomaly_layers?.length ? `, layers: ${acd.calibration_anomaly_layers.join(", ")}` : ""}</p>
                )}
              </div>
            </details>
          );
        })()}
      </section>

      {ew != null && (
        <section className="section">
          <h3>Early warning</h3>
          <details className="expander">
            <summary>What does this mean?</summary>
            <p>{METRIC_GUIDE.earlyWarning}</p>
          </details>
          {ew.failure_risk != null && <div className="metric" style={{ display: "inline-block" }}><div className="label">Failure risk</div><div className="value">{ew.failure_risk.toFixed(2)}</div></div>}
          {ew.warning_signals?.length ? (
            <div style={{ marginTop: "0.5rem" }}>
              <strong>Signals:</strong>{" "}
              <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
                {ew.warning_signals.map((s, i) => (
                  <span key={i} className="badge warn" style={{ fontSize: "0.85rem" }}>{EARLY_WARNING_LABELS[s] ?? s}</span>
                ))}
              </span>
            </div>
          ) : null}
        </section>
      )}

      {(report.extensions?.compound_signals?.length ?? 0) > 0 && (
        <section className="section">
          <h3>Compound Signals</h3>
          <details className="expander">
            <summary>What does this mean?</summary>
            <p>{METRIC_GUIDE.compoundSignals}</p>
          </details>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
            {[...(report.extensions!.compound_signals!)].sort((a, b) => b.severity - a.severity).map((sig, i) => (
              <div key={i} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="badge" style={{ background: severityColor(sig.severity), color: "#0f172a", fontWeight: 600, fontSize: "0.85rem" }}>{sig.name.replace(/_/g, " ")}</span>
                  <span className="severity-bar" style={{ display: "inline-block", width: 80, height: 8, background: "#1e293b", borderRadius: 4 }}>
                    <span style={{ display: "block", width: `${Math.min(sig.severity * 100, 100)}%`, height: "100%", borderRadius: 4, background: severityColor(sig.severity) }} />
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{sig.severity.toFixed(2)}</span>
                </div>
                <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>{sig.description}</p>
                {sig.evidence && (
                  <div style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
                    <em>Evidence:</em>{" "}
                    {Array.isArray(sig.evidence)
                      ? <ul style={{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>{sig.evidence.map((e, ei) => <li key={ei}>{e}</li>)}</ul>
                      : sig.evidence}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {risk != null && (
        <section className="section">
          <h3>Risk score</h3>
          <details className="expander">
            <summary>What does this mean?</summary>
            <p>{METRIC_GUIDE.riskWhat}</p>
          </details>
          {risk.risk_score != null && <div className="metric" style={{ display: "inline-block" }}><div className="label">Risk score</div><div className="value">{risk.risk_score.toFixed(2)}</div></div>}
          {risk.risk_factors?.length ? (
            <div style={{ marginTop: "0.5rem" }}>
              <strong>Factors:</strong>{" "}
              <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
                {risk.risk_factors.map((f, i) => (
                  <span key={i} className="badge warn" style={{ fontSize: "0.85rem" }}>{RISK_FACTOR_LABELS[f] ?? f}</span>
                ))}
              </span>
            </div>
          ) : null}
          {risk.blamed_layers?.length ? (
            <div style={{ marginTop: "0.5rem" }}>
              <strong>Blamed layers:</strong>
              {isEnrichedBlamedLayers(risk.blamed_layers) ? (
                <div className="blamed-layers-enriched" style={{ marginTop: "0.35rem" }}>
                  {[...risk.blamed_layers].sort((a, b) => b.severity - a.severity).map((bl, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: "0.9rem" }}>
                      <span style={{ fontWeight: 600, minWidth: 48 }}>L{bl.layer}</span>
                      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                        {bl.reasons.map((r, ri) => (
                          <span key={ri} className="badge" style={{ fontSize: "0.8rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>{r}</span>
                        ))}
                      </span>
                      <span className="severity-bar" style={{ display: "inline-block", width: 60, height: 8, background: "#1e293b", borderRadius: 4 }}>
                        <span style={{ display: "block", width: `${Math.min(bl.severity * 100, 100)}%`, height: "100%", borderRadius: 4, background: severityColor(bl.severity) }} />
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{bl.severity.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span> {(risk.blamed_layers_flat ?? (risk.blamed_layers as number[])).join(", ")}</span>
              )}
            </div>
          ) : null}
        </section>
      )}

      {report.extensions?.calibration && (
        <section className="section">
          <h3>Calibration</h3>
          <details className="expander">
            <summary>What does this mean?</summary>
            <p>{METRIC_GUIDE.calibration}</p>
          </details>
          <div className="metrics-row" style={{ marginTop: "0.5rem" }}>
            {report.extensions.calibration.divergence_score != null && (
              <div className="metric" style={{ display: "inline-block" }}>
                <div className="label">Divergence score</div>
                <div className="value">
                  <span className="badge" style={{ background: severityColor(report.extensions.calibration.divergence_score), color: "#0f172a", fontWeight: 600 }}>
                    {report.extensions.calibration.divergence_score.toFixed(3)}
                  </span>
                </div>
              </div>
            )}
          </div>
          {(report.extensions.calibration.anomalies?.length ?? 0) > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <strong>Anomalies:</strong>
              <ul style={{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>
                {report.extensions.calibration.anomalies!.map((a, i) => <li key={i} style={{ fontSize: "0.9rem" }}>{a}</li>)}
              </ul>
            </div>
          )}
          {(report.extensions.calibration.baseline_model_id || report.extensions.calibration.baseline_num_runs != null) && (
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.35rem" }}>
              Baseline: {report.extensions.calibration.baseline_model_id ?? "—"}{report.extensions.calibration.baseline_num_runs != null ? ` (${report.extensions.calibration.baseline_num_runs} runs)` : ""}
            </p>
          )}
        </section>
      )}

      {(report.extensions?.metric_consistency?.count ?? 0) > 0 && (
        <details className="expander" style={{ margin: "1rem 0" }}>
          <summary style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Metric consistency warnings ({report.extensions!.metric_consistency!.count})</summary>
          <ul style={{ fontSize: "0.85rem", padding: "0.5rem 1.25rem" }}>
            {(report.extensions!.metric_consistency!.warnings ?? []).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      <section className="section">
        <h3>Logits over time</h3>
        <p className="metric-one-liner">
          <strong>{logitsTab.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}:</strong> {logitsMetricCopy[logitsTab].meaning} <em>How we calculate: {logitsMetricCopy[logitsTab].formula}</em>
        </p>
        <div className="tabs">
          {LOGITS_TABS.map((tab) => {
            const tabLabels: Record<LogitsTab, string> = {
              entropy: "Entropy",
              perplexity: "Perplexity",
              surprisal: "Surprisal",
              top_k_margin: "Top K Margin",
              topk_mass: "Top K Mass",
            };
            return (
              <button key={tab} className={logitsTab === tab ? "active" : ""} onClick={() => setLogitsTab(tab)}>
                {tabLabels[tab]}
              </button>
            );
          })}
        </div>
        <div className="chart-container">
          {logitsTab === "entropy" && entropyData.length > 0 && (
            <ReactECharts
              option={{
                ...CHART_THEME,
                grid: { left: 48, right: 24, top: 24, bottom: 32 },
                xAxis: { type: "category", data: entropyData.map((d) => d.step), axisLine: { lineStyle: { color: "#475569" } } },
                yAxis: { type: "value", axisLine: { show: false }, splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                tooltip: {
                  ...LINE_TOOLTIP,
                  formatter: (params: unknown) => {
                    const p = (params as Array<{ axisValue: string; value?: number; dataIndex?: number }>)[0];
                    const idx = p?.dataIndex ?? 0;
                    const d = entropyData[idx];
                    return `Step: ${p?.axisValue ?? idx}<br/>Token: ${d?.token ?? "?"}<br/>Entropy: ${p?.value != null ? p.value.toFixed(3) : "—"}`;
                  },
                },
                series: [
                  { type: "line", name: "Entropy", data: entropyData.map((d) => d.value), smooth: true, symbol: "none", lineStyle: { color: "#818cf8" } },
                  { type: "line", name: "High (4.0)", data: entropyData.map(() => 4), symbol: "none", lineStyle: { color: "#ef4444", type: "dashed" } },
                ],
              }}
              style={{ height: "100%", width: "100%" }}
              notMerge
            />
          )}
          {logitsTab === "perplexity" && perplexityData.length > 0 && (
            <ReactECharts
              option={{
                ...CHART_THEME,
                grid: { left: 48, right: 24, top: 24, bottom: 32 },
                xAxis: { type: "category", data: perplexityData.map((d) => d.step), axisLine: { lineStyle: { color: "#475569" } } },
                yAxis: { type: "value", splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                tooltip: LINE_TOOLTIP,
                series: [{ type: "line", data: perplexityData.map((d) => d.value), smooth: true, symbol: "none", lineStyle: { color: "#818cf8" } }],
              }}
              style={{ height: "100%", width: "100%" }}
              notMerge
            />
          )}
          {logitsTab === "surprisal" && surprisalData.length > 0 && (
            <ReactECharts
              option={{
                ...CHART_THEME,
                grid: { left: 48, right: 24, top: 24, bottom: 32 },
                xAxis: { type: "category", data: surprisalData.map((d) => d.step), axisLine: { lineStyle: { color: "#475569" } } },
                yAxis: { type: "value", splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                tooltip: { ...LINE_TOOLTIP, trigger: "item" as const },
                series: [{ type: "bar", data: surprisalData.map((d) => d.value), itemStyle: { color: "#818cf8" } }],
              }}
              style={{ height: "100%", width: "100%" }}
              notMerge
            />
          )}
          {logitsTab === "top_k_margin" && topkData.length > 0 && (
            <ReactECharts
              option={{
                ...CHART_THEME,
                grid: { left: 48, right: 24, top: 24, bottom: 32 },
                xAxis: { type: "category", data: topkData.map((d) => d.step), axisLine: { lineStyle: { color: "#475569" } } },
                yAxis: { type: "value", splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                tooltip: LINE_TOOLTIP,
                series: [{ type: "line", data: topkData.map((d) => d.value), smooth: true, symbol: "none", lineStyle: { color: "#818cf8" } }],
              }}
              style={{ height: "100%", width: "100%" }}
              notMerge
            />
          )}
          {logitsTab === "topk_mass" && topkMassData.length > 0 && (
            <ReactECharts
              option={{
                ...CHART_THEME,
                grid: { left: 48, right: 24, top: 24, bottom: 32 },
                xAxis: { type: "category", data: topkMassData.map((d) => d.step), axisLine: { lineStyle: { color: "#475569" } } },
                yAxis: { type: "value", splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                tooltip: LINE_TOOLTIP,
                series: [{ type: "line", data: topkMassData.map((d) => d.value), smooth: true, symbol: "none", lineStyle: { color: "#818cf8" } }],
              }}
              style={{ height: "100%", width: "100%" }}
              notMerge
            />
          )}
          {((logitsTab === "entropy" && !entropyData.length) || (logitsTab === "perplexity" && !perplexityData.length) || (logitsTab === "surprisal" && !surprisalData.length) || (logitsTab === "top_k_margin" && !topkData.length) || (logitsTab === "topk_mass" && !topkMassData.length)) && (
            <p style={{ padding: "2rem" }}>No {logitsTab.replace(/_/g, " ")} data in this report.</p>
          )}
        </div>
        {entropyData.length > 0 && promptTokens > 0 && (
          <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Vertical line at step {promptTokens - 0.5} = prompt end (when available).</p>
        )}
      </section>

      {entropyData.length > 0 && (
        <section className="section">
          <h3>Colored output</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.5rem" }}>{METRIC_GUIDE.coloredOutput}</p>
          <div className="colored-output">
            {entropyData.map((d, i) => {
              const color = d.value > 4 ? "#ef4444" : d.value >= 2 ? "#eab308" : "#22c55e";
              const escaped = (d.token ?? "?").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;");
              return <span key={i} style={{ backgroundColor: color, color: "#0f172a", padding: "0 1px" }} dangerouslySetInnerHTML={{ __html: escaped }} />;
            })}
          </div>
        </section>
      )}

      <section className="section">
        <h3>Attention heatmaps</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
          Each cell is one (layer, generation step). We aggregate per-head attention stats for that layer/step.
        </p>
        <label style={{ fontSize: "0.9rem", marginRight: "0.5rem" }}>Metric</label>
        <select value={attnMetric} onChange={(e) => setAttnMetric(e.target.value)} style={{ marginBottom: "0.5rem" }}>
          {[
            { value: "attention_summary.entropy_mean", label: "entropy mean" },
            { value: "attention_summary.concentration_max", label: "concentration max" },
            { value: "attention_summary.collapsed_head_count", label: "collapsed head count" },
            { value: "attention_summary.focused_head_count", label: "focused head count" },
            { value: "attention_summary.entropy_mean_normalized", label: "entropy mean (normalized)" },
            { value: "attention_summary.collapsed_head_rate", label: "collapsed head rate" },
          ].map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {attnHeatmapCopy && (
          <p className="metric-one-liner" style={{ marginBottom: "0.75rem" }}>
            <strong>What we show:</strong> {attnHeatmapCopy.what} <strong>How we get it:</strong> {attnHeatmapCopy.how}
          </p>
        )}
        {attnMatrix.matrix.length > 0 && attnMatrix.numLayers > 0 && attnMatrix.numSteps > 0 ? (
          <ReactECharts
            option={{
              ...CHART_THEME,
              grid: { left: 48, right: 24, top: 24, bottom: 40 },
              xAxis: { type: "category", data: Array.from({ length: attnMatrix.numSteps }, (_, i) => `S${i}`), axisLabel: { fontSize: 10 } },
              yAxis: { type: "category", data: Array.from({ length: attnMatrix.numLayers }, (_, i) => `L${i}`), inverse: true, axisLabel: { fontSize: 10 } },
              visualMap: { min: 0, max: Math.max(...(attnMatrix.matrix.flat().filter((x): x is number => x != null) as number[]), 1e-9), type: "continuous", inRange: { color: ["#1e3a5f", "#22c55e", "#eab308"] } },
              tooltip: { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" },
              series: [{
                type: "heatmap",
                data: attnMatrix.matrix.flatMap((row, li) => row.map((v, si) => [si, li, v ?? "-"])),
                emphasis: { itemStyle: { borderColor: "#94a3b8", borderWidth: 1 } },
              }],
            }}
            style={{ height: Math.min(400, attnMatrix.numLayers * 20 + 80), width: "100%" }}
            notMerge
          />
        ) : (
          <p style={{ color: "var(--muted)" }}>No attention data available.</p>
        )}
      </section>

      {l2Matrix.matrix.length > 0 && l2Matrix.numLayers > 0 && l2Matrix.numSteps > 0 && (
        <section className="section">
          <h3>Hidden state L2 norms</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
            Not an attention metric — this is the magnitude of hidden-state vectors between layers (separate from attention weights above).
          </p>
          <p className="metric-one-liner" style={{ marginBottom: "0.75rem" }}>
            <strong>What we show:</strong> {METRIC_GUIDE.l2HeatmapWhat} <strong>How we get it:</strong> {METRIC_GUIDE.l2HeatmapHow}
          </p>
          <ReactECharts
            option={{
              ...CHART_THEME,
              grid: { left: 48, right: 24, top: 24, bottom: 40 },
              xAxis: { type: "category", data: Array.from({ length: l2Matrix.numSteps }, (_, i) => `S${i}`), axisLabel: { fontSize: 10 } },
              yAxis: { type: "category", data: Array.from({ length: l2Matrix.numLayers }, (_, i) => `L${i}`), inverse: true, axisLabel: { fontSize: 10 } },
              visualMap: { min: 0, max: Math.max(...(l2Matrix.matrix.flat().filter((x): x is number => x != null) as number[]), 1e-9), type: "continuous", inRange: { color: ["#0f172a", "#eab308", "#ef4444"] } },
              tooltip: {
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border)",
                formatter: (p: { data?: [number, number, number | string] }) => {
                  const d = p.data;
                  if (!d) return "";
                  const [sIdx, lIdx, val] = d;
                  const hs = report.timeline?.[sIdx]?.layers?.[lIdx]?.hidden_summary;
                  let tip = `Layer ${lIdx}, Step ${sIdx}<br/>L2 norm: ${typeof val === "number" ? val.toFixed(4) : val}`;
                  if (hs?.clipped) {
                    const frac = hs.clip_fraction;
                    const fracPct = frac != null ? (frac * 100).toFixed(2) : null;
                    const fracColor = frac != null ? (frac > 0.05 ? "#ef4444" : frac > 0.01 ? "#eab308" : "#94a3b8") : "#94a3b8";
                    tip += `<br/><span style="color:${fracColor}">Clipped: ${fracPct != null ? `${fracPct}%` : "yes"}</span>`;
                    if (hs.clip_max_before != null) tip += `<br/>Max before clip: ${hs.clip_max_before.toFixed(4)}`;
                  }
                  return tip;
                },
              },
              series: [{
                type: "heatmap",
                data: l2Matrix.matrix.flatMap((row, li) => row.map((v, si) => [si, li, v ?? "-"])),
                emphasis: { itemStyle: { borderColor: "#94a3b8", borderWidth: 1 } },
              }],
            }}
            style={{ height: Math.min(400, l2Matrix.numLayers * 20 + 80), width: "100%" }}
            notMerge
          />
        </section>
      )}

      {promptAnalysis && (() => {
        const paLayers = promptAnalysis.layers ?? [];
        const hasSparseHeads = paLayers.some((l) => (l?.heads?.length ?? 0) > 0);
        const paTabs = ["Layer transformations", "Prompt surprisals", "Sparse Attention", "Attention Explorer"] as const;
        const paTabCopy: Record<(typeof paTabs)[number], { what: string; how: string }> = {
          "Layer transformations": { what: METRIC_GUIDE.promptAnalysis.layerTransforms, how: METRIC_GUIDE.promptAnalysis.layerTransformsHow },
          "Prompt surprisals": { what: METRIC_GUIDE.promptAnalysis.promptSurprisals, how: METRIC_GUIDE.promptAnalysis.promptSurprisalsHow },
          "Sparse Attention": { what: METRIC_GUIDE.promptAnalysis.sparseAttention, how: METRIC_GUIDE.promptAnalysis.sparseAttentionHow },
          "Attention Explorer": { what: METRIC_GUIDE.promptAnalysis.attentionExplorer, how: METRIC_GUIDE.promptAnalysis.attentionExplorerHow },
        };
        const totalConnections = paLayers.reduce((sum, ly) => sum + (ly?.heads ?? []).reduce((s, h) => s + (h?.weights?.length ?? 0), 0), 0);
        const headsWithData = paLayers.reduce((sum, ly) => sum + (ly?.heads ?? []).filter((h) => (h?.weights?.length ?? 0) > 0).length, 0);
        const layer = paLayers[paLayerIdx];
        const numHeads = Math.max(layer?.heads?.length ?? 0, 1);
        const effectiveHeadIdx = Math.min(paHeadIdx, numHeads - 1);
        const toToken = layer ? getAttentionToToken(layer, effectiveHeadIdx, paTokenIdx) : [];
        const fromToken = layer ? getAttentionFromToken(layer, effectiveHeadIdx, paTokenIdx) : [];
        const topConn = layer ? getTopConnections(layer, effectiveHeadIdx, 10) : [];
        const basinAnomalies = getBasinAnomalies(paLayers, 0.3);
        const maxHeadsBasin = Math.max(...paLayers.map((l) => l?.basin_scores?.length ?? 0), 1);
        return (
          <section className="section section-prompt-analysis">
            <h3>Prompt analysis</h3>
            <details className="expander" style={{ marginBottom: "0.75rem" }}>
              <summary>What are Sparse Attention and Basin score?</summary>
              <p style={{ fontSize: "0.9rem", margin: "0.5rem 0" }}><strong>Sparse attention:</strong> {METRIC_GUIDE.promptAnalysisConcepts.sparseAttention}</p>
              <p style={{ fontSize: "0.9rem", margin: "0.5rem 0" }}><strong>Basin score:</strong> {METRIC_GUIDE.promptAnalysisConcepts.basinScore}</p>
            </details>
            <p className="metric-one-liner" style={{ marginBottom: "0.75rem" }}>
              <strong>{paTab}:</strong> {paTabCopy[paTab].what} <em>How we get it:</em> {paTabCopy[paTab].how}
            </p>
            <div className="tabs">
              {paTabs.map((t) => (
                <button key={t} className={paTab === t ? "active" : ""} onClick={() => setPaTab(t)}>{t}</button>
              ))}
            </div>
            <div className="chart-container prompt-analysis-charts" style={{ minHeight: 280 }}>
              {paTab === "Layer transformations" && promptAnalysis.layer_transformations && promptAnalysis.layer_transformations.length > 0 && (
                <div className="prompt-analysis-single-chart">
                  <ReactECharts
                    option={{
                      ...CHART_THEME,
                      grid: { left: 48, right: 24, top: 24, bottom: 80 },
                      xAxis: { type: "category", data: promptAnalysis.layer_transformations.map((_, i) => `L${i}→L${i + 1}`), axisLabel: { rotate: 45 } },
                      yAxis: { type: "value", min: 0, max: 1, splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                      tooltip: { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" },
                      series: [{ type: "bar", data: promptAnalysis.layer_transformations, itemStyle: { color: "#818cf8" } }],
                    }}
                    style={{ height: "100%", width: "100%" }}
                    notMerge
                  />
                </div>
              )}
              {paTab === "Layer transformations" && (!promptAnalysis.layer_transformations?.length) && <p style={{ color: "var(--muted)" }}>No layer transformation data.</p>}

              {paTab === "Prompt surprisals" && promptAnalysis.prompt_surprisals && promptAnalysis.prompt_surprisals.length > 0 && (
                <div className="prompt-analysis-single-chart">
                  <ReactECharts
                    option={{
                      ...CHART_THEME,
                      grid: { left: 48, right: 24, top: 24, bottom: 40 },
                      xAxis: { type: "category", data: promptAnalysis.prompt_surprisals.map((_, i) => `T${i}`), axisLabel: { fontSize: 10 } },
                      yAxis: { type: "value", splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                      tooltip: { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" },
                      series: [{ type: "bar", data: promptAnalysis.prompt_surprisals, itemStyle: { color: "#fb923c" } }],
                    }}
                    style={{ height: "100%", width: "100%" }}
                    notMerge
                  />
                </div>
              )}
              {paTab === "Prompt surprisals" && (!promptAnalysis.prompt_surprisals?.length) && <p style={{ color: "var(--muted)" }}>No prompt surprisal data.</p>}

              {paTab === "Sparse Attention" && paLayers.length > 0 && maxHeadsBasin > 0 && (
                <div className="sparse-attention-tab-content">
                  <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.5rem" }}>Basin score heatmap (red &lt;0.3, green ~0.5, blue &gt;1.5). Select layer below for per-head bars.</p>
                  <div style={{ height: 260, marginBottom: "1rem" }}>
                    <ReactECharts
                      option={{
                        ...CHART_THEME,
                        grid: { left: 56, right: 24, top: 24, bottom: 40 },
                        xAxis: { type: "category", data: Array.from({ length: maxHeadsBasin }, (_, i) => `H${i}`), axisLabel: { fontSize: 9 } },
                        yAxis: { type: "category", data: paLayers.map((_, i) => `L${i}`), inverse: true, axisLabel: { fontSize: 9 } },
                        visualMap: { min: 0, max: 2, type: "continuous", inRange: { color: ["#ef4444", "#eab308", "#22c55e", "#3b82f6"] } },
                        tooltip: { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" },
                        series: [{
                          type: "heatmap",
                          data: paLayers.flatMap((ly, li) => Array.from({ length: maxHeadsBasin }, (_, hi) => [hi, li, ly.basin_scores?.[hi] ?? 0])),
                          emphasis: { itemStyle: { borderColor: "#94a3b8", borderWidth: 1 } },
                        }],
                      }}
                      style={{ height: "100%", width: "100%" }}
                      notMerge
                    />
                  </div>
                  <label style={{ fontSize: "0.9rem", marginRight: "0.5rem" }}>Layer</label>
                  <select value={paLayerIdx} onChange={(e) => setPaLayerIdx(Number(e.target.value))} style={{ marginRight: "1rem" }}>
                    {paLayers.map((_, i) => <option key={i} value={i}>Layer {i}</option>)}
                  </select>
                  {layer?.basin_scores && layer.basin_scores.length > 0 && (
                    <div className="sparse-attention-bar-wrap" style={{ height: 220, marginTop: "0.5rem" }}>
                      <ReactECharts
                        option={{
                          ...CHART_THEME,
                          grid: { left: 48, right: 24, top: 24, bottom: 40 },
                          xAxis: { type: "category", data: layer.basin_scores.map((_, i) => `Head ${i}`) },
                          yAxis: { type: "value", min: 0, max: 2, splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                          tooltip: { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" },
                          series: [{ type: "bar", data: layer.basin_scores, itemStyle: { color: "#22c55e" } }],
                        }}
                        style={{ height: "100%", width: "100%" }}
                        notMerge
                      />
                    </div>
                  )}
                  {headsWithData > 0 && (
                    <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                      Sparse attention heads: {headsWithData} heads, {totalConnections} total connections. Use <strong>Attention Explorer</strong> to query which positions attend where.
                    </p>
                  )}
                </div>
              )}
              {paTab === "Sparse Attention" && (!paLayers.length || maxHeadsBasin === 0) && <p style={{ color: "var(--muted)" }}>No sparse attention / basin data.</p>}

              {paTab === "Attention Explorer" && (
                <div style={{ padding: "0.5rem 0" }}>
                  {!paLayers.length ? (
                    <p style={{ color: "var(--muted)" }}>No sparse attention data to query.</p>
                  ) : !hasSparseHeads ? (
                    <p style={{ color: "var(--muted)" }}>Sparse head connections were not captured (e.g. capture_mode=summary). Load a report with full capture to use the Attention Explorer.</p>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem", alignItems: "center" }}>
                        <span><label style={{ marginRight: "0.35rem" }}>Layer</label><select value={paLayerIdx} onChange={(e) => setPaLayerIdx(Number(e.target.value))}>{paLayers.map((_, i) => <option key={i} value={i}>Layer {i}</option>)}</select></span>
                        <span><label style={{ marginRight: "0.35rem" }}>Head</label><select value={Math.min(paHeadIdx, numHeads - 1)} onChange={(e) => setPaHeadIdx(Number(e.target.value))}>{Array.from({ length: numHeads }, (_, i) => <option key={i} value={i}>Head {i}</option>)}</select></span>
                        <span><label style={{ marginRight: "0.35rem" }}>Token index</label><input type="number" min={0} value={paTokenIdx} onChange={(e) => setPaTokenIdx(Number(e.target.value) || 0)} style={{ width: 72 }} /></span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                        <div className="run-details-grid" style={{ margin: 0 }}>
                          <div><span className="k">Queries attending to key {paTokenIdx}</span><div className="v" style={{ fontSize: "0.85rem" }}>{toToken.length ? toToken.slice(0, 15).map(([q, w]) => `q${q}: ${w.toFixed(3)}`).join(", ") : "None"}</div></div>
                          <div><span className="k">Query {paTokenIdx} attends to</span><div className="v" style={{ fontSize: "0.85rem" }}>{fromToken.length ? fromToken.slice(0, 15).map(([k, w]) => `k${k}: ${w.toFixed(3)}`).join(", ") : "None"}</div></div>
                        </div>
                      </div>
                      {topConn.length > 0 && (
                        <div style={{ marginBottom: "1rem" }}>
                          <p className="k" style={{ marginBottom: "0.35rem" }}>Top-10 connections (this head)</p>
                          <div style={{ height: 200 }}>
                            <ReactECharts
                              option={{
                                ...CHART_THEME,
                                grid: { left: 80, right: 24, top: 16, bottom: 32 },
                                xAxis: { type: "value", max: 1, splitLine: { lineStyle: { color: "#475569", type: "dashed" } } },
                                yAxis: { type: "category", data: topConn.map(([q, k]) => `q${q}→k${k}`).reverse(), axisLabel: { fontSize: 10 } },
                                tooltip: { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", formatter: (p: { value: number }) => `Weight: ${(p.value as number).toFixed(4)}` },
                                series: [{ type: "bar", data: [...topConn.map(([, , w]) => w)].reverse(), itemStyle: { color: "#818cf8" } }],
                              }}
                              style={{ height: "100%", width: "100%" }}
                              notMerge
                            />
                          </div>
                        </div>
                      )}
                      {basinAnomalies.length > 0 && (
                        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}><strong>Basin anomalies (score &lt; 0.3):</strong> {basinAnomalies.slice(0, 12).map(([li, hi, s]) => `L${li} H${hi}: ${s.toFixed(3)}`).join(", ")}{basinAnomalies.length > 12 ? "…" : ""}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {perf && (
        <section className="section">
          <h3>Performance</h3>
          <details className="expander">
            <summary>What does this show?</summary>
            <p>{METRIC_GUIDE.performance.what}</p>
          </details>
          <details className="expander">
            <summary>How we calculate these metrics</summary>
            <p><strong>Total wall time:</strong> {METRIC_GUIDE.performance.totalWallTime}</p>
            <p><strong>Parent operations:</strong> {METRIC_GUIDE.performance.parentOps}</p>
            <p><strong>Unaccounted time:</strong> {METRIC_GUIDE.performance.unaccounted}</p>
          </details>
          <div className="metrics-row">
            {totalMs != null && <div className="metric"><div className="label">Total wall time</div><div className="value">{typeof totalMs === "number" ? `${totalMs.toFixed(1)} ms` : String(totalMs)}</div></div>}
            {unaccounted?.ms != null && <div className="metric"><div className="label">Unaccounted time</div><div className="value">{unaccounted.ms.toFixed(1)} ms{unaccounted.pct != null ? ` (${unaccounted.pct.toFixed(1)}%)` : ""}</div></div>}
          </div>
          {opsList.length > 0 && (
            <div className="chart-container" style={{ height: 320 }}>
              <ReactECharts
                option={{
                  ...CHART_THEME,
                  tooltip: { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", trigger: "item", formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: ${(p.value as number).toFixed(1)} ms (${(p as { percent?: number }).percent?.toFixed(1)}%)` },
                  legend: { bottom: 8, textStyle: { color: "#94a3b8" } },
                  series: [{ type: "pie", radius: ["40%", "70%"], center: ["50%", "45%"], data: opsList.map((o, i) => ({ name: o.name, value: o.ms, itemStyle: { color: ["#3b82f6", "#60a5fa", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6"][i % 7] } })) }],
                }}
                style={{ height: "100%", width: "100%" }}
                notMerge
              />
            </div>
          )}
          <div style={{ marginTop: "1rem" }}>
            <h4 style={{ fontSize: "0.95rem" }}>Detailed breakdown</h4>
            {perf.detailed_breakdown?.breakdown != null && Object.keys(perf.detailed_breakdown.breakdown).length > 0 ? (
              <details className="expander breakdown-details">
                <summary>Full detailed breakdown (nested)</summary>
                <div className="breakdown-tree">
                  {(() => {
                    const breakdown = perf.detailed_breakdown!.breakdown!;
                    function BreakdownNode({ name, node, depth = 0 }: { name: string; node: Record<string, unknown>; depth?: number }) {
                      const ms = (node.ms as number) ?? 0;
                      const pct = node.pct as number | undefined;
                      const pctStr = pct != null ? ` (${pct.toFixed(1)}%)` : "";
                      const children = node.children as Record<string, Record<string, unknown>> | undefined;
                      const perStep = node.per_step as { count?: number; min_ms?: number; max_ms?: number; avg_ms?: number } | undefined;
                      if (children && Object.keys(children).length > 0) {
                        return (
                          <div className="breakdown-node" style={{ marginLeft: depth * 12 }}>
                            <details open={depth < 1}>
                              <summary><strong>{name}:</strong> {ms.toFixed(1)} ms{pctStr}</summary>
                              {Object.entries(children).map(([k, v]) => (
                                <BreakdownNode key={k} name={k} node={v as Record<string, unknown>} depth={depth + 1} />
                              ))}
                              {perStep && <div className="breakdown-per-step">Per-step: count={perStep.count}, min={perStep.min_ms} ms, max={perStep.max_ms} ms, avg={perStep.avg_ms} ms</div>}
                            </details>
                          </div>
                        );
                      }
                      return (
                        <div className="breakdown-leaf" style={{ marginLeft: depth * 12 }}>
                          <strong>{name}:</strong> {ms.toFixed(1)} ms{pctStr}
                          {perStep && <div className="breakdown-per-step">Per-step: count={perStep.count}, min={perStep.min_ms} ms, max={perStep.max_ms} ms, avg={perStep.avg_ms} ms</div>}
                        </div>
                      );
                    }
                    return Object.entries(breakdown).map(([opName, opNode]) => <BreakdownNode key={opName} name={opName} node={(opNode as Record<string, unknown>) ?? {}} />);
                  })()}
                </div>
              </details>
            ) : (
              <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>No detailed breakdown in this report. Run with <code>--perf detailed</code> to capture per-operation timings (and optionally export to a separate JSON).</p>
            )}
          </div>
          {perf.baseline_ms != null && (
            <div style={{ marginTop: "1rem" }}>
              <h4 style={{ fontSize: "0.95rem" }}>Strict mode results</h4>
              <details className="expander">
                <summary>How we calculate these metrics</summary>
                <p><strong>Original model load:</strong> {METRIC_GUIDE.performance.strict.originalModelLoad}</p>
                <p><strong>Warmup:</strong> {METRIC_GUIDE.performance.strict.warmup}</p>
                <p><strong>Baseline:</strong> {METRIC_GUIDE.performance.strict.baseline}</p>
                <p><strong>Instrumented inference:</strong> {METRIC_GUIDE.performance.strict.instrumentedInference}</p>
                <p><strong>Inference overhead:</strong> {METRIC_GUIDE.performance.strict.inferenceOverhead}</p>
                <p><strong>CoreVital overhead:</strong> {METRIC_GUIDE.performance.strict.corevitalOverhead}</p>
              </details>
              <div className="metrics-row" style={{ flexWrap: "wrap" }}>
                {["original_model_load_ms", "warmup_ms", "baseline_ms", "instrumented_inference_ms", "inference_overhead_ms", "inference_overhead_pct", "corevital_overhead_ms", "corevital_overhead_pct"].map((k) => {
                  const v = (perf as Record<string, unknown>)[k];
                  const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                  const display = v == null ? "—" : typeof v === "number" ? (k.includes("pct") ? `${v.toFixed(1)}%` : `${v.toFixed(1)}`) : String(v);
                  return <div key={k} className="metric"><div className="label">{label}</div><div className="value">{display}</div></div>;
                })}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="section">
        <details className="expander">
          <summary>Raw JSON (tree view)</summary>
          <p style={{ marginBottom: "0.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>Expand nodes to browse; no full stringify, so large reports stay responsive. Download for the full file.</p>
          <button
            type="button"
            style={{ marginBottom: "0.5rem" }}
            onClick={() => {
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `corevital_${report.trace_id?.slice(0, 8) ?? "report"}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download full JSON
          </button>
          <JsonTree data={report} />
        </details>
      </section>
    </div>
  );
}
