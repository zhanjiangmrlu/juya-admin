import { defineConfig, devices } from '@playwright/test'

const deployedUrl = process.env.JUYA_PRODUCTION_TEST_URL

export default defineConfig({
  expect: { timeout: 10_000 },
  outputDir: './.impeccable/review/production-tests',
  reporter: [['list']],
  retries: 0,
  testDir: './tests',
  testMatch: deployedUrl
    ? ['production/**/*.spec.ts']
    : ['production/**/*.spec.ts', 'e2e/auth.spec.ts'],
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: deployedUrl ?? 'http://127.0.0.1:4174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: deployedUrl
    ? undefined
    : {
        command: 'pnpm preview --host 127.0.0.1 --port 4174 --strictPort',
        reuseExistingServer: false,
        timeout: 30_000,
        url: 'http://127.0.0.1:4174/login'
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { height: 800, width: 1280 } }
    }
  ]
})
