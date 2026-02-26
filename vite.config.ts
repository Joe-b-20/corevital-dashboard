import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// No /api proxy: this SPA uses Demo (static /demo/), Drag-and-Drop (client-only), or Local API (dynamic base URL).
export default defineConfig({
  plugins: [react()],
})
