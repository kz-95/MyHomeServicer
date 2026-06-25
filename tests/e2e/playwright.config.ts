import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scenarios',
  timeout: 120_000,
  retries: 0,
  workers: 1, // serial - shared DB
  use: {
    baseURL: 'http://localhost:4200',
    headless: true,
    screenshot: 'on',
    video: 'on',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: { args: ['--no-sandbox'] },
      },
    },
  ],
});
