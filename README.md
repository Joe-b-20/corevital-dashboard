# CoreVital Dashboard (UI)

A **decoupled, serverless** React Single Page Application (SPA) for [CoreVital](https://github.com/Joe-b-20/CoreVital) LLM inference observability. This repository contains only the frontend; it is designed to run without a backend (static hosting, e.g. AWS Amplify) or to connect to a local CoreVital API when you run `corevital serve`.

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
- **Behavior**: On load, the app fetches `public/demo/index.json` to get the list of demo traces, then loads the first trace (e.g. `public/demo/trace_51580e50.json`) via a normal `fetch('/demo/trace_51580e50.json')`.
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
   - `public/demo/trace_51580e50.json`
   - `public/demo/trace_7a2842bc.json`
2. **Update the index** at `public/demo/index.json` so the app knows which files to list and load. The format is:

   ```json
   {
     "traces": [
       { "id": "trace_51580e50", "file": "trace_51580e50.json", "label": "Optional display name" },
       { "id": "trace_7a2842bc", "file": "trace_7a2842bc.json", "label": "Another sample" }
     ]
   }
   ```

   - `file` is the filename under `public/demo/` (e.g. `trace_51580e50.json`). The app will request `/demo/trace_51580e50.json`.
   - `label` is optional and can be used in the UI (e.g. dropdown).

3. On the next load (or “Reload demo”), the app will fetch `index.json` and the first trace (or the selected one) from these paths.

---

## Deploy to AWS Amplify

This app is ready for static hosting on **AWS Amplify**. After pushing to GitHub:

1. In [AWS Amplify Console](https://console.aws.amazon.com/amplify/), choose **New app** → **Host web app**.
2. Connect your GitHub (or Git provider) and select this repository and branch.
3. Amplify will detect the build spec from the repo:
   - **Build spec**: Uses `amplify.yml` in the repo root (`npm ci` → `npm run build`, artifacts from `dist/`).
   - **SPA redirects**: `public/redirects.json` is copied to `dist/` during build so all routes serve `index.html` for client-side routing.
4. If your Amplify app does not pick up redirects from the build output, add a single rewrite rule in the Console: **Hosting** → **Rewrites and redirects** → add rule: source `/<*>`, target `/index.html`, type **200 (rewrite)**.
5. Save and deploy. The app will be available at the Amplify URL.

No environment variables or backend are required for Demo or Drag-and-Drop modes.

---

## Tech Stack

- **Vite**, **React 18**, **TypeScript**
- **Zustand** (state), **ECharts** (charts), **Tailwind CSS**
- No backend in this repo; optional connection to `corevital serve` for Local API mode.

See [docs/STACK.md](docs/STACK.md) for design notes (JSON tree, ECharts, etc.).

---

## Pre-push / deployment checklist

- [x] `public/demo/index.json` lists all trace files in `public/demo/*.json`.
- [x] `amplify.yml` defines build (e.g. `npm ci` → `npm run build`) and artifacts from `dist/`.
- [x] `public/redirects.json` is present so the SPA rewrite is applied when deployed (e.g. Amplify).
- [x] No placeholder links or org names left in README or docs (CoreVital repo link, license).

After push: connect the repo in AWS Amplify, confirm build settings use `amplify.yml`, then deploy.

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
