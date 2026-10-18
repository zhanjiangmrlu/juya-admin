import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch:
    process.env.JUYA_ADMIN_VERIFY_FLOW === 'refresh'
      ? 'admin-action-refresh.spec.ts'
      : process.env.JUYA_ADMIN_VERIFY_FLOW === 'all'
        ? ['admin-operations.spec.ts', 'content-loop.spec.ts', 'multi-zip-import.spec.ts']
        : process.env.JUYA_ADMIN_VERIFY_FLOW === 'core'
          ? 'content-loop.spec.ts'
          : process.env.JUYA_ADMIN_VERIFY_FLOW === 'imports'
            ? 'multi-zip-import.spec.ts'
            : 'admin-operations.spec.ts',
  workers: 1,
  timeout: 90000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4188',
    channel: process.env.JUYA_E2E_BROWSER_CHANNEL || 'chrome',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4188 --strictPort',
    url: 'http://127.0.0.1:4188/login',
    reuseExistingServer: false,
    env: { VITE_API_BASE_URL: '', VITE_DEV_API_PROXY_TARGET: 'http://127.0.0.1:18188' }
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }
    }
  ]
})
