import type { CoreVitalReport } from "../types/report";
import { isEnrichedBlamedLayers } from "../types/report";

function extractCompareMetrics(report: CoreVitalReport): Record<string, string | number | boolean | undefined> {
  const model = report.model ?? {};
  const summary = report.summary ?? {};
  const runConfig = report.run_config ?? {};
  const gen = runConfig.generation ?? {};
  const prompt = report.prompt ?? {};
  const generated = report.generated ?? {};
  const health = report.health_flags ?? {};
  const ext = report.extensions ?? {};
  const risk = ext.risk ?? {};
  const quant = model.quantization ?? {};
  const quantStr = quant.enabled ? quant.method ?? "enabled" : "None";
  const promptText = (prompt.text ?? "?").slice(0, 80);
  const outputText = (generated.output_text ?? "?").slice(0, 80);

  const blamedDisplay = isEnrichedBlamedLayers(risk.blamed_layers)
    ? risk.blamed_layers.map((bl) => `L${bl.layer}(${bl.severity.toFixed(2)})`).join(", ")
    : (risk.blamed_layers_flat ?? risk.blamed_layers as number[] | undefined)?.join(", ");

  return {
    "Risk score": risk.risk_score,
    "Attention collapse severity": health.attention_collapse_severity,
    "Failure risk": ext.early_warning?.failure_risk,
    "NaN detected": health.nan_detected,
    "Inf detected": health.inf_detected,
    "Attention collapse": health.attention_collapse_detected,
    "High entropy steps": health.high_entropy_steps,
    "Repetition loop": health.repetition_loop_detected,
    "Mid-layer anomaly": health.mid_layer_anomaly_detected,
    "Fingerprint version": ext.fingerprint?.version,
    "Compound signals": ext.compound_signals?.length ?? 0,
    "Divergence score": ext.calibration?.divergence_score,
    "Blamed layers": blamedDisplay,
    Model: model.hf_id,
    "Num layers": model.num_layers,
    "Hidden size": model.hidden_size,
    "Num attention heads": model.num_attention_heads,
    Quantization: quantStr,
    Device: model.device,
    Seed: runConfig.seed,
    "Max new tokens": runConfig.max_new_tokens,
    Temperature: gen.temperature,
    "Top-K": gen.top_k,
    "Top-P": gen.top_p,
    "Prompt tokens": prompt.num_tokens,
    "Generated tokens": summary.generated_tokens,
    "Total steps": summary.total_steps,
    "Elapsed (ms)": summary.elapsed_ms,
    "Prompt (preview)": promptText + ((prompt.text ?? "").length > 80 ? "…" : ""),
    "Output (preview)": outputText + ((generated.output_text ?? "").length > 80 ? "…" : ""),
  };
}

function formatVal(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Math.abs(v) < 1e-3 || Math.abs(v) >= 1e4 ? String(v) : v.toFixed(2);
  return String(v);
}

export default function CompareRuns({
  reports,
  traceIds,
}: {
  reports: CoreVitalReport[];
  traceIds: string[];
}) {
  const metricsList = reports.map(extractCompareMetrics);
  const keys = metricsList[0] ? Object.keys(metricsList[0]) : [];
  const colHeaders = traceIds.map((id, i) => `Run ${i + 1} (${id.slice(0, 8)})`);

  return (
    <div className="section">
      <h2>Compare runs</h2>
      <p>Metrics side-by-side. Cells that differ from Run 1 are highlighted.</p>
      <div style={{ overflowX: "auto" }}>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Metric</th>
              {colHeaders.map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th>Diff from Run 1?</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const vals = metricsList.map((m) => formatVal(m[k]));
              const ref = vals[0];
              const allSame = vals.every((v) => v === ref);
              return (
                <tr key={k}>
                  <td><strong>{k}</strong></td>
                  {vals.map((v, i) => (
                    <td key={i} className={v !== ref ? "diff" : ""}>{v}</td>
                  ))}
                  <td style={{ fontWeight: allSame ? "normal" : "bold" }}>{allSame ? "Same" : "Different"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="expander" style={{ marginTop: "1rem" }}>
        <summary>Prompts and outputs by run</summary>
        {reports.map((r, i) => (
          <div key={i} style={{ marginTop: "0.75rem" }}>
            <strong>Run {i + 1}</strong> ({traceIds[i]?.slice(0, 8)})
            <p><small>Prompt</small></p>
            <pre className="mono compare-prompt-output">{(r.prompt?.text ?? "?")}</pre>
            <p><small>Output</small></p>
            <pre className="mono compare-prompt-output">{(r.generated?.output_text ?? "?")}</pre>
          </div>
        ))}
      </details>
    </div>
  );
}
