# Stack & design choices

See also the main [README](../README.md).

## 1. Raw JSON: chunked / lazy loading

We **don’t** load the full report as one big string anymore. The **Raw JSON** section uses a **lazy tree view** (`JsonTree`): only the keys you expand are traversed and rendered. The full object is never stringified for display, so large reports stay responsive. You can still **Download full JSON** to get the whole file.

## 2. Plotly vs ECharts

We are **not** using Plotly in the React app. The app was originally built with **Recharts**. We’re adding **Apache ECharts** (via `echarts-for-react`) and moving charts to ECharts. ECharts is a good fit: strong heatmaps, good performance on large series, and a single library for line/bar/pie/heatmap instead of mixing Recharts and something else for heatmaps.

## 3. Tailwind CSS + shadcn/ui

- **Tailwind CSS** is installed and wired (v3 for Node 18). You can use utility classes anywhere. The existing dark theme still uses custom CSS variables and classes; we can migrate components to Tailwind over time.
- **shadcn/ui** is not installed yet. Adding it is done via their CLI (`npx shadcn@latest init` and `npx shadcn@latest add button`, etc.), which copies components into your repo. Once you run that, we can replace custom buttons/inputs/selects with shadcn components for consistency and accessibility.

## 4. State management: Zustand

**Zustand** is installed and a store is in `src/store/useDashboardStore.ts` (source, dbPath, traces, report, viewMode, compare state, loading, error). The main app can be refactored to use this store instead of local `useState` so that loading/error and report state are centralized and easier to reuse (e.g. from a future navbar or compare view).

## 5. Upload and “loading forever” / Internal Server Error

- **Demo “Internal Server Error”**  
  The `/api/demo` handler now wraps loading in try/except and returns:
  - **404** when no demo source is configured (with a clear message to set `COREVITAL_DB_PATH` or `COREVITAL_DEMO_JSON`).
  - **500** only on real failures (e.g. bad JSON, I/O), with a short detail message.

- **Upload and trace loading**  
  - **Client:** All API calls use **timeouts** (e.g. 2 min for loading a report, ~1.5 min for upload). If the server or network is slow, you get a “Request timed out” error instead of loading forever. Error responses (including 500) are parsed so the UI can show the server’s message.
  - **Server:** The upload endpoint is wrapped in try/except and returns 400 when the body is missing and 500 with a message on other errors. Large JSON bodies are accepted (no extra body-size limit in the app); if timeouts still happen on very large uploads, use the Database source or increase the client timeout.

If “loading forever” or 500 persist, check the API terminal for the exact exception and the browser Network tab for the response body; the UI should now display that message.
