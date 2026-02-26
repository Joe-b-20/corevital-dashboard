import { create } from "zustand";
import type { CoreVitalReport, TraceRow } from "../types/report";

type Source = "demo" | "database" | "upload";
type ViewMode = "detail" | "compare";

/** Default base URL for Local API mode (corevital serve). */
export const DEFAULT_API_BASE_URL = "http://localhost:8000";

interface DashboardState {
  source: Source;
  setSource: (s: Source) => void;
  /** Base URL for the local CoreVital API (e.g. http://localhost:8000). Used only in Database source. */
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;
  dbPath: string;
  setDbPath: (p: string) => void;
  traces: TraceRow[];
  setTraces: (t: TraceRow[]) => void;
  /** Demo trace list from public/demo/index.json. */
  demoTraces: { id: string; file: string; label?: string }[];
  setDemoTraces: (t: { id: string; file: string; label?: string }[]) => void;
  selectedTraceId: string | null;
  setSelectedTraceId: (id: string | null) => void;
  report: CoreVitalReport | null;
  setReport: (r: CoreVitalReport | null) => void;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  compareSelectedIds: string[];
  setCompareSelectedIds: (ids: string[]) => void;
  compareReports: CoreVitalReport[];
  setCompareReports: (r: CoreVitalReport[]) => void;
  loading: boolean;
  setLoading: (b: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  source: "demo",
  setSource: (source) => set({ source }),
  apiBaseUrl: DEFAULT_API_BASE_URL,
  setApiBaseUrl: (apiBaseUrl) => set({ apiBaseUrl }),
  dbPath: "",
  setDbPath: (dbPath) => set({ dbPath }),
  traces: [],
  setTraces: (traces) => set({ traces }),
  demoTraces: [],
  setDemoTraces: (demoTraces) => set({ demoTraces }),
  selectedTraceId: null,
  setSelectedTraceId: (selectedTraceId) => set({ selectedTraceId }),
  report: null,
  setReport: (report) => set({ report }),
  viewMode: "detail",
  setViewMode: (viewMode) => set({ viewMode }),
  compareSelectedIds: [],
  setCompareSelectedIds: (compareSelectedIds) => set({ compareSelectedIds }),
  compareReports: [],
  setCompareReports: (compareReports) => set({ compareReports }),
  loading: false,
  setLoading: (loading) => set({ loading }),
  error: null,
  setError: (error) => set({ error }),
}));
