import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The console talks to `/api/v1/*` and nothing else, so dev and `preview` both proxy `/api` to
 * the API: the built bundle is what gets demoed, and a proxy that only exists in dev breaks the
 * moment somebody runs `preview`.
 *
 * `VITE_API_PROXY_TARGET` points the proxy at another API instance (a scratch API on :3011, say)
 * without touching the one the rest of the team is using on :3001. `strictPort: false` because
 * the mobile web target or a second console may already hold 5173 on a reviewer's machine.
 *
 * `xfwd` adds X-Forwarded-For (and -Host, -Proto, -Port) with the browser's address, as the
 * load balancer does in production. The API ignores it unless it is started with TRUST_PROXY=1,
 * which makes `request.ip`, and so every per-address rate limit and log line, the browser's
 * address rather than the proxy's. Without TRUST_PROXY nothing changes: the API keys on the
 * socket, which is this proxy, exactly as before.
 */
const proxy = {
  '/api': {
    target: process.env['VITE_API_PROXY_TARGET'] ?? 'http://127.0.0.1:3001',
    changeOrigin: true,
    xfwd: true,
  },
}

/**
 * The build stamp on the sign-in page, so a screenshot says which build it came from. CI and the
 * deploy scripts set GIT_SHA; a local build asks git; anything else is "dev".
 */
function buildSha(): string {
  if (process.env['GIT_SHA']) return process.env['GIT_SHA'].slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __BUILD_SHA__: JSON.stringify(buildSha()) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    // Every page behind sign-in is a chunk of its own (`src/shell/pages.ts`), and the chart
    // library travels in the one chunk the charted pages share, so nothing of it loads before a
    // chart is on screen.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        /*
         * Two named vendor chunks, both needed from the first paint. React changes least, so it
         * caches across releases. The icons are one small chunk because pages share them in
         * different combinations, which otherwise makes a scatter of sub-kilobyte chunks.
         *
         * Recharts is deliberately not named here. A manual chunk swallows the dependencies of
         * what it holds unless another manual chunk claims them first, and a "charts" chunk took
         * React DOM and clsx with it, so the entry imported the whole chart library to reach
         * them. Left to Rollup, recharts lands in the shared chunk of the pages that draw charts.
         */
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/node_modules[\\/]lucide-react[\\/]/.test(id)) return 'icons'
          return undefined
        },
      },
    },
  },
  server: { port: 5173, strictPort: false, proxy },
  preview: { port: 4173, strictPort: false, proxy },
})
