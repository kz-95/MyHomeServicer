# CI Pipeline Design — MyServicer

> **Status:** Design approved — 2026-06-10
> **Replaces:** `.github/workflows/security.yml` (folded into pipeline), `ci.yml` (refactored)

---

## 1. Pipeline Architecture

Three workflows, each triggered by a specific event. Security scan is folded into PR gate and nightly — no standalone `security.yml`.

```
push (any branch) ──► push-checks.yml      lint, build, unit, WhatsApp       ~3 min
PR to master      ──► pr-gate.yml          lint, build, unit, API E2E,       ~10 min
                                            browser E2E, secret scan,
                                            npm audit, WhatsApp
nightly (2am MYT) ──► nightly.yml          API E2E, secret scan,             ~6 min
                                            npm audit, WhatsApp
manual             ──► (none yet)           Available via workflow_dispatch
                                            for ad-hoc debugging
```

### 1.1 `push-checks.yml`

| Field | Value |
|-------|-------|
| Trigger | `on: push` (all branches) |
| Timeout | 10 min |
| Jobs | backend (lint + build + unit tests), frontend (build), notify (WhatsApp) |

### 1.2 `pr-gate.yml`

| Field | Value |
|-------|-------|
| Trigger | `on: pull_request` targeting `master` |
| Timeout | 15 min |
| Jobs | backend (lint + build + unit), backend-e2e (API E2E via supertest), browser-e2e (Playwright, 3-5 scenarios), secret-scan (gitleaks + trufflehog), npm-audit, notify (WhatsApp) |

### 1.3 `nightly.yml`

| Field | Value |
|-------|-------|
| Trigger | `on: schedule` — `0 18 * * *` UTC (2am MYT) |
| Timeout | 10 min |
| Jobs | backend-e2e (API E2E), secret-scan (gitleaks + trufflehog), npm-audit, notify (WhatsApp) |

---

## 2. Notifications

### 2.1 Architecture

All three workflows include an optional `notify` job that fires on completion — **both pass and fail**. The notify job uses `needs: [all jobs]` with `if: always()`.

By default the notify step is silently skipped. To enable:

**Set one GitHub secret** in repo Settings → Secrets → Actions:

| Secret | Value | Example |
|--------|-------|---------|
| `NOTIFY_HOOK` | Webhook URL prefix that text is appended to | Telegram: `https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT>&text=` or Discord: `https://discord.com/api/webhooks/<ID>/<TOKEN>?content=` |

The step constructs: `$NOTIFY_HOOK + url-encoded text`.

### 2.2 Message format

```
PASS pr-gate master All=ok https://github.com/...
FAIL push-checks feat/ux-polish Backend=success Frontend=failure https://github.com/...
PASS nightly 2026-06-10 All=ok https://github.com/...
```

### 2.3 Supported providers

Any service that accepts text via GET parameter:

| Provider | Setup | Cost |
|----------|-------|------|
| **Telegram Bot** | `/newbot` with @BotFather → token + chat_id | Free |
| **Discord Webhook** | Server Settings → Integrations → Webhook URL | Free |
| **Slack Webhook** | App settings → Incoming Webhooks | Free tier |
| **custom** | Any HTTP endpoint that takes `?text=` or `?message=` | Varies |

---

## 3. E2E Testing Strategy

### 3.1 API-level E2E (existing)

Uses `supertest` against an in-memory Express app. Runs in the `backend-e2e` job with a live Postgres + Redis service container. Triggered by `RUN_E2E=1`.

**4 existing suites:**

| Suite | Lines | Coverage |
|-------|-------|----------|
| `auth.test.ts` | 210 | Register, login, refresh, logout, demo login, lockout |
| `quote-flow.test.ts` | 150 | Quote submit → propose → accept → confirm → arrive → done |
| `admin-actions.test.ts` | 247 | Admin login, ban/unban, category approval, withdrawal, appeal |
| `cash-confirm.test.ts` | 273 | Cash booking lifecycle, ownership edge cases |

### 3.2 Browser E2E (new)

Uses **Playwright** for real-browser testing. Runs in `pr-gate.yml` only.

**Initial 5 scenarios (Phase 1):**

| # | Role | Flow | What it validates |
|---|------|------|-------------------|
| 1 | Guest | Quote wizard | Select service from home page → step through 7-step wizard → see register prompt at end |
| 2 | Customer | Login + browse | Demo login → browse categories → verify customer shell loads |
| 3 | Customer | Quote submit | Login → browse → pick category → fill quote form → submit → see confirmation |
| 4 | Admin | PIN gate | Login → navigate to admin → PIN prompt → access dashboard |
| 5 | Servicer | Jobs board | Login → verify jobs board with tabs (pending/active/history) |

**Phase 2+ (future):** Add booking lifecycle (multi-context: customer + servicer in parallel), Stripe sandbox flows, chat AI card chain, role switching.

### 3.3 Playwright setup

```
frontend/
├── e2e/
│   ├── playwright.config.ts       # Base URL, timeouts, workers
│   ├── fixtures/
│   │   └── demo-auth.ts           # Login helpers for customer/servicer/admin
│   ├── specs/
│   │   ├── guest-quote.spec.ts
│   │   ├── customer-browse.spec.ts
│   │   ├── customer-quote.spec.ts
│   │   ├── admin-pin.spec.ts
│   │   └── servicer-jobs.spec.ts
│   └── .env.e2e                    # Base URLs + demo credentials (gitignored)
```

Workflow step:
```yaml
- name: Install Playwright
  run: npx playwright install --with-deps chromium
- name: Run browser E2E
  working-directory: frontend
  run: npx playwright test
```

---

## 4. Secrets Configuration

### 4.1 GitHub Actions secrets

| Secret | Used by | Required |
|--------|---------|----------|
| `CALLMEBOT_APIKEY` | notify job (all workflows) | No — skip if absent |
| `CALLMEBOT_PHONE` | notify job (all workflows) | No — skip if absent |

No other secrets needed. CI jobs use hardcoded `DATABASE_URL` (localhost service container) and test-only `JWT_SECRET`/`REFRESH_SECRET` — no real secrets exposed.

### 4.2 What does NOT go in CI secrets

CI test jobs use their own test values:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/homeservices` — local service container only
- `JWT_SECRET=ci-test-jwt-secret-value-0123456789abcdef` — test-only
- `REFRESH_SECRET=ci-test-refresh-secret-value-0123456789abcdef` — test-only

These are hardcoded in the workflow. They have no production value.

---

## 5. Deployment Integration

### 5.1 Railway (backend)

No direct CI-to-deploy hook needed. Railway auto-deploys from the connected GitHub repo on push to master. The PR gate ensures that only tested code reaches master, so Railway only deploys green builds.

**Railway setup:**
- Railway dashboard → project → Settings → Deploy → Auto-deploy from `master` branch
- This already works — no change needed

**Future (post-V1):** Add a `deploy` job to `pr-gate.yml` that calls Railway deploy webhook after merge. Not needed while you're the sole developer.

### 5.2 Cloudflare Pages (frontend)

Same principle — Cloudflare Pages auto-deploys from the connected Git repo. Master is protected by PR gate.

**Cloudflare setup:**
- Cloudflare Dashboard → Pages → project → Settings → Builds & deployments → Auto-deploy on push to `master`
- Build command: `npm run build` (already configured)
- Output directory: `dist/frontend` (verify in Cloudflare dashboard)

### 5.3 What to check after deploying this CI

1. Run `gh workflow run push-checks.yml` manually to verify first run
2. Open a test PR to validate `pr-gate.yml` triggers and all jobs pass
3. Check WhatsApp message arrives on your phone
4. Wait for first nightly run — verify message arrives in the morning
5. Delete the old `security.yml` and `ci.yml` after confirming new pipelines work

---

## 6. Migration Plan

### 6.1 Files to create

| File | Purpose |
|------|---------|
| `.github/workflows/push-checks.yml` | Light push validation |
| `.github/workflows/pr-gate.yml` | Full PR gate (the main pipeline) |
| `.github/workflows/nightly.yml` | Nightly maintenance |
| `frontend/e2e/playwright.config.ts` | Playwright config |
| `frontend/e2e/specs/*.spec.ts` | 5 browser E2E scenarios |
| `frontend/e2e/fixtures/demo-auth.ts` | Auth helper fixtures |

### 6.2 Files to delete

| File | Reason |
|------|--------|
| `.github/workflows/ci.yml` | Replaced by `push-checks.yml` + `pr-gate.yml` |
| `.github/workflows/security.yml` | Folded into `pr-gate.yml` + `nightly.yml` |

### 6.3 Files to update

| File | Change |
|------|--------|
| `CLAUDE.md` | Update CI section — manual-only rule stays, add PR gate description |
| `README.md` | Update CI/tech stack section if needed |
| `backend/package.json` | Add `npm run test:e2e:browser` script (if not present) |

### 6.4 Rollout order

1. **Write `push-checks.yml`** — test with manual trigger first, then enable `on: push`
2. **Write `pr-gate.yml`** — test with `workflow_dispatch`, then enable `on: pull_request`
3. **Write `nightly.yml`** — verify first run, adjust schedule if needed
4. **Delete old workflows** — only after confirming new ones work end-to-end
5. **Add browser E2E** — scaffold Playwright → write 5 scenarios → add to `pr-gate.yml`
6. **Final cleanup** — update docs, delete `security.yml`

---

## 7. Cost Estimate

Free tier private repo: **2,000 min/month**.

| Workflow | Triggers/month (estimated) | Min/run | Total min/month |
|----------|---------------------------|---------|-----------------|
| `push-checks` | ~30 pushes | 3 | 90 |
| `pr-gate` | ~5 PRs | 10 | 50 |
| `nightly` | 30 nights | 6 | 180 |
| **Total** | | | **~320** |

Well within the 2,000-min free tier. Even at 2x push frequency, under 500 min/month.

---

## 8. Design Decisions Log

| Decision | Rationale |
|----------|-----------|
| PR gate, not merge gate | Industry standard: catch breaks before they land in master |
| Notification on every build (pass + fail) | User preference: want visibility on all runs. Generic NOTIFY_HOOK webhook — plug in Telegram, Discord, or any webhook |
| Security scan folded into PR + nightly | Save minutes — no standalone push trigger. Gitleaks pre-commit catches secrets locally |
| Security scan folded into PR + nightly | Save minutes — no standalone push trigger. Gitleaks pre-commit catches secrets locally |
| Browser E2E starts small (5 scenarios) | The app has 47 pages. Start with critical paths, grow iteratively |
| No auto-deploy webhook from CI | Railway + Cloudflare auto-deploy from master. Already covered |
| Nightly at 2am MYT (`0 18 * * *` UTC) | Off-peak. Messages arrive when you wake up |
| No `workflow_dispatch` in new pipelines | If needed later, add it. Not in initial scope |
