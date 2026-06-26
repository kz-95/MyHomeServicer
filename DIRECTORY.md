# DIRECTORY.md - MyHomeServicer Project Map

> auto-generated 2026-06-26 - last restructured 2026-06-26

## Root

| Path | Purpose |
|------|---------|
| `backend/` | Express + TypeScript REST API, Prisma ORM |
| `frontend/` | Angular 17 SPA |
| `docs/` | All project documentation |
| `scripts/` | Dev automation scripts (all platforms) |
| `assets/` | Static assets (images, slides, logos) |
| `sandbox/` | Experimental / prototype code |
| `tests/` | Shared test harness (e2e) |
| `test-results/` | Generated test output (gitignored) |
| `logs/` | Runtime logs (gitignored) |
| `ignorethis/` | Disposable dev artifacts (gitignored) |
| `.github/` | CI/CD workflows |
| `docker-compose.yml` | Local dev infrastructure (Postgres + Redis) |
| `railway.json` | Railway deployment config |

## scripts/

| Path | Purpose |
|------|---------|
| `scripts/bat/Run.bat` | Main launcher - starts Docker, backend, frontend |
| `scripts/bat/kill-port.bat` | Kill process on a port |
| `scripts/bat/e2e-test-local.bat` | Full E2E suite (backend + frontend) |
| `scripts/bat/playwright-test-local.bat` | Frontend Playwright E2E only |
| `scripts/bat/railway-dbreset.bat` | Destructive Railway demo DB reset |
| `scripts/ps1/*.ps1` | PowerShell: fresh-start, tunnel, lan-dev |
| `scripts/sh/*.sh` | Bash: fresh-start, tunnel, lan-dev |
| `scripts/check-no-bom.mjs` | UTF-8 BOM scanner (called by Run.bat) |
| `scripts/_gen-csv.mjs` | CSV generation utility |
| `scripts/git-hooks/` | Git hook scripts |

## backend/

| Path | Purpose |
|------|---------|
| `backend/src/` | TypeScript source |
| `backend/src/routes/` | Express route handlers |
| `backend/src/services/` | Business logic layer |
| `backend/src/middleware/` | Auth, rate-limit, PIN cooldown |
| `backend/src/jobs/` | BullMQ job processors |
| `backend/src/lib/` | Shared utilities (Prisma, Redis, errors) |
| `backend/src/socket/` | Socket.IO real-time layer |
| `backend/prisma/` | Schema (`schema.prisma`), migrations, seed data |
| `backend/prisma/schema.prisma` | **Source of truth** - 49 models, ~1400 lines |
| `backend/tests/` | Jest unit + E2E tests |
| `backend/scripts/` | validate-structure.js |
| `backend/Dockerfile` | Production Docker image |
| `backend/.env` | Environment secrets (gitignored) |
| `backend/.env.example` | Environment template |

## frontend/

| Path | Purpose |
|------|---------|
| `frontend/src/app/` | Angular app source |
| `frontend/src/app/admin/` | Admin dashboard (Analytics, Users, Settings) |
| `frontend/src/app/servicer/` | Servicer portal (Dashboard, Jobs, Quotes, Listings) |
| `frontend/src/app/customer/` | Customer portal (Bookings, Quotes, Rewards) |
| `frontend/src/app/auth/` | Login + Register pages |
| `frontend/src/app/home/` | Public landing page |
| `frontend/src/app/shared/` | Reusable components (Shell, Chat, DemoBar, WA-Button) |
| `frontend/src/app/core/` | Services (Auth, Notification, HTTP interceptors) |
| `frontend/e2e/` | Playwright browser tests |
| `frontend/scripts/` | postbuild-absolutize.mjs |
| `frontend/STYLE-RULES.md` | Design tokens + CSS conventions |

## docs/

| Path | Purpose |
|------|---------|
| `docs/ai-context/` | Agent coordination, schema notes, seed plan, security |
| `docs/ai-context/logs/` | Agent session logs (single-writer per agent) |
| `docs/ai-context/archive/` | Frozen historical records (postmortems, audits, old QA) |
| `docs/api-reference/` | API endpoint contracts |
| `docs/setup-guides/` | Dev setup, production go-live |
| `docs/superpowers/` | Feature specs + execution plans |
| `docs/tasks/` | Task tracking notes |
| `docs/data/` | Reference data (CSV, seed prompts) |
| `docs/SECURITY-CODING-STYLES.md` | Security anti-pattern coding rules |

## assets/

| Path | Purpose |
|------|---------|
| `assets/capstone/` | Capstone presentation deck (HTML, slides, screenshots) |
| `assets/logo-gen/` | Generated logo assets |
| `assets/*.svg` | QR codes and vector graphics |

## Key files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Session rules, coding conventions |
| `TODO.md` | Active task checklist |
| `DIRECTORY.md` | This file - project map |
| `.gitignore` | Git ignore rules |
| `docker-compose.yml` | Local infrastructure |
| `railway.json` | Deployment config |
| `README.md` | Project overview |
