import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: process.env["CI"] ? "list" : "html",

  use: {
    baseURL: process.env["BASE_URL"] || "http://localhost:4200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // ── Server startup notes ──────────────────────────────────────────────────
  // For local development (e2e-test-local.bat):
  //   - Frontend: `ng serve` on port 4200 (started by the bat script)
  //   - Backend:  `npm run dev` (or started by docker compose)
  //   - Playwright: connects to http://localhost:4200 (BASE_URL env var)
  //
  // For CI pipeline:
  //   - Use webServer config below to auto-start both servers
  //   - Uncomment the webServer array if adding CI E2E support
  //
  // For manual testing:
  //   1. cd frontend && ng serve
  //   2. cd backend && npm run dev
  //   3. npx playwright test --config=e2e/playwright.config.ts
  //     (or BASE_URL=http://localhost:4200 npm run test:e2e)
  //
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
