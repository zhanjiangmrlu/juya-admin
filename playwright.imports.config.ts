import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: process.env.JUYA_E2E_CORE_FLOW ? 'content-loop.spec.ts' : 'multi-zip-import.spec.ts',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    screenshot: 'only-on-failure',
    channel: process.env.JUYA_E2E_BROWSER_CHANNEL || undefined
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178/login',
    reuseExistingServer: false,
    env: { VITE_API_BASE_URL: '', VITE_DEV_API_PROXY_TARGET: 'http://127.0.0.1:18185' }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }
    }
  ]
})
