# Security notes

> This document covers every security measure the platform needs to implement. Split into must-have for V1 and good-to-have for later. Every developer on the team should read this before writing any route or middleware.

---

## Non-negotiables for V1

These are not optional. The platform handles real money, real personal data, and real addresses. Skipping any of these creates a liability.

---

### 1. Authentication & sessions

**JWT must be short-lived**
Access tokens expire in 15 minutes. Refresh tokens expire in 7 days. Never issue a long-lived access token — if it leaks, the attacker has 15 minutes maximum, not forever.

**Refresh tokens stored as a hash**
Never store the raw refresh token in the database. Store a SHA-256 hash of it. If the database leaks, the tokens are useless.

**Revoke on logout**
Set `revoked_at` on the refresh token row when the user logs out. The auth middleware checks this on every refresh attempt.

**Separate action PIN for admin**
Admin login password gets you into the admin panel. The action PIN is a second credential required to save any sensitive setting — penalty rules, platform settings, feature flags, platform fee changes. Stored as a separate bcrypt hash on the USER table. Never the same as the login password.

**Two PINs: demo login gate vs action PIN**
There are two distinct PINs, verified by different endpoints:

1. **Demo login gate — `5201314`** (fixed, shared). A portal-entry speedbump for **demo-bar quick-logins only**. The `admin`/`servicer`/`customer` route guards run `PinService.requireGatePin()` inside `canActivate`, so the dialog must be satisfied before the route activates (and before its lazy bundle loads). The demo bar navigates via `router.navigate` (SPA, not `window.location.href`), so the gate fires **before** the URL changes — no redirect into the portal until the PIN is confirmed. **Never cached** — every restricted-page entry re-validates. Verified by `POST /config/demo-gate` (requireAuth, demo-only) against the `DEMO_GATE_PIN` constant (default `5201314`, env-overridable). This is NOT a per-account credential.

   **Scoped to the demo-bar session, NOT to `isDemo`.** The gate triggers on `AuthService.requiresDemoGate()` — a `hs_demo_gate` localStorage flag set ONLY by the passwordless demo-bar login (`/dev/demo-login`) and only when the resolved account is `isDemo`. A **real `/auth/login` (email+password)** — even of a demo account — clears the flag in `store()`, so a proper login is NEVER gated (email+password only). `admin@demo.local` (`isDemo=false`) is never flagged, so it stays ungated as before.

   **Cancel logs out.** The demo-bar session is issued (tokens stored) *before* the gate, so on cancel/wrong-PIN the guard calls `auth.logout()` then redirects to `/`. Without this the user stays logged in and home's "redirect logged-in users to their portal" bounces them straight back into the gate — an infinite loop (fixed 2026-06-07).

2. **Action PIN — `1234`** (per-account: `User.actionPinHash` for admin/customer, `Servicer.pinHash` for servicer). The real second credential for sensitive operations. Also gates **viewing** the Admin → Accounts (`/admin/users`) and Review Queues (`/admin/queues`) pages via `adminActionPinGuard`, which prompts (and `clear()`s first so each open re-prompts) before the page activates; cancel → `/admin`. Verified by `POST /admin/verify-pin` (`x-action-pin` header, admin) or `POST /chat/verify-pin` (body; servicer reads `Servicer.pinHash`, admin/customer read `User.actionPinHash`). Cached per session for in-page sensitive saves. The change-PIN / rescue-reset flows enforce exactly 6 digits (`/^\d{6}$/`); `1234` and `5201314` are both seed/demo conveniences set directly (bypassing those validators).

**Demo PIN gate should follow renamed routes (route redesign) — convenience, not security**
`adminActionPinGuard` (`canActivate`) is a **demo safeguard** on `/admin/users`,
`/admin/queues`, `/admin/settings/api-keys` — prompts for `1234` so a stray click during a
presentation doesn't burn tokens or let someone edit admin settings and break the live
site. It is intentionally NOT a hardened auth control. When the 2026-06 redesign restructures
`queues`/settings, carry the guard onto the new routes (queues → **parent** node; new
`users/:id` too) so the prompt keeps firing. If it's ever dropped, just re-add the one
`canActivate` line — there's no auth state to corrupt. See
`specs/2026-06-08-route-redesign-completeness-design.md` §9f.

**Client navigation is not an access boundary**
New `:id` detail routes (`/servicer/jobs/:id`, `/customer/bookings/:id`, `/admin/users/:id`,
`/admin/merchants/:id`) must enforce ownership/role on the **backing API**, not the route
param (IDOR). Notification `linkUrl` (→ `notification.service.routeFor()` →
`navigateByUrl`) must stay backend-controlled and start with a single `/` (reject `//` —
defense-in-depth against open-redirect); never build `linkUrl` from user input.

**OTP as hash only**
OTP codes for password reset and phone verification are never stored in plaintext. Store bcrypt or SHA-256 hash. Expire after 10 minutes. Invalidate all previous OTPs for the same user and purpose when a new one is requested.

**OTP purpose isolation**
An OTP issued for password reset must never validate for phone verification, and vice versa. The `purpose` field on `OTP_CODE` is checked on every verification — wrong purpose returns the same generic error as wrong code.

**Account lockout on failed logins**
Rate limiting on `/auth/login` is per-IP — attackers can rotate IPs. Add a per-account failure counter on USER. After 5 consecutive failed login attempts, lock the account for 15 minutes. Counter resets on successful login.

**Demo account production safety**
Accounts with `is_demo: true` use a weak shared password (`Demo@2026`) for seed data convenience. The auth middleware blocks demo account logins entirely when `NODE_ENV=production`. The seed script itself refuses to run in production. Never deploy demo accounts to a public-facing environment.

**Never trust the cached principal — validate the session on startup**
The frontend keeps the principal in `localStorage` (`hs_user`) so a session survives a refresh, but `localStorage` is attacker-writable and a token may be stale/revoked. The SPA therefore calls `GET /session` once at startup, blocking on it via `APP_INITIALIZER`, before any logged-in UI ("My portal", portal routes) renders. `GET /session` runs the normal `authenticate` + `requireAuth` middleware and rebuilds the principal from the database; a stale/forged token returns 401 and the client calls `logout()` (clears tokens + principal). It is mounted at the API root (NOT under `/auth`) so the auth interceptor attaches the Bearer token and performs its silent refresh-on-expiry. Logged-in state must never be presented on the strength of `localStorage` alone.

---

### 2. Passwords

**bcrypt with cost factor 12**
All passwords hashed with bcrypt, minimum cost factor 12. Never MD5, SHA-1, or SHA-256 for passwords — these are not password hashing algorithms.

**Minimum password requirements**
Enforce server-side — not just frontend. Minimum 8 characters, at least one number. Demo accounts bypass this via the `is_demo` flag.

**No password in logs**
Never log request bodies on auth routes. `morgan` should be configured to skip body logging on `/auth/*`. A single log line with a plaintext password is a serious incident.

---

### 3. API keys & external service secrets

**Why this matters most**
AI API keys (Gemini, DeepSeek), S3 credentials (Cloudflare R2), and payment gateway keys are all "money on a string". If leaked:
- Gemini/DeepSeek key → attacker runs unlimited AI requests on your account, racking up bills
- S3 keys → attacker reads/deletes customer photos, KYC documents, invoices
- Payment gateway keys → attacker creates fake transactions or refunds

Treat every API key like cash. Apply every layer below.

**Layer 1 — Never in frontend code**
The Angular bundle is downloaded to every visitor's browser. Anything in there is public — even in environment files, even in "private" config. AI API keys, S3 keys, anything sensitive stays on the Express server only. Frontend calls Express, Express calls the third party. The frontend never holds a long-lived credential.

**Public client-side config pattern (2026-05-28):** Even non-sensitive values
like `googleClientId` and `googleMapsApiKey` are served dynamically via
`GET /config/public` from the backend, not baked into the Angular build. This
means:
- Keys can be changed per-environment without rebuilding the frontend
- The `environment.ts` file contains only `apiBase` and empty placeholders for
  config values — the real values come from the API at app startup via `APP_INITIALIZER`
- Google OAuth client IDs and Maps API keys are public by design (they're
  referrer-restricted in GCP), but serving them through the backend gives a
  single source of truth and eliminates the risk of stale keys in a cached build

**Layer 2 — Never in git history**
- `.env` added to `.gitignore` from the first commit
- `.env.example` committed with placeholder values only
- If a real key was ever committed — even years ago, even in a deleted file, even in a force-pushed commit — it's leaked permanently. Rotate immediately. Git history is forever.
- Install `gitleaks` as a pre-commit hook to scan every commit for secret patterns before allowing the push
- Run `trufflehog` in CI on PR to master + nightly schedule to scan git history for leaked secrets and alert the team

**Layer 3 — Production secrets in a secrets manager**
- Development: `.env` file locally is fine
- Staging/Production: AWS Secrets Manager, Doppler, HashiCorp Vault, or the platform's built-in env vars (Railway, Vercel, Render)
- Never store production keys in `.env` files on a production server — if the server is breached, the file is read in plaintext
- Secrets manager encrypts at rest and audit-logs every read

**Layer 4 — Per-environment keys**
- Separate API keys for dev, staging, production for every external service
- Same for S3, payment gateways, SMTP credentials
- If a dev key leaks, production is safe
- Easy rotation per environment without touching other environments

**Layer 5 — Logger redaction**
- `winston` configured to scrub anything matching known secret patterns from log output
- Patterns to redact: `Bearer .*`, `sk-[a-zA-Z0-9]+`, fields named `apiKey`, `api_key`, `secret`, `token`, `password`, `key`
- Even if a developer accidentally `console.log(process.env)`, the actual values are replaced with `[REDACTED]`
- Test this — log a fake key, verify it appears redacted

**Layer 6 — Heavy rate limiting on AI endpoints**
Even with the key protected, an authenticated user inside your platform could flood the chatbot endpoint to drive up your bill:
- Per-user limit: 20 messages per 10 min
- Per-user daily cap: 100 messages per day
- Platform-wide daily cap: a hard ceiling that triggers an alert at 80% and disables the chatbot at 100%

**Layer 6a — Chat tier-based access control (privilege escalation prevention)**
The FAQ knowledge base powers both the AI system prompt AND the local fallback (when Gemini/DeepSeek are unreachable). Without tier filtering, admin-only knowledge (demo credentials, action PIN instructions, internal platform details) can leak to guest/customer users. Two guards:
- `buildSystemPrompt(role)` — filters FAQ entries by hierarchical tier before injecting into the AI system prompt: guest sees `guest` tier only; customer sees `guest`+`customer`; servicer sees `guest`+`customer`+`servicer`; admin sees all four. Implemented via `TIER_ORDER` array + `tier: { in: allowedTiers }` Prisma filter.
- `localFallback(role)` — same tier filter applied (fixed 2026-05-28). Previously queried ALL published FAQs regardless of tier, allowing keyword-match leakage of admin-only entries on AI outage.
- `chatGuard.ts` — 3-strike prompt-injection ban. Malicious prompts attempting to extract system instructions, bypass tier restrictions, or inject conflicting rules count as strikes. After 3 strikes, user is chat-banned; admin unban required.

**Layer 7 — Budget caps & alerts**
- Set monthly spend caps per AI provider in their respective dashboards
- Alert at 50%, 75%, 90% of budget via provider webhooks
- Auto-disable the AI chatbot feature flag at 100% (`feature_flag.ai_chatbot = false`) so the frontend hides the chat UI

**Layer 8 — Scheduled rotation**
- Every 90 days minimum for all API keys
- Immediately if any team member with key access leaves the team
- Immediately if any suspicious activity (sudden token usage spike, unfamiliar IP source, off-hours bursts)
- Practice the rotation process once during dev so the team knows the steps when it matters

**Layer 9 — Audit usage**
- Log every AI API call to `AUDIT_LOG` with user_id, session_id, token count, model name
- Watch for unusual patterns — same user spamming, off-hours spikes, unexpectedly high token consumption

**Layer 10 — IP restriction (if supported)**
- Whitelist the production server's IP range in each provider's dashboard
- Even if a key leaks, requests from other IPs are rejected
- Check if S3, SMTP, etc. support IP allowlisting and apply

**What to do if you suspect a leak**
1. Rotate the key immediately in the provider's dashboard
2. Update the secret in the secrets manager / production env
3. Redeploy the API to pick up the new key
4. Check audit logs and provider's usage dashboard for unauthorized activity
5. If activity found, document and notify users if their data was affected (PDPA requirement)

---

### 4. Input validation & sanitisation

**Validate everything server-side**
Use `express-validator` on every POST and PATCH route. Validate type, length, format, and range. Frontend validation is for UX — backend validation is for security. Never trust the client.

**Parameterised queries only**
Prisma uses parameterised queries by default. If you ever use `prisma.$queryRaw`, use the tagged template literal version:

```javascript
// correct
prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`

// never do this
prisma.$queryRaw(`SELECT * FROM users WHERE email = '${email}'`)
```

**Sanitise file uploads**
Validate MIME type server-side, not just the file extension. Use `file-type` to read the actual file header. Reject anything that isn't an expected format.

**Strip unknown fields**
Use `express-validator`'s `.stripUnknown()` or manually pick expected fields from `req.body`. Never pass `req.body` directly to Prisma.

**Validate JSONB settings against a schema**
`PLATFORM_SETTINGS.value`, `SERVICER_SERVICE.auto_accept_conditions`, `SERVICER_SERVICE.field_requirements` are all JSONB. A typo or wrong type can break the platform. Define a Zod schema per key and validate on every write using `zod` before saving. `zod` is already in the stack for BullMQ job payload validation — use the same library for consistency.

---

### 5. Authorisation

**Check ownership on every request**
When a customer requests `GET /bookings/:id`, verify that `booking.userId === req.user.id` before returning data. An attacker who knows a booking ID should not be able to read another user's booking.

**Role middleware on every protected route**
Three guards: `requireAuth`, `requireServicer`, `requireAdmin`. Applied at the router level so a missed annotation on a single route doesn't bypass protection.

**Servicer sees customer details only after booking confirmed**
During the quote broadcast, servicers receive only sanitised data — category, time slot, property type, budget range, general area. Full customer name, phone, address shared only via secure REST call after booking confirmation.

**Admin cannot impersonate users**
Admin routes manage platform data only. No route returns another user's JWT or allows actions as another user.

**Audit log is read-only**
AUDIT_LOG is admin-only read access. No PATCH, DELETE, or PUT routes exist for it.

**Demo / dev endpoints are production-blocked**
The `/dev/*` routes (`reseed`, `seed-quote`, `seed-proposal`, `topup`) are
demo conveniences. Each requires a signed-in user and is hard-blocked when
`NODE_ENV=production` — they throw rather than run. They must never be
reachable in a real deployment.

**Servicer "customer mode" is not impersonation**
`POST /servicer/customer-session` issues a session for a *paired customer
account* owned by the same servicer — never another user's account. The
paired account uses a synthetic, non-deliverable email so it cannot be logged
into directly, and a normal login with the servicer's real email still
resolves to the servicer.

---

### 6. API security

**Rate limiting per endpoint**

| Route | Limit |
|---|---|
| `POST /auth/login` | 10 requests per 15 min per IP |
| `POST /auth/register` | 5 requests per hour per IP |
| `POST /auth/otp/request` | 3 requests per 10 min per user |
| `POST /admin/verify-pin` | 5 attempts per 15 min per admin |
| `POST /quotes` | 20 requests per hour per user |
| `POST /servicer/quotes/:id/propose` | 10 proposals per hour per servicer — prevents proposal spam across many quotes |
| `POST /chat/session/:id/message` | 20 messages per 10 min per user, 100 per day |
| All other routes | 100 requests per min per IP |

**helmet on all routes** — `helmet()` applied globally as the first middleware.

**CORS locked to known origins** — development `http://localhost:4200`, production your actual domain. Never `*` in production.

**No sensitive data in URLs** — tokens, sensitive IDs, personal data never in query parameters. They end up in server logs, browser history, referrer headers.

**HTTPS only in production** — all traffic encrypted. HSTS header via helmet.

**Idempotency on payment & money operations**
Pay-now bookings, refunds, escrow releases, penalty deductions, promo credit paybacks, withdrawal requests, and deposit top-ups must accept an `Idempotency-Key: <uuid>` header.

Implementation strategy:
- Store processed idempotency keys in **Redis** with a 24-hour TTL
- Key format: `idempotency:{userId}:{key}` → cached response JSON
- On receipt: check Redis first. If hit, return cached response immediately without re-processing
- If Redis is unavailable: **fail open cautiously** — log the Redis error, allow the request to proceed, but write a fallback record to a `idempotency_fallback` table in Postgres so duplicates can be detected and reconciled later
- Never silently skip idempotency checks — if you can't enforce them, log it

---

### 7. Socket.io specific

**Authenticate on handshake**
```javascript
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  const user = verifyJWT(token)
  if (!user) return next(new Error('Unauthorized'))
  socket.data.user = user
  next()
})
```

**Use rooms — never broadcast globally**
Every servicer joins `servicer:{id}`. Quote broadcasts go only to specific servicer rooms. Never use `io.emit()` for anything containing user data.

**Sanitise all socket payloads**
Define exact fields for every socket event. Never emit raw database records. Customer contact details never in socket payloads.

**Validate events server-side**
Treat incoming socket events like HTTP requests — validate, authorise, never trust.

---

### 8. File uploads

**Pre-signed URLs for direct upload**
Files go directly from browser to cloud storage. API generates a pre-signed URL with 5-min expiry, client uploads directly, then calls API to confirm.

**Validate file type and size server-side**
MIME type check before generating pre-signed URL. After upload, `file-type` verifies actual file header matches. Reject oversized files (5MB photos, 10MB KYC docs).

**No executable files** — never `.js`, `.exe`, `.sh`, `.php`, or any executable format regardless of declared type.

**Strip EXIF metadata from photos**
Photos contain GPS coordinates, device info, timestamps. A servicer's home location could leak through their profile photo. A customer's address could be inferred from an arrive photo. Strip all EXIF on upload using `sharp` before storing.

**Path traversal hardening on file storage**
`local-files.ts` (local-disk fallback when S3 is not configured) constructs file paths with `path.join(UPLOADS_DIR, key)`. Even though keys are server-generated UUIDs, `path.basename(key)` is applied before join to strip any directory traversal characters (`../`, `..\\`). An attacker who controls the key parameter cannot escape the uploads directory. Verified by Semgrep scan (2026-05-28).

---

### 9. Sensitive data handling

**Never log sensitive fields**
Redact from all log output:
- `password`, `passwordHash`, `actionPinHash`
- `token`, `tokenHash`, `refreshToken`
- `otpCode`, `codeHash`
- `deviceToken`
- `apiKey`, `secret`, `bearer`
- Customer phone number and full address in non-audit contexts
- `bankAccount`, `taxNumber`, `businessRegistrationNumber`

**Mask data in API responses**
Phone numbers in list views partially masked (`+60 12-345 ****`). Bank account numbers masked except last 4 digits. Full details only in single-resource responses where ownership is proven.

**Audit log for all money movements**
Every TRANSACTION, SERVICER_CREDIT_LOG, penalty deduction, escrow movement, refund, withdrawal, promo redemption, and deposit top-up logged. Audit log is append-only.

**Environment variables only for secrets**
No secrets in code, version control, screenshots, or chat messages. API keys live in `.env` locally and a secrets manager in production.

**Generic push notification content**
Push notifications appear on lock screens. Never include sensitive details. Bad: "John from Petaling Jaya wants your aircon service at 3pm". Good: "You have a new quote request."

**AI providers are third-party hosted services**
User conversation data passes through the AI provider's servers (Gemini, DeepSeek, or custom OpenAI-compatible). Check data residency before going live (PDPA — Malaysian user data may require local processing). Restrict API key dashboard access to authorised team members only.

---

### 10. Background jobs

**Validate job payloads**
BullMQ jobs run with elevated DB access. Validate payloads with Zod or express-validator schemas per job type. A job consumer that blindly processes input is as dangerous as a route handler that does the same.

**No sensitive data in job logs**
Apply section 9 redaction rules to job payloads and job error logs. Job failure logs often retained longer than request logs.

**Job retries must be idempotent**
A failed-then-retried job must not produce a second TRANSACTION row, second penalty deduction, second notification. Use booking ID or job key as a deduplication marker.

---

### 11. Dependency security

**Lock dependency versions** — commit `package-lock.json`. Exact versions for critical packages, not `^` ranges.

**Regular audits** — `npm audit` before every release. Fix critical and high vulnerabilities. Track medium and low.

**Minimal dependencies** — every dependency is an attack surface. Avoid packages with single maintainers or no recent activity.

---

## Good to have — post V1

These are not blockers for the June 10 demo but should be implemented before scaling to real users.

---

### 12. KYC & identity verification

**IC number format validation** — Malaysian IC numbers follow YYMMDD-PB-XXXG. Validate server-side before manual review.

**Face recognition matching (future)** — match selfie against IC photo before manual review queue. Reduces admin workload at scale.

**Document expiry tracking** — IC doesn't expire, business licences do. Track `verified_at` and add expiry check for company servicer type.

---

### 13. Fraud detection

**Duplicate account detection** — flag same phone, IC, device fingerprint as existing/banned account. Alert admin.

**Velocity checks** — flag unusually high booking volume per customer or high cancellation rate per servicer.

**IP reputation checking** — soft-block known VPN/proxy ranges on auth routes.

---

### 14. Data protection & compliance

**PDPA compliance (Malaysia)**
The platform collects name, phone, address, IC number. Under Malaysia's Personal Data Protection Act:
- Users must consent to data collection (agree_terms on quote form covers this partially — review with a lawyer)
- Users have right to access and correct their data
- Data breach must be reported
- Data retention policy needed

**Data retention policy**
Define retention per data type. AUDIT_LOG and TRANSACTION permanent. Chat messages 90 days. Soft-deleted users purged after 30 days.

**Encryption at rest** — Postgres and file storage encrypted. Most managed cloud providers handle this by default. Verify before going live.

---

### 15. Payment gateway hardening (when implemented)

**Webhook signature verification** — when payment gateway added (Stripe, Billplz, etc), verify webhook signatures against provider's signing secret.

**Never trust client-side payment status** — only trust webhook events from the provider as source of truth.

---

### 16. Infrastructure

**Database connection pooling** — PgBouncer or Prisma's connection pool. Limits open connections to prevent traffic-spike exhaustion.

**Private network for database** — Postgres and Redis not publicly accessible. Live in private network, only accept connections from API server.

**Secrets rotation** — JWT secret, S3 credentials, AI API keys rotated periodically. Use a secrets manager.

**DDoS protection** — Cloudflare or similar in front of the API. Rate limiting at app layer is second line of defence.

---

## Quick reference checklist

### Before first commit
- [ ] `.env` added to `.gitignore`
- [ ] `.env.example` created with placeholder values
- [ ] `prisma/seed/seeded-ids.json` added to `.gitignore`
- [ ] `gitleaks` pre-commit hook installed
- [ ] `trufflehog` added to CI pipeline (PR gate + nightly)
- [ ] `helmet()` applied globally
- [ ] `cors()` configured with explicit origin list
- [ ] `express-rate-limit` on auth routes

### Before demo
- [ ] All passwords hashed with bcrypt cost 12
- [ ] JWT verify middleware on all protected routes
- [ ] Role guards on `/servicer/*` and `/admin/*`
- [ ] Ownership checks on all resource endpoints
- [ ] Input validation on all POST/PATCH routes
- [ ] No sensitive fields in logs (including API keys)
- [ ] `winston` redaction configured for tokens and API keys
- [ ] File type validation on upload routes
- [ ] EXIF stripping on photo uploads
- [ ] Action PIN verified on admin settings routes
- [ ] Action PIN rate limiting in place (`POST /admin/verify-pin` — 5/15min)
- [ ] Account lockout on failed logins
- [ ] OTP purpose isolation enforced
- [ ] Demo account login blocked when NODE_ENV=production
- [ ] Idempotency keys on all payment + withdrawal + deposit operations
- [ ] Redis idempotency storage confirmed working (test with duplicate request)
- [ ] Redis fallback to Postgres `idempotency_fallback` table if Redis is unavailable
- [ ] Socket.io JWT handshake verification
- [ ] Socket.io rooms — no global broadcasts with user data
- [ ] Job payload validation in BullMQ workers
- [ ] Audit log endpoint is read-only
- [ ] Push notifications carry no sensitive content
- [ ] PLATFORM_SETTINGS and auto-accept JSONB validated against schema on save
- [x] AI chat endpoint rate limited (per-user and platform-wide)
- [x] Chat/FAQ hierarchical tier access control — `buildSystemPrompt(role)` filters by role; `localFallback(role)` same filter (fix 2026-05-28)
- [x] Prompt-injection guard (`chatGuard.ts`) — 3-strike ban, admin unban
- [x] File upload path traversal hardened — `basename()` sanitization on `local-files.ts` (verified Semgrep 2026-05-28)
- [x] Frontend secrets hygiene verified — 70 files + 3 env files audited; zero API keys, database URLs, or backend internals leaked
- [ ] Servicer proposal submission rate limited (10/hour per servicer)
- [ ] AI provider spend caps configured in dashboards

### Before going live
- [ ] HTTPS only, HTTP redirects to HTTPS
- [ ] HSTS header via helmet
- [ ] Database not publicly accessible
- [ ] Redis not publicly accessible
- [x] `npm audit` — no critical or high vulnerabilities (fixed 2026-05-31: backend dep upgrade)
- [ ] `trufflehog` scan of git history clean
- [ ] Rate limits tuned for production traffic
- [x] `trufflehog` scan of git history — configured in CI (`pr-gate.yml` + `nightly.yml`)
- [x] Semgrep OSS scan — 134 backend+frontend files scanned (2026-05-28); 0 high/critical findings; 2 low path traversal warnings fixed
- [ ] PDPA compliance reviewed
- [ ] Data retention policy defined
- [ ] Backup and recovery tested
- [ ] Secrets rotation plan documented and practiced once
- [ ] Production API keys in secrets manager (not .env file)
- [ ] Separate API keys per environment
- [ ] AI provider data residency confirmed (cloud region)
- [ ] IP allowlisting on AI providers if supported
- [ ] Webhook signature verification (if payment gateway live)
