import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off', screenshot: 'only-on-failure' },
  webServer: {
    command: 'pnpm dev --port 4173',
    url: 'http://127.0.0.1:4173/login',
    reuseExistingServer: true,
    timeout: 30000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }
    }
  ]
})
