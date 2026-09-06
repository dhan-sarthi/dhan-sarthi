import { defineConfig } from '@playwright/test'

/** Isolated synthetic API: browser checks never touch the shared database or a paid avatar. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      name: 'Synthetic API',
      command: 'node --experimental-strip-types src/index.ts',
      cwd: '../api',
      env: {
        PORT: '3101',
        HOST: '127.0.0.1',
        BANK_SOURCE: 'memory',
        AVATAR_PROVIDER: 'none',
        AVATAR_ENABLED: 'false',
        NODE_ENV: 'test',
      },
      url: 'http://127.0.0.1:3101/api/v1/customers',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      name: 'Browser app',
      // A dedicated production build cannot hot-reload during a concurrent workspace build.
      command:
        'node node_modules/vite/bin/vite.js build --outDir node_modules/.cache/dhan-e2e-web && ' +
        'node node_modules/vite/bin/vite.js preview --outDir node_modules/.cache/dhan-e2e-web --host 127.0.0.1 --port 5174 --strictPort',
      env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:3101' },
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
})
