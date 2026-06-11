import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'list' : 'html',

  use: {
    baseURL: process.env['BASE_URL'] || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // webServer disabled for local dev — start backend + frontend manually.
  // CI workflow handles server startup via its own steps.
  // webServer: [
  //   {
  //     command: 'cd ../backend && npx ts-node src/index.ts',
  //     port: 3000,
  //     timeout: 15_000,
  //     reuseExistingServer: !process.env['CI'],
  //   },
  //   {
  //     command: 'cd ../frontend && npx ng serve --host 0.0.0.0 --port 4200',
  //     port: 4200,
  //     timeout: 60_000,
  //     reuseExistingServer: !process.env['CI'],
  //   },
  // ],
});
