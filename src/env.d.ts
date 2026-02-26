/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to http://127.0.0.1:8000 to call API directly (bypass Vite proxy). Use if upload fails with ECONNRESET. */
  readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
