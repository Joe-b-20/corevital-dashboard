# CoreVital Dashboard (UI)

A **decoupled, serverless** React Single Page Application (SPA) for [CoreVital](https://github.com/your-org/CoreVital) LLM inference observability. This repository contains only the frontend; it is designed to run without a backend (static hosting, e.g. AWS Amplify) or to connect to a local CoreVital API when you run `corevital serve`.

---

## What This Repo Is

- **React dashboard** for viewing CoreVital trace/report JSON: run summaries, health flags, timelines, attention metrics, and raw JSON.
- **Fully independent of the CoreVital Python engine** for normal use: no backend is required for demo or drag-and-drop modes.
- **Static SPA**: build with Vite and deploy to any static host (e.g. AWS Amplify, S3 + CloudFront, Netlify).

---

## Quick Start (Development)

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. The app loads in **Demo mode** by default and shows sample data from `public/demo/`.

---

## Data Modes

The dashboard supports three ways to get data. No cloud backend is required.

### 1. Demo Mode (Default)

- **For**: Visitors and quick tryouts (e.g. from the main CoreVital README).
- **Behavior**: On load, the app fetches `public/demo/index.json` to get the list of demo traces, then loads the first trace (e.g. `public/demo/trace_1.json`) via a normal `fetch('/demo/trace_1.json')`.
- **Data**: All demo data is static; nothing is sent to a server.

### 2. Drag-and-Drop Mode

- **For**: Viewing a single CoreVital `trace.json` (or report JSON) on your machine.
- **Behavior**: Choose **“Drag & drop JSON”** in the sidebar, then either drag a `.json` file onto the drop zone or click to choose a file. The file is read **entirely in the browser** with the HTML5 FileReader API; **no upload or POST request** is made. The parsed JSON is kept in memory and rendered in the dashboard.

### 3. Local API Mode

- **For**: Browsing your local SQLite history from the CoreVital engine.
- **Behavior**: Run the CoreVital backend on your machine (`corevital serve`). In the dashboard, select **“Database”**, set **API Base URL** (default `http://localhost:8000`), enter the **SQLite path** as seen by the backend, then click **List traces**. All trace listing and report loading use this dynamic base URL; no backend is needed for Demo or Drag-and-Drop.

---

## Running Locally

| Command           | Description                    |
|------------------|--------------------------------|
| `npm install`    | Install dependencies          |
| `npm run dev`    | Start dev server (port 5173)   |
| `npm run build`  | Production build to `dist/`   |
| `npm run preview`| Preview production build      |

---

## Updating the Demo (Maintainers)

To change what visitors see in Demo mode:

1. **Add or replace trace files** in `public/demo/`, e.g.:
   - `public/demo/trace_1.json`
   - `public/demo/trace_2.json`
2. **Update the index** at `public/demo/index.json` so the app knows which files to list and load. The format is:

   ```json
   {
     "traces": [
       { "id": "trace_1", "file": "trace_1.json", "label": "Optional display name" },
       { "id": "trace_2", "file": "trace_2.json", "label": "Another sample" }
     ]
   }
   ```

   - `file` is the filename under `public/demo/` (e.g. `trace_1.json`). The app will request `/demo/trace_1.json`.
   - `label` is optional and can be used in the UI (e.g. dropdown).

3. On the next load (or “Reload demo”), the app will fetch `index.json` and the first trace (or the selected one) from these paths.

---

## Tech Stack

- **Vite**, **React 18**, **TypeScript**
- **Zustand** (state), **ECharts** (charts), **Tailwind CSS**
- No backend in this repo; optional connection to `corevital serve` for Local API mode.

See [docs/STACK.md](docs/STACK.md) for design notes (JSON tree, ECharts, etc.).

---

## License

Same as the main CoreVital project.
