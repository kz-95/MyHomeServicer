# Production Go-Live Checklist

> What to change when moving from dev to a real business deployment.
> All values here are **placeholders** - replace with your actual production credentials.

---

## Quick checklist

- [ ] Stripe: switch to live keys + production webhook
- [ ] Frontend: create `environment.prod.ts` + production build
- [ ] Backend: set `NODE_ENV=production`, update all env vars
- [x] Database: Prisma migrations applied on deploy via `prisma migrate deploy` in the start command (see §4)
- [ ] Infrastructure: HTTPS, CORS, rate limits, secrets manager
- [ ] Google Maps: apply referrer restrictions in GCP Console
- [ ] Remove/double-check seed data
- [ ] Verify: demo accounts blocked, dev endpoints blocked, tests green

---

## 1. Stripe - test → live

### 1.1 Swap to live keys

In `backend/.env`:

```env
# Replace test key with live key
STRIPE_SECRET_KEY=sk_live_51YOUR_LIVE_KEY_HERE
```

Get the live key: **Stripe Dashboard** (top-right toggle → **Live mode**) → **Developers** → **API keys** → `sk_live_...`

### 1.2 Production webhook endpoint

Create a persistent webhook (not `stripe listen`):

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL:** `https://yourdomain.com/api/v1/stripe/webhook`
3. **Events to send:** `payment_intent.succeeded` + `checkout.session.completed`
4. Click **Add endpoint**, then reveal the **Signing secret**

```env
STRIPE_WEBHOOK_SECRET=whsec_YOUR_PRODUCTION_WEBHOOK_SECRET
```

### 1.3 Webhook IP whitelist (optional)

Stripe publishes their webhook IPs at https://stripe.com/docs/ips. If your firewall blocks external traffic, whitelist those ranges.

---

## 2. Frontend - production build

The frontend is served via **Cloudflare Pages** (connected to GitHub). The Cloudflare Pages `_redirects` rule proxies `/api/v1/*` to the Railway backend, so no separate `environment.prod.ts` is needed - the frontend uses relative `/api/v1` paths.

Build for production (triggered automatically by Cloudflare Pages on push):

```bash
cd frontend
npx ng build
```

Output root: `frontend/dist/myhomeservicer/browser` - set this as the **Build output directory** in Cloudflare Pages.

**Never use `ng serve` in production.** It's a dev-only dev server with no compression, no cache headers, and the Angular CLI sourcemaps exposed.

---

## 3. Backend - environment variables

All of these go in Railway's **Variables** tab for the backend service. Railway auto-provides `DATABASE_URL` and `REDIS_URL` from the Postgres and Redis plugins:

```env
# ── Runtime
NODE_ENV=production                      # CRITICAL - blocks demo accounts + dev endpoints
PORT=3000
TZ=Asia/Kuala_Lumpur

# ── Frontend origin
APP_URL=https://myhomeservicer.pages.dev

# ── Database (auto-provided by Railway Postgres plugin)
DATABASE_URL=postgresql://user:password@your-db-host:5432/homeservices

# ── Redis (auto-provided by Railway Redis plugin)
REDIS_URL=redis://user:password@your-redis-host:6379

# ── JWT (generate new, DIFFERENT from dev)
JWT_SECRET=<new-64-char-hex>
REFRESH_SECRET=<new-64-char-hex>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# ── Cloudflare R2 (S3-compatible file storage)
S3_BUCKET=myhomeservicer-uploads
S3_REGION=auto
S3_ACCESS_KEY=<R2-token-access-key>
S3_SECRET_KEY=<R2-token-secret>
S3_BASE_URL=https://<account>.r2.cloudflarestorage.com/myhomeservicer-uploads

# ── AI Chatbot
AICHAT_LLM_API_KEY=YOUR_PRODUCTION_GEMINI_KEY
AICHAT_LLM_FALLBACK_API_KEY=YOUR_PRODUCTION_DEEPSEEK_KEY

# ── Google OAuth (update authorized redirect URIs in GCP Console)
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://your-backend.up.railway.app/api/v1/auth/google/callback
ADMIN_EMAILS=you@yourdomain.com

# ── Google Maps
GOOGLE_MAPS_API_KEY=YOUR_KEY

# ── Stripe
STRIPE_SECRET_KEY=sk_live_YOUR_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET

# ── Email (Brevo SMTP)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<brevo-login>
SMTP_PASS=<brevo-smtp-key>
SMTP_FROM=MyHomeServicer <noreply@myhomeservicer.com>
```

> **Security rule:** Never commit `.env` to git. Use your hosting platform's secrets manager (Railway, Render, Fly.io, GitHub Actions secrets, etc.) instead of a plaintext `.env` file on disk.

---

## 4. Database - Prisma migrations

This project uses **Prisma migrations** (committed under `backend/prisma/migrations/`) in dev and prod - reviewed SQL, an audit trail, and fail-fast-on-drift. The Railway **start command** applies pending migrations on every deploy:

```jsonc
// root package.json - "start" (run by railway.json deploy.startCommand "npm start")
"start": "cd backend && npx prisma migrate deploy && npx prisma generate && node dist/index.js"
```

- `prisma migrate deploy` only applies migrations already committed under `prisma/migrations/`. It is idempotent (a deploy with no new migrations is a no-op), never auto-generates DDL, and aborts the deploy on schema drift - so prod can't be silently rewritten on boot.
- **Changing the schema:** run `npm run db:migrate` (`prisma migrate dev --name <change>`) locally, commit the new `prisma/migrations/<ts>_<change>/` folder, push - the next deploy applies it.
- `DATABASE_URL` must point to the production PostgreSQL instance (Railway Postgres plugin auto-provides it). Use connection pooling (PgBouncer / your provider's pooler) for higher concurrency.

### 4.1 One-time baseline of a pre-existing prod DB

If the prod DB was previously created with `db push` (tables exist, but no `_prisma_migrations` history), the first `migrate deploy` will fail with **P3005 (schema not empty)**. Resolve it once, then deploys are clean:

```bash
# Option A - keep existing prod data: mark the baseline migration as already applied
railway run npx prisma migrate resolve --applied 0_init

# Option B - demo env, fine to wipe: reset + re-apply + reseed
railway run npx prisma migrate reset --force
```

### 4.2 Demo data / PINs on prod

`migrate deploy` does NOT seed. To load demo accounts (and the demo PINs - action PIN `1234`, demo login gate `5201314`), run a one-off in the Railway shell: `railway run npm run seed` (additive) or `railway run npm run db:reset` (DESTRUCTIVE - `migrate reset --force`, wipes + re-applies + reseeds; demo environments only).

---

## 5. Infrastructure

### 5.1 HTTPS

All traffic must be HTTPS. Both platforms handle this automatically:

- **Cloudflare Pages** - HTTPS is automatic (free SSL)
- **Railway** - HTTPS is automatic (free SSL for all `.railway.app` domains)

### 5.2 CORS

In `backend/src/app.ts`, CORS is configured from the `APP_URL` env var. Verify it's set to your production domain. Never use `*` in production.

### 5.3 Rate limits

The global rate limiter (`backend/src/middleware/rate-limit.ts`) uses defaults suitable for dev. Review and tune for production traffic:

- Global: default is probably fine for a small launch
- Auth routes (`/auth/login`, `/auth/register`): ensure stricter limits to prevent brute force
- AI chat: rate-limited per-user already - verify limits make sense for your user base

### 5.4 Process management

Railway handles process lifecycle automatically - no PM2 needed. The `railway.json` at the repo root configures restart policy.

---

## 6. Google Maps - referrer restrictions

In **Google Cloud Console** → **APIs & Services** → **Credentials**:

1. Click your API key
2. Under **Application restrictions**, select **HTTP referrers (web sites)**
3. Add: `https://yourdomain.com/*` and `https://*.yourdomain.com/*`
4. Under **API restrictions**, select **Restrict key** and enable only:
   - Geocoding API
   - Places API
   - Maps JavaScript API
5. **Save**

This ensures even if the key leaks (it's visible in the browser's page source), it only works from your domain.

---

## 7. Seed data / demo accounts

When `NODE_ENV=production`:

- **Demo account login is blocked** - middleware rejects `is_demo: true` accounts
- **Seed script refuses to run** - `npm run reseed` exits with an error
- **`POST /dev/topup`** and other dev-only endpoints throw 403

**Before going live:**

1. Run the seed script against your production DB to populate categories, settings, and FAQ entries (or manually create them)
2. Verify no `is_demo: true` users exist in the production DB
3. Set up at least one real admin account (register via Google OAuth with an email in `ADMIN_EMAILS`)

---

## 8. Pre-launch verification

```bash
# Backend
cd backend
npx tsc --noEmit          # Zero errors
npx jest --passWithNoTests # All tests green

# Frontend
cd frontend
npx tsc --noEmit          # Zero errors
npx ng build --configuration production  # Exit 0, dist/ populated
```

**Smoke test checklist:**

- [ ] `GET https://yourdomain.com/api/v1/health` returns 200
- [ ] Login works (non-demo account)
- [ ] Google OAuth sign-in works (GCP redirect URI updated!)
- [ ] Quote flow: create guest quote → register → submit → works
- [ ] Stripe test charge (use test key first in a staging environment!)
- [ ] Chat widget loads and responds
- [ ] File upload works (S3 bucket reachable)
- [ ] Socket.io connects (notifications live)
- [ ] Admin panel: PIN works, settings save, audit log records

---

## Summary: dev vs. production at a glance

| Layer | Dev | Production |
|---|---|---|---|
| Stripe key | `sk_test_...` | `sk_live_...` |
| Webhook | `stripe listen` → local | Persistent endpoint in Dashboard |
| Frontend | `http://localhost:4200` | `https://myhomeservicer.pages.dev` |
| Backend | `http://localhost:3000` | Railway `.railway.app` URL |
| HTTPS | None | Automatic (Railway + Cloudflare) |
| CORS | `localhost:4200` | `https://myhomeservicer.pages.dev` |
| Database | Local Docker PostgreSQL | Railway Postgres plugin |
| Redis | Local Docker Redis | Railway Redis plugin |
| File storage | Local `uploads/` fallback | Cloudflare R2 |
| Email | `console.log` fallback | Brevo SMTP |
| NODE_ENV | `development` | `production` |
| Demo accounts | Allowed | Blocked |
| Dev endpoints | Active | 403 |
| Schema sync | `prisma migrate dev` (Run.bat → `migrate reset`) | `prisma migrate deploy` - automatic in the deploy start command |
| Secrets storage | `.env` file | Railway Variables tab |
| Process | `npm run dev` | Railway managed |
