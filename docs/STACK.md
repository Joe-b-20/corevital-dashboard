# Stack & design choices

See also the main [README](../README.md).

## 1. Raw JSON: chunked / lazy loading

We **don't** load the full report as one big string anymore. The **Raw JSON** section uses a **lazy tree view** (`JsonTree`): only the keys you expand are traversed and rendered. The full object is never stringified for display, so large reports stay responsive. You can still **Download full JSON** to get the whole file.

## 2. Plotly vs ECharts

We are **not** using Plotly in the React app. The app was originally built with **Recharts**. We're adding **Apache ECharts** (via `echarts-for-react`) and moving charts to ECharts. ECharts is a good fit: strong heatmaps, good performance on large series, and a single library for line/bar/pie/heatmap instead of mixing Recharts and something else for heatmaps.

## 3. Tailwind CSS + shadcn/ui

- **Tailwind CSS** is installed and wired (v3 for Node 18). You can use utility classes anywhere. The existing dark theme still uses custom CSS variables and classes; we can migrate components to Tailwind over time.
- **shadcn/ui** is not installed yet. Adding it is done via their CLI (`npx shadcn@latest init` and `npx shadcn@latest add button`, etc.), which copies components into your repo. Once you run that, we can replace custom buttons/inputs/selects with shadcn components for consistency and accessibility.

## 4. State management: Zustand

**Zustand** is installed and a store is in `src/store/useDashboardStore.ts` (source, apiBaseUrl, dbPath, traces, report, viewMode, compare state, loading, error). The main app uses this store for loading/error and report state.

## 5. Data sources and loading

- **Demo mode:** The app loads traces from static files in `public/demo/`. It fetches `index.json` for the list, then loads trace JSON files via `fetch('/demo/…')`. No backend is involved.
- **Drag-and-drop:** Files are read in the browser with the FileReader API and parsed as JSON; nothing is uploaded to any server.
- **Local API (Database) mode:** When the user runs `corevital serve` and enters the API base URL + DB path, the app calls that backend for listing traces and loading reports. All such requests use **timeouts** (e.g. 2 min for large reports). Error responses are parsed so the UI shows the server's message.
