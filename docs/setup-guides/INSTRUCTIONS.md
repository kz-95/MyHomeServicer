# Dev setup instructions

Everything you need to get the project running locally from scratch.

---

## Prerequisites

Make sure these are installed on your machine before starting:

- **Node.js 20 LTS** - [nodejs.org](https://nodejs.org)
- **Docker Desktop** - [docker.com](https://docker.com) (for Postgres + Redis)
- **Angular CLI** - `npm install -g @angular/cli` (or use `npx ng serve`)

---

## First-time setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd homeservices

npm install --prefix backend
npm install --prefix frontend
```

### 2. Start Postgres and Redis

```bash
docker compose up -d
```

This starts:
- PostgreSQL 16 on `localhost:5432`
- Redis 7 on `localhost:6379`

Data is persisted in Docker volumes - stopping containers does not wipe data.

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
```

> **Windows users:** use `copy backend\.env.example backend\.env` instead.

Open `backend/.env` and fill in:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/homeservices
REDIS_URL=redis://localhost:6379

JWT_SECRET=<generate a random 64-char string>
REFRESH_SECRET=<generate a different random 64-char string>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Cloudflare R2 (leave blank for local dev)
S3_BUCKET=
S3_REGION=auto
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BASE_URL=

# AI chatbot (optional - leave blank for canned fallback)
AICHAT_LLM_API_KEY=
AICHAT_LLM_FALLBACK_API_KEY=

PORT=3000
NODE_ENV=development
APP_URL=http://localhost:4200
HOST=0.0.0.0
TZ=Asia/Kuala_Lumpur
CORS_EXTRA_ORIGINS=
```

> Never commit `.env`. It is already in `.gitignore`.

### 4. Build the database schema

```bash
cd backend
npm run db:sync
```

`db:sync` runs `prisma migrate deploy` (applies every committed migration under
`prisma/migrations/`) and regenerates the Prisma client. **This project uses
Prisma migrations, not `db push`.** To change the schema in dev, run
`npm run db:migrate` (`prisma migrate dev --name <change>`) - it creates a new
migration folder, applies it, and regenerates the client. Commit the new folder.

> **Production (Railway):** the deploy **start command** (`npm start` →
> `prisma migrate deploy && prisma generate && node dist/index.js`) applies any
> pending committed migrations on every deploy, so schema changes (e.g. the
> `llm_api_keys` table) reach the prod DB with no manual step and a full audit
> trail. `migrate deploy` is idempotent and fails fast on drift; it does NOT
> seed - see `docs/setup-guides/PRODUCTION-GO-LIVE.md` §4 for loading demo data /
> PINs and the one-time baseline of a pre-existing prod DB.

### 5. Seed demo data

```bash
npm run seed
```

This populates the database with all demo accounts, servicers, quotes,
bookings and platform settings. The seed is idempotent - it wipes any existing
data first, so it is safe to re-run.

> Shortcut: **`npm run db:reset`** does steps 4 + 5 in one go - force-push the
> schema, regenerate the client, and reseed. This is the usual "fix the
> database" command after a schema change.

---

## Running the project

---

### Manual (any OS)

Open two terminals:

**Terminal 1 - Backend**
```bash
cd backend
npm run dev
```
Runs at `http://localhost:3000`

**Terminal 2 - Frontend**
```bash
cd frontend
ng serve
```
Runs at `http://localhost:4200`

---

## Daily startup (Windows)

Follow these steps each time you open your PC and want to work on the project.

1. Open **Docker Desktop** from the Start menu. Wait until it finishes loading - the whale icon stops animating and it shows "Engine running".

2. Open the folder **E:\WebDevCurriculums\MyServicer** and double-click **start-dev.bat**. This starts the database, the backend, and the frontend. Two black windows will open.

3. Wait about 30 seconds, then check the two windows:
   - The **backend** window should show: `API listening`
   - The **frontend** window should show: `Compiled successfully`
   Leave both windows open - closing them stops the app.

4. Open **Chrome** and go to **http://localhost:4200**. You should see the My Home Servicer home page. If it loads, the app is ready.

5. Open **Claude**, make sure the **MyServicer** folder is connected, and tell Claude what to do.

### When you finish for the day

Close the two black windows (backend + frontend) to stop the app. In Docker Desktop you can leave the database running or stop it - data is kept either way.

### If something looks wrong

- **Blank page or "Couldn't load services":** the backend isn't ready yet. Wait a few seconds and refresh, or re-run start-dev.bat.
- **Anything else:** tell Claude what you see on the screen and it will diagnose it.

---

## Demo accounts

All demo accounts share the password `Demo@2026`.

| Email | Role |
|---|---|
| `customer.fresh@demo.local` | Customer - no order history |
| `customer.active@demo.local` | Customer - open quote with 3 proposals |
| `customer.loyal@demo.local` | Customer - 4 completed bookings with invoices |
| `admin@demo.local` | Admin - action PIN: `1234`, 30-day revenue chart |
| `servicer.1@demo.local` to `servicer.19@demo.local` | Servicers - 19 across all 11 categories, each with revenue history for dashboard charts |

> Demo account logins are blocked in production (`NODE_ENV=production`).

---

## Useful commands

### Docker

```bash
docker compose up -d          # Start Postgres and Redis
docker compose down           # Stop containers (data kept)
docker compose down -v        # Stop and wipe all data
```

### Database

```bash
npm run db:sync               # Push schema changes (keeps data) + regenerate client
npm run db:reset              # Force-push schema + regenerate client + reseed (wipes data)
npx prisma generate           # Regenerate Prisma client only
npx prisma studio             # GUI to browse the database (opens in browser)
```

### Seed

```bash
npm run seed                  # Seed demo data (wipes + recreates all)
npm run unseed                # Remove all seeded data
npm run reseed                # Reset everything (unseed + seed)
npm run db:reset              # Force-push schema + regenerate client + seed
npm run seed:settings         # Upsert platform settings ONLY (budget ranges, chat
                              #   config, greeting tiers) - NON-destructive, no data
                              #   wipe. Run after a settings default changes instead
                              #   of a full reset, then restart the backend.

npm run seed:test             # Lightweight test seed (4 servicers, 32 bookings)
npm run db:reset-test         # Force-push schema + regenerate client + test seed
npm run reseed:test           # Wipe + recreate test seed

cat prisma/seed/seeded-ids.json   # Check what UUIDs are currently seeded
```

> `seeded-ids.json` is auto-generated and gitignored - do not commit it.

### Backend

```bash
npm run dev                   # Start with hot reload (ts-node-dev)
npm run build                 # Compile TypeScript
npm run test                  # Run Jest tests
npm run lint                  # Run ESLint
```

### Frontend

```bash
ng serve                      # Start dev server
ng build                      # Build for production
ng test                       # Run Jasmine/Karma tests
ng generate component <name>  # Scaffold a component
```

---

## Demo day checklist

Run this sequence on demo day, within 30 minutes of the demo starting:

```bash
cd backend
npm run reseed
```

Then verify:
- [ ] All demo accounts work (log in via login page quick-fill or navbar dropdown)
- [ ] `customer.active@demo.local` - quote countdown is still ticking
- [ ] `customer.loyal@demo.local` - chat session shows seed messages, order history has 4 completed bookings with invoices
- [ ] Any servicer dashboard (e.g. M3 Daikin Pro) - 7-day earnings chart shows bars with data
- [ ] Any servicer history page - 30-day earnings summary shows populated chart and stats
- [ ] Admin dashboard - 30-day platform revenue chart shows data
- [ ] Send one test message to AI chatbot - verify it responds
- [ ] Backend logs are clean (no errors during seed)

---

## Security setup (do this before first commit)

```bash
# Install gitleaks pre-commit hook
brew install gitleaks          # macOS
# or: https://github.com/gitleaks/gitleaks

gitleaks protect --staged      # Scan staged files before commit

# Add trufflehog to CI
# See: https://github.com/trufflesecurity/trufflehog
```

Also verify:
- [ ] `.env` is in `.gitignore`
- [ ] `.env.example` is committed with placeholder values only
- [ ] `prisma/seed/seeded-ids.json` is in `.gitignore`

---

## Project structure

```
/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # Single source of truth for DB schema
│   │   └── seed/
│   │       ├── seed.ts
│   │       ├── unseed.ts
│   │       ├── data/               # Per-table seed data files
│   │       └── seeded-ids.json     # Auto-generated, gitignored
│   ├── src/
│   │   ├── routes/                 # Express route handlers by domain
│   │   ├── middleware/             # Auth, rate limit, PIN check
│   │   ├── services/               # Business logic
│   │   ├── jobs/                   # BullMQ job definitions
│   │   ├── socket/                 # Socket.io event handlers
│   │   ├── lib/                    # Prisma client, Redis client, S3 client
│   │   └── index.ts                # Entry point
│   ├── .env                        # Local env (gitignored)
│   ├── .env.example                # Template (committed)
│   └── package.json
│
├── frontend/
│   └── src/app/
│       ├── core/                   # Auth, interceptors, guards
│       ├── shared/                 # Shared components, pipes, directives
│       ├── customer/               # Customer portal (lazy loaded)
│       ├── servicer/               # Servicer portal (lazy loaded)
│       └── admin/                  # Admin panel (lazy loaded)
│
├── docker-compose.yml
├── README.md
├── TODO.md
└── INSTRUCTIONS.md
```

---

## Common issues

**`npx prisma db push` fails - "URL must start with postgresql://"**
`backend/.env` contains an unfilled placeholder. Copy `backend\.env.example` and fill in the required values, then retry.

**`npm run db:sync` fails - "database does not exist"**
Make sure Docker is running: `docker compose up -d`. Wait a few seconds for Postgres to be ready, then retry.

**A feature fails - "column does not exist" (e.g. top-up does nothing)**
The schema changed but the database hasn't caught up. Run `npm run db:reset`
to rebuild the schema, regenerate the Prisma client and reseed, then restart
the backend so it loads the new client.

**Backend exits immediately on startup**
The env schema is validated at boot (fail-fast). Run `node -e "require('dotenv').config(); require('./src/config/env')"` from `backend/` to see which variables are missing or invalid.

**Frontend can't reach backend / 404 on API calls**
- Make sure the backend is running on port 3000 - the Angular dev server proxies `/api/*` to it.
- Check that `backend/.env` has `APP_URL=http://localhost:4200`.

**Socket.io not connecting**
Make sure Redis is running - Socket.io uses Redis adapter for broadcasting. Run `docker compose up -d` if the containers are down.

**AI chatbot not responding**
The chatbot falls back to canned answers when no API key is configured. To enable a real AI provider, set `AICHAT_LLM_API_KEY` or `AICHAT_LLM_FALLBACK_API_KEY` in `backend/.env`.

**401 Unauthorized on every request**
The demo seed was not applied - run `npm run db:reset` in `backend/` to create demo accounts. Make sure `JWT_SECRET` in `.env` matches between the token issuer and verifier.

**500 error on first API call**
Most likely the database schema was not applied. Run `npm run db:reset` in `backend/` to push the schema, generate the Prisma client, and seed demo data.
