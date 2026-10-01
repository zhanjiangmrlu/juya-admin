import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'o03-operations.spec.ts',
    'users.spec.ts',
    'feedback.spec.ts',
    'feedback-loop.spec.ts',
    'entitlements.spec.ts'
  ],
  outputDir: '../test-results/o03',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:18373',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 18373 --strictPort',
    url: 'http://127.0.0.1:18373/login',
    reuseExistingServer: false,
    timeout: 60_000
  },
  projects: [
    {
      name: 'o03-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
    }
  ]
})
