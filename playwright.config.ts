import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @mergecom/web dev --host 127.0.0.1',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: 'http://localhost:5173',
    },
    {
      command: 'node scripts/serve-marketing-release.mjs',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: 'http://localhost:4173',
    },
  ],
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet-chromium',
      use: { ...devices['iPad Pro 11'], browserName: 'chromium' },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
