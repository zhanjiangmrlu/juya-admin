import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['c02-content.spec.ts', 'content-editing.spec.ts'],
  outputDir: '../test-results/c02',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:18273',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 18273 --strictPort',
    url: 'http://127.0.0.1:18273/login',
    reuseExistingServer: false,
    timeout: 60_000
  },
  projects: [
    {
      name: 'c02-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
    }
  ]
})
