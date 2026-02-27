/**
 * API client for CoreVital dashboard.
 * - Demo mode: fetches from /demo/ (static files in public/demo/).
 * - Local API mode: uses dynamic apiBaseUrl (e.g. http://localhost:8000) for traces/reports.
 * - Drag-and-drop: handled entirely in the app via FileReader; no network calls.
 */

const FETCH_REPORT_TIMEOUT_MS = 120_000; // 2 min for large reports

const API_NOT_RUNNING_MSG =
  "Local API not reachable. Start your backend with: corevital serve (default http://localhost:8000).";

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30_000, ...fetchOptions } = options;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...fetchOptions, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(id);
  }
}

async function handleResponse<T>(r: Response, parse: () => Promise<T>): Promise<T> {
  if (!r.ok) {
    const text = await r.text();
    let msg = text || r.statusText;
    try {
      const j = JSON.parse(text);
      if (j.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      if (text.length < 500) msg = text;
    }
    throw new Error(msg);
  }
  return parse();
}

function wrapFetch(fn: () => Promise<unknown>): Promise<unknown> {
  return fn().catch((e) => {
    if (e?.name === "AbortError") throw new Error("Request timed out. Try a smaller report or use Database source.");
    if (e?.message?.includes("ECONNREFUSED") || e?.message?.includes("Failed to fetch") || e?.name === "TypeError") {
      throw new Error(API_NOT_RUNNING_MSG);
    }
    throw e;
  });
}

/** Demo mode: fetch the list of demo traces from public/demo/index.json */
export async function fetchDemoIndex(): Promise<{ traces: { id: string; file: string; label?: string }[] }> {
  const r = await fetch("/demo/index.json");
  return handleResponse(r, () => r.json());
}

/** Demo mode: fetch a single trace JSON from public/demo/ (e.g. /demo/trace_51580e50.json) */
export async function fetchDemoTrace(relativePath: string): Promise<unknown> {
  const path = relativePath.startsWith("/") ? relativePath : `/demo/${relativePath}`;
  const r = await fetchWithTimeout(path, { timeoutMs: 60_000 });
  return handleResponse(r, () => r.json());
}

/** Local API mode: list traces from the backend (requires apiBaseUrl + db_path). */
export async function fetchTraces(
  apiBaseUrl: string,
  dbPath: string,
  opts?: { limit?: number; model_id?: string; prompt_hash?: string; order_asc?: boolean }
): Promise<unknown[]> {
  return wrapFetch(async () => {
    const base = apiBaseUrl.replace(/\/$/, "") + "/api";
    const params = new URLSearchParams({ db_path: dbPath });
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.model_id) params.set("model_id", opts.model_id);
    if (opts?.prompt_hash) params.set("prompt_hash", opts.prompt_hash);
    if (opts?.order_asc) params.set("order_asc", "true");
    const r = await fetch(`${base}/traces?${params}`);
    return handleResponse(r, () => r.json());
  }) as Promise<unknown[]>;
}

/** Local API mode: fetch full report for a trace. */
export async function fetchReport(apiBaseUrl: string, dbPath: string, traceId: string): Promise<unknown> {
  return wrapFetch(async () => {
    const base = apiBaseUrl.replace(/\/$/, "") + "/api";
    const params = new URLSearchParams({ db_path: dbPath });
    const r = await fetchWithTimeout(
      `${base}/reports/${encodeURIComponent(traceId)}?${params}`,
      { timeoutMs: FETCH_REPORT_TIMEOUT_MS }
    );
    return handleResponse(r, () => r.json());
  });
}
