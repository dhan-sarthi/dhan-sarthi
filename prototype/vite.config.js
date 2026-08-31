import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Serve the api/*.js Vercel functions during local dev.
 *
 * In production Vercel routes /api/foo to api/foo.js automatically. Locally there is no such
 * router, so without this the frontend runs on one port and the functions need another —
 * two SSH tunnels and a CORS problem. This keeps everything on the Vite port.
 *
 * Handlers are re-imported per request with a cache-busting query so editing one does not
 * require a server restart.
 */
function vercelApi() {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      const dir = resolve(import.meta.dirname, 'api')
      const routes = readdirSync(dir)
        .filter((f) => f.endsWith('.js'))
        .map((f) => f.replace(/\.js$/, ''))

      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (!path.startsWith('/api/')) return next()

        const name = path.slice(5).replace(/\/+$/, '')
        if (!routes.includes(name)) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js?t=${Date.now()}`)
          await mod.default(req, res)
        } catch (err) {
          server.config.logger.error(`[api] ${name} threw: ${err.stack || err}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Dev handler threw — see server log.' }))
          }
        }
      })

      server.config.logger.info(
        `\n  \x1b[32m➜\x1b[0m  \x1b[1mapi\x1b[0m:     ${routes.map((r) => `/api/${r}`).join('  ')}\n`,
      )
    },
  }
}

export default defineConfig({
  base: './',
  // vercelApi() is deliberately not registered. It served the api/*.js functions during dev
  // before the Fastify backend existed, and it takes precedence over the proxy below — which
  // meant /api/realtime-token was being answered by the shim, reading an OPENAI_API_KEY that
  // only exists in the server's environment, and returning 500. The real backend owns these
  // routes now. The files stay on disk only because the public Vercel demo still serves them.
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // The Fastify backend. Takes precedence over the api/*.js dev shim below, which now
      // only exists so the Vercel deployment of the public demo keeps working.
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
})
