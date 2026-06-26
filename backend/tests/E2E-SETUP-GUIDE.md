# E2E Testing Guide

> **Comprehensive guide for running end-to-end tests locally and understanding the test harness.**

---

## Quick Start

### Run all E2E tests (Backend + Frontend)

From the repository root:

```bash
cd backend
npm install                    # if not done already
npm run db:reset               # Drop, re-apply schema, regenerate Prisma, seed demo data

cd ..
scripts/bat/e2e-test-local.bat  # Windows: runs both backend + frontend E2E tests
# OR on macOS/Linux/WSL:
bash scripts/sh/lan-dev.sh       # Start dev servers manually, then run tests separately
```

The **scripts/bat/e2e-test-local.bat** script handles:

1. ✅ Docker container startup (Postgres + Redis)
2. ✅ Backend setup (install, db reset, seed)
3. ✅ Backend E2E tests (Jest with RUN_E2E=1)
4. ✅ Frontend dev server startup (ng serve)
5. ✅ Frontend E2E tests (Playwright)

---

## Manual Test Execution

### Backend E2E Tests (Jest)

**Requirements:**

- Postgres running on `localhost:5432` (docker compose up -d)
- Redis running on `localhost:6379` (docker compose up -d)
- Demo data seeded (`npm run db:reset`)
- Backend server running or ready to be imported by Jest (`npm run dev`)

**Run tests:**

```bash
cd backend
RUN_E2E=1 npm run test:e2e    # Unix/macOS/WSL
# OR on Windows:
set RUN_E2E=1 && npm run test:e2e
```

**What it tests:**

- [auth.test.ts](./e2e/auth.test.ts) - Registration, login, token refresh, logout
- [quote-flow.test.ts](./e2e/quote-flow.test.ts) - Full quote → proposal → booking flow
- [cash-confirm.test.ts](./e2e/cash-confirm.test.ts) - Cash payment confirmation
- [admin-actions.test.ts](./e2e/admin-actions.test.ts) - Admin operations

**Test structure:** Each test file calls `createApp()` which imports the Express app and connects to a live database.

---

### Frontend E2E Tests (Playwright)

**Requirements:**

- Frontend dev server running on `http://localhost:4200` (`ng serve`)
- Backend API running on `http://localhost:3000` (`npm run dev`)
- Demo data seeded (`npm run db:reset`)

**Run tests manually:**

```bash
cd frontend
npm install                    # if not done already

# Start the server in one terminal:
ng serve

# In another terminal:
BASE_URL=http://localhost:4200 npm run test:e2e
```

**Interactive mode (recommended for debugging):**

```bash
cd frontend
BASE_URL=http://localhost:4200 npm run test:e2e:ui
```

This opens the Playwright Inspector UI where you can:

- Step through tests
- Click "Pick locator" to inspect elements
- Watch video replays of failures
- View screenshots

**What it tests:**

- [admin-pin.spec.ts](../frontend/e2e/specs/admin-pin.spec.ts) - Admin login + PIN gate
- [customer-browse.spec.ts](../frontend/e2e/specs/customer-browse.spec.ts) - Customer login + navigation
- [guest-quote.spec.ts](../frontend/e2e/specs/guest-quote.spec.ts) - Guest quote submission
- [servicer-jobs.spec.ts](../frontend/e2e/specs/servicer-jobs.spec.ts) - Servicer job management
- [customer-quote.spec.ts](../frontend/e2e/specs/customer-quote.spec.ts) - Customer quote viewing
- [demo-gate-leak.spec.ts](../frontend/e2e/specs/demo-gate-leak.spec.ts) - Demo account login gate
- [readme-screenshots.spec.ts](../frontend/e2e/specs/readme-screenshots.spec.ts) - Screenshot generation

---

## Demo Accounts

All demo accounts have password: **`Demo@2026`**

### Customer

- **Email:** `david.tan@demo.local`
- **Role:** Customer
- **Purpose:** Login flow, browsing services

### Servicer

- **Email:** `ahmad.bin.ismail@demo.local`
- **Role:** Servicer
- **Purpose:** Job management, quotes

### Admin

- **Email:** `admin@demo.local`
- **Password:** `Demo@2026`
- **PIN:** `1234` (for sensitive admin actions)
- **Role:** Admin
- **Purpose:** Dashboard, settings, moderation

Additional demo accounts:

- `customer.fresh@demo.local` - New customer (no history)
- `customer.active@demo.local` - Customer with open quotes
- `customer.loyal@demo.local` - Customer with completed bookings
- `servicer.1@demo.local` through `servicer.105@demo.local` - Service providers

---

## Environment Variables

### Backend (Jest)

Set automatically by `jest.setup.ts`:

- `NODE_ENV=test`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/homeservices`
- `REDIS_URL=redis://localhost:6379`
- `JWT_SECRET=test-jwt-secret-at-least-16-chars`
- `REFRESH_SECRET=test-refresh-secret-at-least-16-chars`
- `APP_URL=http://localhost:4200`

### Frontend (Playwright)

- `BASE_URL` - Frontend base URL (default: `http://localhost:4200`)
  - Set by: `scripts/bat/e2e-test-local.bat` or npm script with `cross-env`

---

## Fixtures and Utilities

### demo-auth.ts

Helper functions for logging in test accounts:

```typescript
import {
  loginAsCustomer,
  loginAsServicer,
  loginAsAdmin,
  logout,
} from "../fixtures/demo-auth";

// In your test:
await loginAsCustomer(page); // Customer login
await loginAsServicer(page); // Servicer login
await loginAsAdmin(page, "admin@demo.local", "Demo@2026", "1234"); // Admin with PIN
await logout(page); // Logout
```

---

## Troubleshooting

### Backend E2E Tests Fail

**Error: `ECONNREFUSED` connecting to Postgres/Redis**

```bash
# Start Docker containers:
docker compose up -d
docker compose ps              # Check they're running

# If containers exist but failed:
docker compose down
docker compose up -d
```

**Error: `query_engine-windows.dll.node` file locked (Windows)**

```bash
# The running backend process holds the DLL lock, preventing Prisma generation
taskkill /F /IM node.exe       # Kill all Node processes
# Then re-run the test
```

**Error: Prisma schema mismatch**

```bash
cd backend
npx prisma generate
npm run db:reset
npm run test:e2e
```

### Frontend E2E Tests Fail

**Error: `Navigation timeout` or `Page not found`**

- Confirm `ng serve` is running on port 4200
- Confirm backend is running on port 3000
- Check that demo data was seeded: `npm run db:reset`

**Error: `Locator not found` or timeout waiting for element**

- Run in interactive mode: `npm run test:e2e:ui`
- Use the "Pick locator" tool to find the correct selector
- Check that the frontend is fully loaded (`page.waitForLoadState('networkidle')`)

**Error: `Demo account not found` or `Login fails`**

- Confirm database was seeded: `npm run db:reset`
- Check that admin PIN is correct (`1234`)
- Verify backend is running and responding

---

## CI/CD Status

**Current status:** E2E tests are **disabled in CI** (as of 2026-06-12).

See: [.github/workflows/ci.yml](.github/workflows/ci.yml) - Search for "E2E: disabled"

To re-enable:

1. Uncomment the `e2e-check` job in `ci.yml`
2. Set up GitHub Pages for Playwright reports
3. Test locally first with `scripts/bat/e2e-test-local.bat`

---

## Writing New E2E Tests

### Backend (Jest)

```typescript
// backend/tests/e2e/my-feature.test.ts
import request from "supertest";
import type { Application } from "express";

const runE2E = process.env.RUN_E2E === "1";
const e2e = runE2E ? describe : describe.skip;

e2e("My feature (end-to-end)", () => {
  let app: Application;

  beforeAll(async () => {
    const { createApp } = await import("../../src/app");
    app = createApp();
  });

  afterAll(async () => {
    const { prisma } = await import("../../src/lib/prisma");
    const { closeRedis } = await import("../../src/lib/redis");
    const { closeQueue } = await import("../../src/lib/queue");
    await Promise.allSettled([
      prisma.$disconnect(),
      closeQueue(),
      closeRedis(),
    ]);
  });

  it("does something important", async () => {
    const res = await request(app)
      .post("/api/v1/my-endpoint")
      .send({ data: "test" });

    expect(res.status).toBe(200);
  });
});
```

### Frontend (Playwright)

```typescript
// frontend/e2e/specs/my-feature.spec.ts
import { test, expect } from "@playwright/test";
import { loginAsCustomer } from "../fixtures/demo-auth";

test.describe("My feature", () => {
  test("customer can do something", async ({ page }) => {
    await loginAsCustomer(page);

    // Navigate to feature
    await page.goto("/customer/my-feature");

    // Interact with page
    await page.click('button:has-text("Action")');

    // Assert
    await expect(page.locator('h1:has-text("Success")')).toBeVisible();
  });
});
```

---

## Performance Notes

- **Backend E2E:** ~30 seconds (full suite)
- **Frontend E2E:** ~40 seconds (full suite, depends on ng serve compile time)
- **Total (with infrastructure startup):** ~3-5 minutes (scripts/bat/e2e-test-local.bat)

---

## Further Reading

- [playwright.config.ts](../frontend/e2e/playwright.config.ts) - Frontend test configuration
- [jest.config.js](./jest.config.js) - Backend test configuration
- [jest.setup.ts](./jest.setup.ts) - Backend test environment setup
- [../docs/ai-context/seed-plan.md](../docs/ai-context/seed-plan.md) - Demo account setup
- [../docs/api-reference/api-doc.md](../docs/api-reference/api-doc.md) - API endpoint reference
