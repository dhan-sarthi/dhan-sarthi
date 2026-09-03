import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The client never holds a provider key. Everything provider-shaped goes through the API, which
 * is why both the dev server and `preview` proxy `/api` — the built app is what gets demoed, and
 * a proxy that only exists in dev means the avatar works right up until you show it to somebody.
 *
 * `VITE_API_PROXY_TARGET` points the proxy at another API instance. It exists so a second dev
 * server can drive a scratch API (a live-call rehearsal on :3011, say) without touching the one
 * the rest of the team is looking at on :3001.
 *
 * `host: true` binds 0.0.0.0 so a phone on the same wifi can open it. This is a mobile web app;
 * testing it only in a desktop browser is how the layout ended up 3,409px tall.
 */
const proxy = {
  '/api': {
    target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, host: true, proxy },
  preview: { port: 4173, host: true, proxy },
})
