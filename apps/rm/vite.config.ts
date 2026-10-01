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
 */
const proxy = {
  '/api': {
    target: process.env['VITE_API_PROXY_TARGET'] ?? 'http://127.0.0.1:3001',
    changeOrigin: true,
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
    // One app chunk plus the chart library on its own: charts change least and weigh most, so a
    // page change does not make every RM download them again. Route-level splitting can come
    // with the pages; a ~700 kB internal console on a desk connection is not worth a warning.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return /node_modules[\\/].*(recharts|victory-vendor|d3-)/.test(id) ? 'charts' : undefined
        },
      },
    },
  },
  server: { port: 5173, strictPort: false, proxy },
  preview: { port: 4173, strictPort: false, proxy },
})
