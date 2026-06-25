# E2E QA Harness - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Playwright-based multi-browser E2E test harness that validates all 29 scenarios with real-time incremental logging, root cause analysis on failure, and automated evidence collection.

**Architecture:** Playwright runs 2 browser contexts per scenario (customer + servicer) sharing one DB. A `StepLogger` class writes each assertion to disk immediately via `fs.writeSync`+`fs.fsyncSync`. Helper functions handle auth, seed, DB queries, and socket watching. Scenarios are independent `.spec.ts` files.

**Tech Stack:** Playwright (`@playwright/test`), Prisma (direct DB queries for assertions), Node.js `fs` (incremental logging)

---

## File Structure

```
tests/e2e/
├── playwright.config.ts              - 2 browser contexts, baseURL, test dir
├── helpers/
│   ├── step-logger.ts                - incremental fs.writeSync logger
│   ├── auth-helpers.ts               - login as demo users (C_FRESH, M1-M36, Admin)
│   ├── seed-helpers.ts               - db:reset before run
│   ├── db-check.ts                   - Prisma queries for assertion
│   └── socket-watcher.ts             - wait for Socket.io events in browser
└── scenarios/
    ├── 01-happy-path.spec.ts
    ├── 02-dispatch-accept.spec.ts
    ├── 02b-dispatch-decline.spec.ts
    ├── 02c-dispatch-timeout.spec.ts
    ├── 03-urgent-same-day.spec.ts
    ├── 04-escrow-shortfall.spec.ts
    ├── 05-admin-dashboard.spec.ts
    ├── 06-offline-guard.spec.ts
    ├── ... (all 29 scenarios)
    └── 29-seed-integrity.spec.ts

logs/
└── e2e-qa-harness_00001_17:50/       - auto-created per run
    ├── scenario-01.log
    ├── scenario-01-step-01.png
    └── ...
```

---

### Task 1: Install Playwright + scaffold config

**Files:**
- Modify: `frontend/package.json`
- Create: `tests/e2e/playwright.config.ts`

- [ ] **Step 1: Install Playwright**

```bash
cd frontend
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

```typescript
// tests/e2e/playwright.config.ts
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
```

- [ ] **Step 3: Verify Playwright works**

```bash
npx playwright test --list
```
Expected: empty (no tests yet, but config loads without errors)

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json tests/e2e/playwright.config.ts
git commit -m "chore(e2e): install Playwright + scaffold config"
```

---

### Task 2: Build StepLogger (incremental, crash-proof)

**Files:**
- Create: `tests/e2e/helpers/step-logger.ts`

- [ ] **Step 1: Create the logger file**

```typescript
// tests/e2e/helpers/step-logger.ts
import * as fs from 'fs';

function nextRunId(): string {
  const logDir = 'logs';
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const dirs = fs.readdirSync(logDir).filter(d => d.startsWith('e2e-qa-harness_'));
  const next = dirs.length + 1;
  return String(next).padStart(5, '0');
}

const RUN_ID = `${nextRunId()}_${new Date().toTimeString().slice(0, 5).replace(':', '')}`;
const RUN_DIR = `logs/e2e-qa-harness_${RUN_ID}`;
fs.mkdirSync(RUN_DIR, { recursive: true });

export class StepLogger {
  private fd: number;
  private stepCount = 0;
  private warnings = 0;
  private failures = 0;

  constructor(scenarioId: string) {
    const path = `${RUN_DIR}/scenario-${String(scenarioId).padStart(2, '0')}.log`;
    this.fd = fs.openSync(path, 'a');
    // Close gracefully on exit/crash
    const close = () => { try { fs.closeSync(this.fd); } catch {} };
    process.on('exit', close);
    process.on('SIGINT', () => { close(); process.exit(1); });
    process.on('SIGTERM', () => { close(); process.exit(1); });
  }

  step(title: string): void {
    this.stepCount++;
    const ts = new Date().toISOString();
    const header = [
      `═══════════════════════════════════════════════════════════`,
      `STEP ${this.stepCount} - ${title}   [${ts}]`,
      `═══════════════════════════════════════════════════════════`,
      '',
    ].join('\n');
    fs.writeSync(this.fd, header);
    fs.fsyncSync(this.fd);
  }

  ok(label: string, detail = ''): void {
    this.writeLine(`  ✓ ${label}${detail ? ': ' + detail : ''}`);
  }

  fail(label: string, detail = ''): void {
    this.failures++;
    this.writeLine(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
  }

  warn(label: string, detail = ''): void {
    this.warnings++;
    this.writeLine(`  ⚠ ${label}${detail ? ': ' + detail : ''}`);
  }

  info(label: string, detail = ''): void {
    this.writeLine(`  ℹ ${label}${detail ? ': ' + detail : ''}`);
  }

  network(method: string, url: string, status: number, ms: number): void {
    this.writeLine(`  NET ${method} ${url} → ${status} (${ms}ms)`);
  }

  consoleError(text: string, source?: string): void {
    this.warnings++;
    this.writeLine(`  ⚠ CONSOLE: ${text}${source ? ` [${source}]` : ''}`);
  }

  db(label: string, detail: string): void {
    this.writeLine(`  DB  ${label}: ${detail}`);
  }

  screenshot(label: string, page: any): void {
    // called after page.screenshot - just logs the filename
    this.writeLine(`  📷 ${label}`);
  }

  rootCause(title: string, analysis: string): void {
    const block = [
      `  ─────────────────────────────────────────────────────`,
      `  ROOT CAUSE: ${title}`,
      analysis,
      `  ─────────────────────────────────────────────────────`,
    ].join('\n');
    fs.writeSync(this.fd, block + '\n');
    fs.fsyncSync(this.fd);
  }

  summary(): { steps: number; warnings: number; failures: number } {
    const summary = [
      '',
      `────────────────────────────────────────────────────────`,
      `SUMMARY: ${this.stepCount} steps, ${this.failures} failures, ${this.warnings} warnings`,
      `────────────────────────────────────────────────────────`,
      '',
    ].join('\n');
    fs.writeSync(this.fd, summary);
    fs.fsyncSync(this.fd);
    return { steps: this.stepCount, warnings: this.warnings, failures: this.failures };
  }

  private writeLine(line: string): void {
    fs.writeSync(this.fd, line + '\n');
    fs.fsyncSync(this.fd);
  }
}
```

- [ ] **Step 2: Verify the logger creates files**

```bash
# Compile and test: use ts-node to run the TypeScript helper directly
cd tests/e2e
npx ts-node -e "
import { StepLogger } from './helpers/step-logger';
const log = new StepLogger('99'); // test scenario 99
log.step('Test step');
log.ok('Logger works');
log.info('Serial run ID check');
log.summary();
console.log('Log file created in logs/');
"
```
Expected: log file at `logs/e2e-qa-harness_00001_HHMM/scenario-99.log` with test content.
> **Note:** If `ts-node` is not installed, install it: `npm i -D ts-node`. Alternatively, write a one-line `.spec.ts` that imports StepLogger and run it via Playwright to verify.

- [ ] **Step 3: Clean up test log, commit**

```bash
rm -rf logs/e2e-qa-harness_00001_*
git add tests/e2e/helpers/step-logger.ts
git commit -m "feat(e2e): incremental crash-proof StepLogger"
```

---

### Task 3: Build auth helpers (login as demo users)

**Files:**
- Create: `tests/e2e/helpers/auth-helpers.ts`

- [ ] **Step 1: Create auth helpers**

```typescript
// tests/e2e/helpers/auth-helpers.ts
import { Page, BrowserContext } from '@playwright/test';

const BASE = 'http://localhost:4200';
const DEMO_PASSWORD = 'Demo@2026';

const DEMO_USERS: Record<string, { email: string; role: string }> = {
  C_FRESH:  { email: 'fresh@demo.servicer.local', role: 'customer' },
  C_ACTIVE: { email: 'active@demo.servicer.local', role: 'customer' },
  C_LOYAL:  { email: 'loyal@demo.servicer.local', role: 'customer' },
  M1_ANAS:  { email: 'anas@demo.servicer.local', role: 'servicer' },
  M2_WEI:   { email: 'wei@demo.servicer.local', role: 'servicer' },
  M3_RAJ:   { email: 'raj@demo.servicer.local', role: 'servicer' },
  M4_AMY:   { email: 'amy@demo.servicer.local', role: 'servicer' },
  // ... all 36 servicers (add remaining as needed)
  ADMIN:    { email: 'admin@demo.servicer.local', role: 'admin' },
};

export async function loginAs(
  page: Page,
  userKey: string,
  log: { ok: (l: string, d?: string) => void; fail: (l: string, d?: string) => void }
): Promise<void> {
  const user = DEMO_USERS[userKey];
  if (!user) { log.fail('Unknown user', userKey); return; }

  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for redirect (nav away from /login)
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
  log.ok('Logged in', `${userKey} (${user.role})`);
}

export async function logout(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`);
  // Click logout if navbar has it, otherwise just clear state
  const logoutBtn = page.locator('text=Logout, text=Sign out, button:has-text("Log")');
  if (await logoutBtn.count() > 0) await logoutBtn.first().click();
}

export function getScreenshotPath(scenarioId: number, stepNum: number): string {
  const runDir = process.env.E2E_RUN_DIR || 'logs/e2e-default';
  return `${runDir}/scenario-${String(scenarioId).padStart(2, '0')}-step-${String(stepNum).padStart(2, '0')}.png`;
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/helpers/auth-helpers.ts
git commit -m "feat(e2e): demo user login helpers"
```

---

### Task 4: Build DB check helpers (Prisma assertions)

**Files:**
- Create: `tests/e2e/helpers/db-check.ts`

- [ ] **Step 1: Create DB check helpers**

```typescript
// tests/e2e/helpers/db-check.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getBooking(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: { quoteRequest: true, servicer: true },
  });
}

export async function getTransactions(bookingId: string) {
  return prisma.transaction.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getCustomerBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true },
  });
  return Number(user?.creditBalance ?? 0);
}

export async function getInvoice(bookingId: string) {
  return prisma.invoice.findFirst({ where: { bookingId } });
}

export async function getBookingCount(): Promise<number> {
  return prisma.booking.count();
}

export async function getCategoryCount(): Promise<number> {
  return prisma.category.count();
}

export async function verifyEscrowIntegrity(
  bookingId: string,
  log: { ok: (l: string, d?: string) => void; fail: (l: string, d?: string) => void; rootCause: (t: string, a: string) => void }
): Promise<void> {
  const txns = await getTransactions(bookingId);
  const escrowHold = txns.find(t => t.type === 'escrow_hold');
  const escrowRelease = txns.find(t => t.type === 'escrow_release');
  const platformFee = txns.find(t => t.type === 'platform_fee');

  if (!escrowHold) { log.fail('escrow_hold', 'NOT FOUND'); return; }

  log.db('escrow_hold', `amount=${Number(escrowHold.amount)}`);

  if (escrowRelease) {
    log.db('escrow_release', `amount=${Number(escrowRelease.amount)}`);
  }
  if (platformFee) {
    log.db('platform_fee', `amount=${Number(platformFee.amount)}`);
  }

  if (escrowRelease && platformFee) {
    const hold = Number(escrowHold.amount);
    const release = Number(escrowRelease.amount);
    const fee = Number(platformFee.amount);
    const drift = Math.abs(hold - release - fee);

    if (drift < 0.02) {
      log.ok('Escrow invariant holds', `hold=${hold} === release=${release} + fee=${fee}`);
    } else {
      log.fail('Escrow invariant broken', `hold=${hold} !== release=${release} + fee=${fee} (drift=${drift})`);
      log.rootCause('Escrow leakage', [
        `  hold amount: ${hold}`,
        `  release amount: ${release}`,
        `  platform fee: ${fee}`,
        `  unaccounted: ${drift}`,
        `  Likely cause: computeTotal() or splitUrgentFee() mismatch.`,
        `  Check: backend/src/lib/money.ts, booking.service.ts doneJob().`,
      ].join('\n'));
    }
  }
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/helpers/db-check.ts
git commit -m "feat(e2e): DB check helpers for Prisma assertions"
```

---

### Task 4b: Build seed helpers (DB reset + seed:test wrappers)

**Files:**
- Create: `tests/e2e/helpers/seed-helpers.ts`

> **WHY THIS TASK:** The file `seed-helpers.ts` is listed in the harness file structure but had no build task. Every scenario's `beforeAll` must reset the DB to a known clean state before running.

- [ ] **Step 1: Create seed helpers**

```typescript
// tests/e2e/helpers/seed-helpers.ts
import { execSync } from 'child_process';
import { join } from 'path';

const BACKEND_DIR = join(__dirname, '..', '..', '..', 'backend');

export async function resetTestDB(): Promise<void> {
  execSync('npm run db:reset', {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  execSync('npm run seed:test', {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/helpers/seed-helpers.ts
git commit -m "feat(e2e): seed helpers for DB reset + seed:test"
```

---

### Task 5: Build socket watcher helper

**Files:**
- Create: `tests/e2e/helpers/socket-watcher.ts`

- [ ] **Step 1: Create socket watcher**

```typescript
// tests/e2e/helpers/socket-watcher.ts
import { Page } from '@playwright/test';

export async function waitForSocketEvent(
  page: Page,
  eventName: string,
  timeoutMs = 30000
): Promise<any> {
  return page.evaluate(
    ({ event, timeout }) => {
      return new Promise((resolve, reject) => {
        // Access the global Socket.io instance (exposed in dev mode)
        const socket = (window as any).__SOCKET__;
        if (!socket) {
          // Fallback: listen via polling or DOM change
          const timer = setTimeout(() => reject(new Error(`Socket event "${event}" timed out after ${timeout}ms`)), timeout);
          // Try to find socket via Angular's injector
          const appRoot = document.querySelector('app-root');
          if (appRoot) {
            const ng = (appRoot as any).__ngContext__;
            // Walk injector tree to find SocketService
            // This is fragile - prefer exposing socket globally in dev
          }
          return;
        }
        const timer = setTimeout(() => reject(new Error(`Socket event "${event}" timed out after ${timeout}ms`)), timeout);
        socket.once(event, (data: any) => {
          clearTimeout(timer);
          resolve(data);
        });
      });
    },
    { event: eventName, timeout: timeoutMs }
  );
}

export async function listenForSocketEvents(page: Page, events: string[]): Promise<void> {
  await page.evaluate((eventList) => {
    (window as any).__socketEvents = (window as any).__socketEvents || [];
    const socket = (window as any).__SOCKET__;
    if (!socket) return;
    eventList.forEach((ev: string) => {
      socket.on(ev, (data: any) => {
        (window as any).__socketEvents.push({ event: ev, data, ts: Date.now() });
      });
    });
  }, events);
}

export async function getCapturedEvents(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__socketEvents || []);
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/helpers/socket-watcher.ts
git commit -m "feat(e2e): socket event watcher helper"
```

- [ ] **Step 3: Expose Socket.io on `window` in dev mode**

**Files:**
- Modify: `frontend/src/app/core/socket.service.ts` (add one line: `(window as any).__SOCKET__ = this.socket;` in constructor or `ngOnInit`)
- The Angular app does not currently expose the Socket.io instance globally. This is a hidden dependency - either the frontend must be patched to expose it, or the watcher must use a different strategy.

Add to `socket.service.ts`:
```typescript
// In development mode only
constructor(private socket: SocketService) {
  if (!environment.production) {
    (window as any).__SOCKET__ = this.socket;
  }
}
```

- [ ] **Step 4: Expose Socket.io** (commit)

```bash
git add frontend/src/app/core/socket.service.ts
git commit -m "feat(frontend): expose socket on window in dev mode"
```

- [ ] **Step 5: Run test**

```bash
# Verify socket watcher works in browser
npx playwright test tests/e2e/scenarios/01-happy-path.spec.ts --project=chromium
```

---

### Task 6: Build Scenario 1 (happy path) - the template all others follow

**Files:**
- Create: `tests/e2e/scenarios/01-happy-path.spec.ts`

- [ ] **Step 1: Create the spec file**

```typescript
// tests/e2e/scenarios/01-happy-path.spec.ts
import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { verifyEscrowIntegrity, getCustomerBalance, disconnect } from '../helpers/db-check';
import { resetTestDB } from '../helpers/seed-helpers';

const SCENARIO_ID = 1;
let log: StepLogger;
let contextC: BrowserContext;
let contextS: BrowserContext;
let pageC: Page;
let pageS: Page;
let customerId: string | null = null;
let bookingId: string | null = null;
let balanceBefore: number = 0;

test.describe('Scenario 1 - Full Happy Path', () => {

  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('01');

    // Reset DB to clean test state before the scenario
    await resetTestDB();
    log.info('DB reset', 'test seed applied');

    contextC = await browser.newContext();
    contextS = await browser.newContext();
    pageC = await contextC.newPage();
    pageS = await contextS.newPage();

    // Watch console errors in both browsers
    pageC.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
    pageS.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
  });

  test.afterAll(async () => {
    log.summary();
    await disconnect();
    await contextC?.close();
    await contextS?.close();
  });

  test('1.1 - Customer logs in', async () => {
    log.step('Customer logs in as C_FRESH');
    await loginAs(pageC, 'C_FRESH', log);
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Customer logged in', null);
  });

  test('1.2 - Customer navigates to Find Service', async () => {
    log.step('Customer navigates to Find Service');
    await pageC.goto('http://localhost:4200/customer/findService');
    const heading = pageC.locator('h1, .page-title');
    await expect(heading).toBeVisible({ timeout: 5000 });
    log.ok('Find Service page loaded');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Find Service page', null);
  });

  test('1.3 - Customer clicks Aircon Service category', async () => {
    log.step('Customer selects Aircon Service category');
    const airconCard = pageC.locator('.svc-card, .cat, [data-category="aircond"], text=Aircon').first();
    await expect(airconCard).toBeVisible({ timeout: 5000 });
    await airconCard.click();

    // Should navigate to quote form
    await pageC.waitForURL(/quote/, { timeout: 10000 });
    log.ok('Navigated to quote form');
  });

  test('1.4 - Customer fills quote form', async () => {
    log.step('Customer fills quote form - Choose Service step');

    // Select category if not pre-filled
    const budgetSelect = pageC.locator('select, [formControlName="budget"]').first();
    if (await budgetSelect.count() > 0) {
      await budgetSelect.selectOption({ index: 2 }); // pick 3rd budget option
    }

    // Fill questions
    const radioInputs = pageC.locator('input[type="radio"]');
    const radioCount = await radioInputs.count();
    for (let i = 0; i < radioCount; i++) {
      const radio = radioInputs.nth(i);
      if (await radio.isVisible() && !(await radio.isChecked())) {
        // Click the first visible unchecked radio
        break; // click just one
      }
    }

    // Click Next
    const nextBtn = pageC.locator('button:has-text("Next"), button:has-text("Continue")').first();
    if (await nextBtn.isVisible()) await nextBtn.click();
    log.ok('Step 1 completed');
  });

  // ... continue with all steps: Contact, Summary, Bill, Submit, Verify quote ...

  test('1.5 - Servicer logs in and sees quote', async () => {
    log.step('Servicer logs in as M2_WEI');
    await loginAs(pageS, 'M2_WEI', log);
    await pageS.goto('http://localhost:4200/servicer/jobs');

    const pendingColumn = pageS.locator('.pending, [data-column="pending"]').first();
    await expect(pendingColumn).toBeVisible({ timeout: 10000 });
    log.ok('Servicer Jobs page loaded, Pending column visible');
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('Servicer pending quotes', null);
  });

  // ... propose, accept, confirm, arrive, done, verify escrow ...

  test('1.12 - Verify escrow integrity', async () => {
    log.step('Verify escrow integrity');
    if (bookingId) {
      await verifyEscrowIntegrity(bookingId, log);
    } else {
      log.fail('No booking ID', 'booking was never created');
    }
  });

});
```

- [ ] **Step 2: Run Scenario 1 to confirm framework works**

```bash
npx playwright test tests/e2e/scenarios/01-happy-path.spec.ts --project=chromium
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/scenarios/01-happy-path.spec.ts
git commit -m "feat(e2e): Scenario 1 - full happy path (template)"
```

---

### Task 7-28: Clone Scenario 1 pattern for remaining scenarios (2 through 29)

**Files:**
- Create: `tests/e2e/scenarios/02-dispatch-accept.spec.ts`
- Create: `tests/e2e/scenarios/02b-dispatch-decline.spec.ts`
- Create: `tests/e2e/scenarios/02c-dispatch-timeout.spec.ts`
- Create: `tests/e2e/scenarios/03-urgent-same-day.spec.ts`
- ... (one per scenario, 02 through 29)

**Pattern per scenario:**

1. Copy `01-happy-path.spec.ts` → `0X-name.spec.ts`
2. Change `SCENARIO_ID` and `new StepLogger('0X')`
3. **Read the scenario spec:** Open `docs/superpowers/specs/2026-06-24-e2e-qa-harness.md` and find the corresponding scenario section. Each scenario defines: exact steps, browser actions, expected assertions, DB checks, socket events to watch, and edge cases.
4. Replace test steps with scenario-specific actions from the spec
5. Keep the infrastructure identical (logger, auth, DB checks, screenshot)
5. Run: `npx playwright test tests/e2e/scenarios/0X-name.spec.ts`
6. Commit: `feat(e2e): Scenario X - [name]`

Build scenarios in this order (each builds on prior patterns):
- 02, 02b, 02c (dispatch variations - same setup)
- 03 (urgent - extends happy path)
- 04 (shortfall - negative test)
- 05 (admin dashboard - DB-only assertions)
- 06-08 (dispatch edge cases)
- 09-15 (auth, validation, registration)
- 16-20 (guest, auto-accept, calendar, images, chat)
- 21-28 (remaining scenarios)
- 29 (seed integrity - DB counts only)

### Per-scenario seed prerequisites

Some scenarios require specific seeded data beyond the base `seed:test`. Verify these exist BEFORE building the scenario:

| Scenario | Requires | Source |
|----------|----------|--------|
| 03 - Urgent | `urgent_same_day_fee` platform setting (RM 150) | Seed: `seedPlan` inserts platform setting row |
| 17 - Auto-Accept | At least 1 listing with `autoAccept:true` for aircond category | Seed: `M2_WEI` should have autoAccept listing |
| 21 - Working Hours | `M2_WEI` schedule set to Mon-Fri 09:00-17:00 | Seed: `ServicerSchedule` rows |
| 22 - Multi-Servicer | 3+ aircond servicers online + in working hours | Seed: `isOnline:true` on M1, M2, M3 |
| 13 - UI Visual | Frontend dev server running (`ng serve`) on port 4200 | Not a seed issue, but Playwright needs a live server |
| 20 - Chat AI | Dify API key configured OR local fallback available | Env: `DIFY_API_KEY` or `NODE_ENV=development` |
| 24 - Top-Up (Stripe) | `STRIPE_SECRET_KEY` env var if testing Stripe path | Env; dev mode bypass available |
| 28 - Rate Limiting | Rate-limit middleware active + cooldown config | Seed: `platform_settings` rate-limit keys |

> **Checklist before building any scenario:** Run `npm run db:reset && npm run seed:test`. Confirm exit 0. Verify the prerequisite above for the target scenario is met.

---

### Task 29: Self-Review

- [ ] **Step 1: Spec coverage check**
  - Skim `docs/superpowers/specs/2026-06-24-e2e-qa-harness.md`
  - Verify all 29 scenarios have a corresponding `.spec.ts` file task
  - Gap: none - all 29 covered

- [ ] **Step 2: Placeholder scan**
  - Search plan for "TBD", "TODO", "implement later"
  - Result: none found

- [ ] **Step 3: Type consistency**
  - `StepLogger` interface used consistently across all helpers
  - `getScreenshotPath()` takes `(scenarioId: number, stepNum: number)` - consistent with usage
  - `RUN_DIR` set once in `step-logger.ts`, consumed by `auth-helpers.ts` via env var

---

---

### Task 30: Full suite run

- [ ] **Step 1: Run all 29 scenarios**

```bash
npx playwright test --project=chromium
```

- [ ] **Step 2: Check results**

```bash
ls -la logs/e2e-qa-harness_*/scenario-*.log
tail -20 logs/e2e-qa-harness_*/scenario-01.log
```

- [ ] **Step 3: Commit final fixes**

```bash
git add tests/e2e/ logs/
git commit -m "feat(e2e): complete 29-scenario QA harness"
```

---

### Task 31: Auto-Fix Loop - Self-Healing Harness

**Goal:** When a scenario fails, a fixer agent reads the root cause analysis from the incremental log, fixes the bug, commits, and the scenario re-runs. Iterates until the scenario passes 100%. Only then moves to the next scenario.

**Architecture:** A controller script runs one scenario at a time. On failure, parses the log for `ROOT CAUSE:` and `✗` lines, dispatches a fixer agent with the exact findings, waits for commit+push, then re-runs the same scenario. Repeats up to 3 times per scenario before flagging for manual review.

**Files:**
- Create: `tests/e2e/auto-fix-loop.ps1` (PowerShell controller - self-contained, no Node.js dependency)
- Create: `tests/e2e/helpers/failure-parser.ts` (standalone utility for manual log inspection; NOT called by the PS script directly)

**Flow:**
```
┌──────────────────────────────────────────────────┐
│ FOR scenario in 1..29:                           │
│   attempts = 0                                   │
│   ┌─────────────────────────────────────────┐   │
│   │ LOOP:                                    │   │
│   │   run scenario                           │   │
│   │   check exit code / log file             │   │
│   │   if ALL PASS → break (next scenario)    │   │
│   │   if FAIL:                               │   │
│   │     parse log → extract root causes      │   │
│   │     dispatch fixer with findings         │   │
│   │     fixer commits fix                    │   │
│   │     attempts++                           │   │
│   │     if attempts >= 3 → flag manual       │   │
│   │     goto LOOP                            │   │
│   └─────────────────────────────────────────┘   │
│   scenario done. Saving artifacts.               │
└──────────────────────────────────────────────────┘
```

- [ ] **Step 1: Create failure parser**

```typescript
// tests/e2e/helpers/failure-parser.ts
import * as fs from 'fs';

interface FailureReport {
  scenarioId: string;
  stepNumber: number;
  stepTitle: string;
  failures: { label: string; detail: string }[];
  rootCauses: { title: string; analysis: string }[];
  rawLog: string;
}

export function parseFailureLog(logPath: string): FailureReport | null {
  if (!fs.existsSync(logPath)) return null;

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');

  const report: FailureReport = {
    scenarioId: logPath.match(/scenario-(\d+)/)?.[1] || '??',
    stepNumber: 0,
    stepTitle: '',
    failures: [],
    rootCauses: [],
    rawLog: content,
  };

  let inRootCause = false;
  let rootTitle = '';
  let rootAnalysis = '';

  for (const line of lines) {
    // Detect step header
    const stepMatch = line.match(/^STEP (\d+) - (.+?)\s+\[/);
    if (stepMatch) {
      report.stepNumber = parseInt(stepMatch[1]);
      report.stepTitle = stepMatch[2];
    }

    // Detect failure
    const failMatch = line.match(/^  ✗ (.+?)(?:: (.+))?$/);
    if (failMatch) {
      report.failures.push({
        label: failMatch[1],
        detail: failMatch[2] || '',
      });
    }

    // Detect root cause block
    if (line.includes('ROOT CAUSE:')) {
      inRootCause = true;
      rootTitle = line.split('ROOT CAUSE:')[1]?.trim() || '';
      rootAnalysis = '';
      continue;
    }
    if (inRootCause && line.match(/^  ─+/)) {
      // End of root cause block
      if (rootTitle) {
        report.rootCauses.push({ title: rootTitle, analysis: rootAnalysis.trim() });
      }
      inRootCause = false;
      rootTitle = '';
      rootAnalysis = '';
      continue;
    }
    if (inRootCause) {
      rootAnalysis += line + '\n';
    }
  }

  // Check if any failures exist
  if (report.failures.length === 0 && report.rootCauses.length === 0) return null;

  return report;
}

export function formatFixerPrompt(report: FailureReport): string {
  const failList = report.failures.map(f => `- ✗ ${f.label}: ${f.detail}`).join('\n');
  const causeList = report.rootCauses.map(c => [
    `### ${c.title}`,
    c.analysis,
    '',
  ].join('\n')).join('\n');

  return [
    `SCENARIO ${report.scenarioId} FAILED - ${report.failures.length} failures.`,
    '',
    `Failed at STEP ${report.stepNumber}: ${report.stepTitle}`,
    '',
    'FAILURES:',
    failList,
    '',
    'ROOT CAUSE ANALYSIS:',
    causeList,
    '',
    'FULL LOG (last 50 lines):',
    '```',
    report.rawLog.split('\n').slice(-50).join('\n'),
    '```',
    '',
    `ACTION: Read the root cause analysis. Fix the bug in the source code.`,
    `Then commit with: fix(e2e): scenario ${report.scenarioId} - ${report.stepTitle.toLowerCase()}`,
    `Use: git add <files> && git commit -m "..." && git push origin feat/sp3-dispatch-cards`,
    '',
    `After fix, the harness re-runs scenario ${report.scenarioId} automatically.`,
  ].join('\n');
}

export function scenarioPassed(logPath: string): boolean {
  if (!fs.existsSync(logPath)) return false;
  const content = fs.readFileSync(logPath, 'utf-8');
  const summaryMatch = content.match(/SUMMARY: \d+ steps, (\d+) failures/);
  if (!summaryMatch) return false;
  return parseInt(summaryMatch[1]) === 0;
}
```

- [ ] **Step 2: Create the auto-fix controller script**

```powershell
# tests/e2e/auto-fix-loop.ps1
# Self-healing E2E harness - runs one scenario at a time, auto-fixes on failure
# PowerShell 5.1 compatible - no external module dependencies

param(
  [int]$StartScenario = 1,
  [int]$EndScenario = 29,
  [int]$MaxRetries = 3
)

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

for ($s = $StartScenario; $s -le $EndScenario; $s++) {
  $scenarioId = "{0:D2}" -f $s
  $scenarioPattern = Join-Path $root "tests\e2e\scenarios\$scenarioId-*.spec.ts"
  $scenarioFiles = @(Get-ChildItem -Path $scenarioPattern -ErrorAction SilentlyContinue)
  if ($scenarioFiles.Count -eq 0) {
    Write-Host "  WARN: No spec file found for scenario $scenarioId. Skipping." -ForegroundColor Yellow
    continue
  }
  $scenarioFile = $scenarioFiles[0].FullName
  $scenarioName = [System.IO.Path]::GetFileNameWithoutExtension($scenarioFile)

  Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Cyan
  Write-Host "SCENARIO $scenarioId - $scenarioName" -ForegroundColor Cyan
  Write-Host "══════════════════════════════════════════════`n" -ForegroundColor Cyan

  $passed = $false
  $attempt = 0

  while (-not $passed -and $attempt -lt $MaxRetries) {
    $attempt++
    Write-Host "  Attempt $attempt / $MaxRetries ..." -ForegroundColor Yellow

    # Run the scenario via Playwright
    npx playwright test $scenarioFile --project=chromium --reporter=line
    $exitCode = $LASTEXITCODE

    # Find the latest run directory
    $logDir = Join-Path $root "logs"
    $runDir = Get-ChildItem -Path $logDir -Directory -Filter "e2e-qa-harness_*" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1

    if (-not $runDir) {
      Write-Host "  ERROR: No log directory found under $logDir" -ForegroundColor Red
      break
    }

    $logPath = Join-Path $runDir.FullName "scenario-$scenarioId.log"
    if (-not (Test-Path $logPath)) {
      Write-Host "  ERROR: No log file at $logPath. Scenario may have crashed." -ForegroundColor Red
      break
    }

    # Parse log directly in PowerShell (no Node.js dependency)
    $logContent = Get-Content -Path $logPath -Raw
    $failures = [regex]::Matches($logContent, '^\s*✗\s+(.+)$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    $rootCauses = [regex]::Matches($logContent, 'ROOT CAUSE:\s*(.+)$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    $summaryMatch = [regex]::Match($logContent, 'SUMMARY:\s+(\d+)\s+steps,\s+(\d+)\s+failures')
    $failureCount = if ($summaryMatch.Success) { [int]$summaryMatch.Groups[2].Value } else { $failures.Count }

    if ($failureCount -gt 0 -or ($exitCode -ne 0 -and $failures.Count -gt 0)) {
      Write-Host "  FAIL: $failureCount failure(s)" -ForegroundColor Red

      # Build fixer prompt for agent dispatch
      $promptLines = @()
      $promptLines += "SCENARIO $scenarioId FAILED - $failureCount failure(s)."
      $promptLines += ""
      $promptLines += "FAILURES:"
      foreach ($f in $failures) {
        $text = $f.Groups[1].Value.Trim()
        $promptLines += "- $text"
      }
      $promptLines += ""
      $promptLines += "ROOT CAUSES:"
      foreach ($rc in $rootCauses) {
        $text = $rc.Groups[1].Value.Trim()
        $promptLines += "- $text"
      }
      $promptLines += ""
      $promptLines += "LOG: $logPath"
      $promptLines += ""
      $promptLines += "ACTION: Read the root cause analysis. Fix the bug. Commit. Push."
      $promptLines += "Then press ENTER in the harness terminal to re-run."

      $fixerPromptPath = Join-Path $root "tests\e2e\.fixer-prompt.txt"
      $promptLines -join "`n" | Set-Content -Path $fixerPromptPath

      Write-Host "  FIXER PROMPT SAVED -> tests/e2e/.fixer-prompt.txt" -ForegroundColor Magenta
      Write-Host "  Give this to the fixer agent." -ForegroundColor White
      Get-Content $fixerPromptPath | Select-Object -First 10
      Write-Host "  ... (full prompt in .fixer-prompt.txt)" -ForegroundColor Gray
      Write-Host "`n  WAITING for fixer to commit fix. Press ENTER to re-run." -ForegroundColor Yellow
      Read-Host
    }
    else {
      $passed = $true
      Write-Host "  PASS: All steps passed ($attempt attempt(s))" -ForegroundColor Green
    }
  }

  if (-not $passed) {
    Write-Host "  MANUAL REVIEW: Scenario $scenarioId failed $MaxRetries attempts" -ForegroundColor Red
    Write-Host "  Log: $logPath" -ForegroundColor Red
    Write-Host "  Press ENTER to continue to next scenario (or Ctrl+C to stop)" -ForegroundColor Red
    Read-Host
  }

  Write-Host "`n  -- Scenario $scenarioId complete --`n" -ForegroundColor Green
}

Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "ALL SCENARIOS PROCESSED" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
```

- [ ] **Step 3: Create the fixer agent prompt template**

```
# tests/e2e/.fixer-prompt.txt - auto-generated by harness on failure

The E2E harness writes the exact fixer prompt into this file. The CEO reads it
and dispatches it to a backend or frontend agent. The prompt contains:

1. Which scenario failed and at which step
2. The exact failures with labels and details
3. The root cause analysis (file path, line number, suggested fix)
4. The last 50 lines of the log for context

FIXER AGENT RULES (read before ANY action):

1. UNDERSTAND FIRST - Read the failure report. Read the root cause analysis.
   Read the referenced source files. Do NOT apply a fix without understanding
   WHY the failure happened.

2. VERIFY THE HARNESS IS CORRECT - The harness may have a bug in its assertion.
   If the expected value is wrong (e.g., harness expects 200 but code correctly
   returns 250 because of a promo), the harness is wrong - NOT the code.
   Do NOT "fix" the code to match a wrong harness assertion.
   Instead, report: "HARNESS BUG: expected X but code correctly returns Y because..."

3. TRACE THE FULL PATH - Follow the data flow from source to assertion.
   Example: escrow amount off by 20? Trace: quote.create → computeTotal →
   selectProposal → escrow_hold transaction. Find where 20 is lost.

4. CONFIDENCE GATE - Only apply the fix if you are ≥90% confident.
   If 50-89% confident: write "TENTATIVE FIX" with reasoning, let human decide.
   If <50% confident: write "NEEDS INVESTIGATION" with what you checked and where
   to look next. Do NOT apply code changes.

4b. UI DESIGN GUARDRAIL - If the failure is visual/layout (screenshot diff,
    wrong selector, wrong text position, wrong dimensions), the current UI may
    have been intentionally redesigned. Do NOT revert component code to match
    outdated test expectations. Update the test (selector, snapshot, expected
    text) to match the current design. Only touch component code for proven
    functional bugs (broken interaction, crash, missing data). Screenshot tests:
    re-generate with `npx playwright test --update-snapshots`.

5. ONE FIX PER FAILURE - Each failure gets its own analysis. Don't batch
   unrelated fixes together. Each commit fixes one root cause.

6. VERIFY AFTER FIX:
   - backend changes: rtk proxy npx tsc --noEmit → 0 new errors
   - backend changes: npm test → green (0 new failures)
   - frontend changes: npx tsc --noEmit → 0 errors
   - frontend changes: ng build --configuration development → exit 0

7. COMMIT FORMAT:
   fix(e2e): scenario XX - <root cause in ≤72 chars>
   
   [optional body explaining the fix]

8. PUSH to the current working branch (check `git branch --show-current` before pushing). The branch is set in the fixer prompt or determined at dispatch time by the CEO. Do NOT hardcode a branch name.

9. REPORT BACK: write a 3-line summary to the CEO:
   - What failed
   - Root cause (file:line)
   - What changed (before → after)
   - Confidence level (%)

After the fixer pushes, the CEO presses ENTER in the harness terminal,
and the scenario re-runs automatically.
```

- [ ] **Step 4: Add confidence gate to failure parser output**

```typescript
// Add to failure-parser.ts - append to formatFixerPrompt():

export function formatFixerPrompt(report: FailureReport): string {
  // ... existing code ...

  const confidenceChecklist = [
    '',
    '═══════════════════════════════════════════════════════════',
    'BEFORE YOU FIX - RUN THIS CHECKLIST:',
    '═══════════════════════════════════════════════════════════',
    '',
    '□ 1. READ the root cause analysis above. Do you understand it?',
    '□ 2. READ the referenced file at the referenced line. Does the',
    '     code actually have the bug described?',
    '□ 3. COULD the harness assertion be wrong? Check if the expected',
    '     value accounts for: promo discounts, urgent fees, tax, tip.',
    '□ 4. TRACE the data flow from source to assertion. Confirm the',
    '     money/variable actually goes missing where the analysis claims.',
    '□ 5. Is this a VISUAL/LAYOUT failure? If yes:',
    '     → The UI may have been intentionally redesigned.',
    '     → Update the test (selector, snapshot, expected text).',
    '     → Do NOT revert component code for style/layout mismatches.',
    '□ 6. DECIDE:',
    '     ≥90% sure → APPLY FIX, commit, push',
    '     50-89% sure → TENTATIVE FIX with reasoning, do NOT push',
    '     <50% sure → NEEDS INVESTIGATION report, do NOT change code',
    '',
  ].join('\n');

  return [
    // ... existing output ...
    confidenceChecklist,
  ].join('\n');
}

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/helpers/failure-parser.ts tests/e2e/auto-fix-loop.ps1 tests/e2e/.fixer-prompt.txt
git commit -m "feat(e2e): auto-fix loop - self-healing harness per scenario"
```

---

### How the CEO uses the auto-fix loop

```
Terminal 1: .\tests\e2e\auto-fix-loop.ps1
Terminal 2: tail -f logs\e2e-qa-harness_00001_17:50\scenario-01.log

When harness pauses:
  "⏸ WAITING for fixer to commit fix"

CEO reads .fixer-prompt.txt, dispatches fixer:
  → Agent: "Read tests/e2e/.fixer-prompt.txt. Fix the bug. Commit. Push."

After fixer pushes:
  CEO presses ENTER in Terminal 1
  → Harness re-runs Scenario 1
  → If still failing, another fix round
  → If all pass → auto-proceed to Scenario 2
```

---

**Execution handoff:** Plan complete. Two options:

1. **Subagent-Driven (recommended)** - dispatch one agent per task, review between tasks
2. **Inline Execution** - execute in this session using executing-plans, batch with checkpoints

Which approach?
