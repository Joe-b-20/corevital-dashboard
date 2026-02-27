import { useCallback, useEffect, useState } from "react";
import { fetchDemoIndex, fetchDemoTrace, fetchTraces, fetchReport } from "./api/client";
import RunDetail from "./components/RunDetail";
import CompareRuns from "./components/CompareRuns";
import { useDashboardStore, DEFAULT_API_BASE_URL } from "./store/useDashboardStore";
import type { CoreVitalReport, TraceRow } from "./types/report";
import "./App.css";

/** Parse a File as CoreVitalReport in the browser (no server upload). */
function parseTraceFile(file: File): Promise<CoreVitalReport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const json = JSON.parse(text) as CoreVitalReport;
        resolve(json);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Invalid JSON"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export default function App() {
  const {
    source,
    setSource,
    apiBaseUrl,
    setApiBaseUrl,
    dbPath,
    setDbPath,
    traces,
    setTraces,
    demoTraces,
    setDemoTraces,
    selectedTraceId,
    setSelectedTraceId,
    report,
    setReport,
    viewMode,
    setViewMode,
    compareSelectedIds,
    setCompareSelectedIds,
    compareReports,
    setCompareReports,
    loading,
    setLoading,
    error,
    setError,
  } = useDashboardStore();

  const [dbModelFilter, setDbModelFilter] = useState("");
  const [dbPromptHashFilter, setDbPromptHashFilter] = useState("");
  const [demoLoadedOnce, setDemoLoadedOnce] = useState(false);
  const [selectedDemoFile, setSelectedDemoFile] = useState<string | null>(null);

  /** Demo mode: load index from public/demo/index.json, then load first trace (or specified file). */
  const loadDemo = useCallback(async (traceFile?: string) => {
    setError(null);
    setLoading(true);
    try {
      const { traces: list } = await fetchDemoIndex();
      setDemoTraces(list);
      const toLoad = traceFile ?? list[0]?.file;
      if (!toLoad) {
        setError("No demo traces in /demo/index.json");
        setReport(null);
        setSelectedDemoFile(null);
        setLoading(false);
        return;
      }
      const data = (await fetchDemoTrace(toLoad)) as CoreVitalReport;
      setReport(data);
      setSelectedDemoFile(toLoad);
      setTraces([]);
      setSelectedTraceId(null);
      setCompareReports([]);
      setCompareSelectedIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demo");
      setReport(null);
      setSelectedDemoFile(null);
    } finally {
      setLoading(false);
    }
  }, [setError, setLoading, setReport, setTraces, setSelectedTraceId, setCompareReports, setCompareSelectedIds, setDemoTraces]);

  /** Load demo on first visit when source is demo (default). */
  useEffect(() => {
    if (source !== "demo" || demoLoadedOnce || loading) return;
    setDemoLoadedOnce(true);
    loadDemo();
  }, [source, demoLoadedOnce, loadDemo, loading]);

  const loadTraces = useCallback(async () => {
    if (!dbPath.trim()) {
      setError("Enter database path");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const list = (await fetchTraces(apiBaseUrl, dbPath.trim(), {
        limit: 200,
        model_id: dbModelFilter.trim() || undefined,
        prompt_hash: dbPromptHashFilter.trim() || undefined,
      })) as TraceRow[];
      setTraces(list);
      setReport(null);
      setSelectedTraceId(null);
      if (list.length > 0 && viewMode === "detail") setSelectedTraceId(list[0].trace_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to list traces");
      setTraces([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, dbPath, dbModelFilter, dbPromptHashFilter, viewMode, setError, setLoading, setTraces, setReport, setSelectedTraceId]);

  const loadReportByTrace = useCallback(
    async (traceId: string) => {
      if (!dbPath.trim()) return;
      setError(null);
      setLoading(true);
      try {
        const data = (await fetchReport(apiBaseUrl, dbPath.trim(), traceId)) as CoreVitalReport;
        setReport(data);
        setSelectedTraceId(traceId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load report");
        setReport(null);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, dbPath, setError, setLoading, setReport, setSelectedTraceId]
  );

  const loadCompareReports = useCallback(async () => {
    if (!dbPath.trim() || compareSelectedIds.length < 2) return;
    setError(null);
    setLoading(true);
    try {
      const reports: CoreVitalReport[] = [];
      for (const id of compareSelectedIds) {
        const r = (await fetchReport(apiBaseUrl, dbPath.trim(), id)) as CoreVitalReport;
        reports.push(r);
      }
      setCompareReports(reports);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports for compare");
      setCompareReports([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, dbPath, compareSelectedIds, setError, setLoading, setCompareReports]);

  /** Client-side only: parse JSON file in browser and set report (no upload). */
  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      setError(null);
      setLoading(true);
      parseTraceFile(file)
        .then((json) => {
          setReport(json);
          setSource("upload");
          setTraces([]);
          setSelectedTraceId(null);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Invalid JSON or read failed");
          setReport(null);
        })
        .finally(() => setLoading(false));
    },
    [setError, setLoading, setReport, setSource, setTraces, setSelectedTraceId]
  );

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      handleFile(file ?? null);
      e.target.value = "";
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      if (file?.name?.toLowerCase().endsWith(".json")) handleFile(file);
      else if (file) setError("Please drop a .json file (CoreVital trace).");
    },
    [handleFile, setError]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleExportJson = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `corevital_${report.trace_id?.slice(0, 8) ?? "report"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [report]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>CoreVital</h2>
        <p className="caption">LLM inference health monitor</p>

        <label>Report source</label>
        <div className="source-options">
          <label>
            <input type="radio" name="source" checked={source === "demo"} onChange={() => setSource("demo")} />
            Demo sample
          </label>
          <label>
            <input type="radio" name="source" checked={source === "database"} onChange={() => setSource("database")} />
            Database
          </label>
          <label>
            <input type="radio" name="source" checked={source === "upload"} onChange={() => setSource("upload")} />
            Drag & drop JSON
          </label>
        </div>

        {source === "demo" && (
          <>
            {demoTraces.length > 1 ? (
              <>
                <label style={{ marginTop: "0.5rem" }}>Demo trace</label>
                <select
                  value={selectedDemoFile ?? demoTraces[0]?.file ?? ""}
                  onChange={(e) => {
                    const file = e.target.value;
                    if (file) loadDemo(file);
                  }}
                  style={{ marginTop: "0.25rem", width: "100%" }}
                >
                  {demoTraces.map((t) => (
                    <option key={t.id} value={t.file}>
                      {t.label ?? t.file}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <button onClick={() => loadDemo()} disabled={loading} style={{ marginTop: "0.5rem" }}>
                Reload demo
              </button>
            )}
            {report && <p className="success-msg" style={{ marginTop: "0.5rem" }}>Demo loaded</p>}
          </>
        )}

        {source === "database" && (
          <>
            <label>API Base URL</label>
            <input
              type="url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder={DEFAULT_API_BASE_URL}
              style={{ marginTop: "0.25rem" }}
            />
            <p style={{ fontSize: "0.8rem", color: "#a6adc8", marginTop: "0.25rem" }}>
              Backend from <code>corevital serve</code>. Default: http://localhost:8000
            </p>
            <label style={{ marginTop: "0.5rem" }}>SQLite path (server path)</label>
            <input
              type="text"
              value={dbPath}
              onChange={(e) => setDbPath(e.target.value)}
              placeholder="e.g. /path/to/corevital.db"
            />
            <p style={{ fontSize: "0.8rem", color: "#a6adc8", marginTop: "0.25rem" }}>
              Use <strong>forward slashes</strong>. Absolute path (e.g. /home/.../runs/corevital.db) is most reliable.
            </p>
            <label style={{ marginTop: "0.5rem" }}>Filter by model (optional)</label>
            <input
              type="text"
              value={dbModelFilter}
              onChange={(e) => setDbModelFilter(e.target.value)}
              placeholder="e.g. meta-llama/Llama-2-7b-hf"
              style={{ marginTop: "0.25rem" }}
            />
            <label style={{ marginTop: "0.5rem" }}>Filter by prompt hash (optional)</label>
            <input
              type="text"
              value={dbPromptHashFilter}
              onChange={(e) => setDbPromptHashFilter(e.target.value)}
              placeholder="exact hash to compare same prompt"
              style={{ marginTop: "0.25rem" }}
            />
            <button onClick={loadTraces} disabled={loading} style={{ marginTop: "0.5rem" }}>
              List traces
            </button>
            {traces.length > 0 && (
              <>
                <label style={{ marginTop: "0.75rem" }}>View</label>
                <div className="source-options">
                  <label>
                    <input type="radio" name="view" checked={viewMode === "detail"} onChange={() => setViewMode("detail")} />
                    Run detail
                  </label>
                  <label>
                    <input type="radio" name="view" checked={viewMode === "compare"} onChange={() => setViewMode("compare")} />
                    Compare runs
                  </label>
                </div>
                {viewMode === "detail" && (
                  <>
                    <label>Select trace</label>
                    <select
                      value={selectedTraceId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) loadReportByTrace(id);
                      }}
                    >
                      <option value="">—</option>
                      {traces.map((t) => (
                        <option key={t.trace_id} value={t.trace_id}>
                          {t.trace_id.slice(0, 8)} | {t.model_id} | {t.created_at_utc} {t.risk_score != null ? `risk=${t.risk_score.toFixed(2)}` : ""}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {viewMode === "compare" && (
                  <>
                    <label>Select 2+ traces to compare</label>
                    <select
                      multiple
                      size={6}
                      value={compareSelectedIds}
                      onChange={(e) => {
                        const opts = Array.from(e.target.selectedOptions, (o) => o.value);
                        setCompareSelectedIds(opts);
                      }}
                      style={{ width: "100%", marginTop: "0.25rem" }}
                    >
                      {traces.map((t) => (
                        <option key={t.trace_id} value={t.trace_id}>
                          {t.trace_id.slice(0, 8)} | {t.model_id} | risk={t.risk_score?.toFixed(2) ?? "?"}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={loadCompareReports}
                      disabled={loading || compareSelectedIds.length < 2}
                      style={{ marginTop: "0.5rem" }}
                    >
                      Compare selected
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}

        {source === "upload" && (
          <>
            <div
              className="dropzone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              style={{
                marginTop: "0.5rem",
                padding: "1rem",
                border: "2px dashed var(--border)",
                borderRadius: "8px",
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem" }}>Drop a CoreVital trace.json here</p>
              <label style={{ cursor: "pointer", textDecoration: "underline" }}>
                or choose file
                <input type="file" accept=".json" onChange={handleUpload} disabled={loading} style={{ display: "none" }} />
              </label>
            </div>
          </>
        )}

        {error && <p className="error-msg">{error}</p>}
        {report && source !== "database" && (
          <button onClick={handleExportJson} style={{ marginTop: "1rem" }}>
            Export report (JSON)
          </button>
        )}
      </aside>

      <main className="main">
        {loading && <p>Loading…</p>}
        {!loading && viewMode === "compare" && source === "database" && compareReports.length >= 2 && (
          <CompareRuns reports={compareReports} traceIds={compareSelectedIds} />
        )}
        {!loading && viewMode === "detail" && report && <RunDetail report={report} />}
        {!loading && viewMode === "detail" && !report && (
          <p>Select a report source and load data to begin.</p>
        )}
        {!loading && viewMode === "compare" && (compareReports.length < 2 || source !== "database") && (
          <p>Select Database, list traces, choose "Compare runs", then select 2+ traces and click Compare selected.</p>
        )}
      </main>
    </div>
  );
}
