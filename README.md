# My Home Servicer

A marketplace connecting customers with home service providers - plumbing, cleaning, aircon servicing, home cooking, and more. Customers submit quote requests, nearby servicers respond with proposals, and the platform manages the full job lifecycle from booking through payment.

---

## What it does

**For customers**
- Browse services on a public home page - no login required to look around
- Submit a quote request through a 4-step wizard (Service → Contact → Summary → Bill)
  with per-service custom questions, split address entry (Address No. / Street Details),
  Google Maps autocomplete, GPS location, and auto-detected postcode/district/state
- Receive proposals from nearby servicers in real time
- Track job status live - from servicer confirmation through to completion
- Reorder from a previous servicer with one tap
- Top up a prepaid credit wallet and earn loyalty rewards
- Get in-app notifications (bottom-left snackbar) for orders and job updates,
  with a settings page to choose what to receive
- Chat with an AI assistant for help and FAQs

**For servicers**
- Register as a "servicer" and receive matching quote requests in real time
- Build service listings with modifier groups (single/multi-select add-ons)
- Set up auto-accept rules to win jobs automatically within chosen parameters
- Manage the full job lifecycle - confirm, arrive, mark done, upload photos
- Issue branded invoices (auto-generated PDF)
- Work a 3-column jobs board - Pending requests / Active jobs / History
- Manage promotions and track earnings on a weekly-chart dashboard
- Get notified about new requests and job updates, and follow chosen categories
- Switch to "customer mode" to use the platform as a customer

**For admins**
- Approve new category requests and manage platform categories
- Handle servicer withdrawal requests
- Review penalties and servicer appeals
- Manage platform settings, fee structure, and feature flags
- Full audit log of all money movements

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Language | TypeScript 5.4 (backend) / 5.9 (frontend) |
| Backend framework | Express.js 4.22 |
| ORM | Prisma 5.12 |
| Database | PostgreSQL 16 |
| Cache + queue | Redis 7 + BullMQ 5.77 |
| Redis client | ioredis 5.3 |
| Real-time | Socket.io 4.8 |
| Frontend | Angular 21.2 (standalone components, signals, block control flow) |
| File storage | Cloudflare R2 (S3-compatible, presigned URLs) |
| Email | Brevo SMTP |
| AI chatbot | Gemini 2.0 Flash / DeepSeek (deepseek-chat) - direct API with fallback chain |
| Maps & location | Google Maps Platform (Places Autocomplete, Geocoding API) |
| Payments | Stripe (PaymentIntents, Checkout Sessions, webhooks) |
| OAuth | Passport + Google OAuth 2.0 |
| PDF generation | pdf-lib 1.17 |
| Photo processing | sharp 0.33 (EXIF stripping) |
| Validation | Zod 3.22 (runtime) + express-validator (routes) |
| Auth | JWT (access + refresh) + bcryptjs (cost 12) |
| Deployment | Railway (backend + Postgres + Redis) + Cloudflare Pages (frontend) |
| CI / testing | GitHub Actions (push-checks + PR gate + nightly), Jest (backend), Playwright (E2E) |
| Secrets scanning | gitleaks (pre-commit) + trufflehog (PR gate + nightly CI) |
| Icons | Lucide (Angular) |
| Drag & drop | Angular CDK 21.2 |
| QR codes | qrcode |

---

## Architecture

```
Browser / Mobile
      │
      ▼
  Angular SPA (3 lazy-loaded portals: customer, servicer, admin)
      │
      ▼
  Express.js REST API + Socket.io
      ├──► PostgreSQL  (primary data store)
      ├──► Redis       (Socket.io adapter + BullMQ job queue)
      ├──► S3          (file storage - direct browser upload)
      └──► Gemini / DeepSeek (AI chatbot - direct API call)
```

Background jobs (BullMQ worker process, separate from API):
- `quote.expiry` - bundle and deliver proposals when quote deadline hits
- `quote.no_response` - issue discount voucher if no servicer responds
- `noshow.detect` - detect and flag servicer no-shows
- `penalty.deduct` - deduct penalty from servicer deposit
- `escrow.release` - release payment to servicer after job completion
- `invoice.generate` - generate PDF invoice and upload to S3
- `promo.credit_payback` - reimburse servicer for platform promotions used
- `notification.push` - dispatch push notifications without blocking API
- `noshow.weekly_reset` - reset weekly no-show counters every Monday
- `withdrawal.notify` - alert admin when servicer requests withdrawal

---

## Getting started

See [docs/setup-guides/INSTRUCTIONS.md](./docs/setup-guides/INSTRUCTIONS.md) for the full setup guide.

Quick version:

```bash
# Start infrastructure (required first)
docker compose up -d

# Build the DB schema + seed demo data (now includes modules + settings in one pass)
cd backend && npm run db:reset
```

**Windows users** - after the two steps above, just double-click `scripts/bat/Run.bat`.
It opens two terminal windows, creates `backend/.env` with generated secrets if it doesn't exist, installs any missing dependencies, and starts both servers.

**Other platforms** - open two terminals manually:

```bash
# Terminal 1 - backend → localhost:3000
cd backend && npm run dev

# Terminal 2 - frontend → localhost:4200
cd frontend && ng serve
```

---

## Demo accounts

All share password `Demo@2026`.

| Email | Role |
|---|---|
| `customer.fresh@demo.local` | Customer |
| `customer.active@demo.local` | Customer - has live quote proposals |
| `customer.loyal@demo.local` | Customer - has booking history + chat |
| `admin@demo.local` | Admin (PIN: `1234`) |
| `servicer.1@demo.local` – `servicer.12@demo.local` | Servicers |

---

## Key commands

```bash
npm run seed       # Full demo seed (categories, servicers, modules, bookings, invoices, escrow, admin queues)
npm run seed:test  # Lean test seed (8 servicers, 32 bookings)
npm run reseed     # Wipe + full seed
npm run db:reset   # Nuclear reset (drops DB, re-applies all 25 migrations, runs consolidated seed)
npm run db:sync    # Deploy pending migrations (keeps data) + regenerate client

# Railway (demo environment)
railway run npx prisma migrate reset --force   # Full nuclear reset on Railway
```

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [`DIRECTORY.md`](./DIRECTORY.md) | Full project folder map |
| [`docs/api-reference/api-doc.md`](./docs/api-reference/api-doc.md) | API endpoint contracts |
| [`docs/ai-context/schema-notes.md`](./docs/ai-context/schema-notes.md) | Database models and relations |
| [`docs/ai-context/security-notes.md`](./docs/ai-context/security-notes.md) | Auth, encryption, money safety |
| [`docs/ai-context/tech-stack.md`](./docs/ai-context/tech-stack.md) | Library choices and versions |
| [`docs/ai-context/seed-plan.md`](./docs/ai-context/seed-plan.md) | Demo accounts and seed data |
| [`docs/setup-guides/INSTRUCTIONS.md`](./docs/setup-guides/INSTRUCTIONS.md) | Full dev setup guide |
| [`TODO.md`](./TODO.md) | Current task checklist |

---

## Security

The platform handles real money and personal addresses. Key measures in place:

- Short-lived JWTs (15 min access, 7 day refresh stored as SHA-256 hash)
- bcrypt cost 12 for passwords and action PINs
- Action PIN separate from login for sensitive admin operations
- Rate limiting on all auth and money routes
- Account lockout after 5 failed login attempts
- Idempotency keys on all money operations (Redis + Postgres fallback)
- Files uploaded directly to S3 via presigned URLs - never through the API
- EXIF metadata stripped from all photos before storage
- `gitleaks` pre-commit hook + `trufflehog` CI scan for leaked secrets
- Demo accounts blocked entirely in production (`NODE_ENV=production`)

See [docs/ai-context/security-notes.md](./docs/ai-context/security-notes.md) for the full checklist.
