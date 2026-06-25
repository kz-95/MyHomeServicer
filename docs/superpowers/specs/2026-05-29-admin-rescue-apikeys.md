# Admin Rescue System + API Keys Vault

> **Spec:** Admin recovery chain (3-tier) and encrypted API key management.
> **Date:** 2026-05-29
> **Status:** Ready for Review

---

## Table of Contents

1. [Overview](#overview)
2. [Admin Identity & First-Login Flow](#admin-identity--first-login-flow)
3. [Tiered Recovery Chain](#tiered-recovery-chain)
4. [Tier 1 - Self-Service (Settings)](#tier-1--self-service-settings)
5. [Tier 2 - Backup Email OTP](#tier-2--backup-email-otp)
6. [Tier 3 - Super Admin Rescue (Break Glass)](#tier-3--super-admin-rescue-break-glass)
7. [API Keys Vault - Two-Layer Encryption](#api-keys-vault--two-layer-encryption)
8. [Backend Config Resolution](#backend-config-resolution)
9. [Admin UI Pages](#admin-ui-pages)
10. [Audit Trail](#audit-trail)
11. [Rate Limiting & Security](#rate-limiting--security)
12. [API Endpoints](#api-endpoints)
13. [Schema Additions](#schema-additions)
14. [Implementation Order](#implementation-order)

---

## Overview

Two interconnected systems that together give the platform owner full control and recovery ability:

1. **Admin Rescue System** - three-tier recovery chain so the admin can never be permanently locked out
2. **API Keys Vault** - encrypted storage of API keys in the database, managed from the admin panel

The systems share the admin identity model and audit infrastructure.

---

## Admin Identity & First-Login Flow

### Who is the admin

A single `User` record with `role: 'admin'`. The system enforces that there is exactly one admin. The detection is **role-based** (querying `role: 'admin'` in the User table), not env-var-based. The seeded `admin@demo.local` / `Demo@2026` account is treated as **unconfigured** on first login.

> Note: The existing `ADMIN_EMAILS` env var is only used for Google OAuth role detection, not for the rescue/admin identity system.

### First-login sequence (mandatory)

When an admin logs in for the first time (or after a rescue reset), the backend checks `user.passwordChangedAt IS NULL`. If null, the admin is redirected to a forced setup wizard. They cannot access any admin pages until it completes.

**Wizard order (enforced by backend):**

| Step | Action | Why this order |
|------|--------|----------------|
| 1 | Set **backup email** | Without this, losing primary email = locked out |
| 2 | Set **action PIN** | Needed before any admin operations |
| 3 | Change **password** | Must be different from default `Demo@2026` |
| 4 | Optionally change primary email | Backend sends notification to backup email |

**Gate:** If any step is incomplete, the admin's access token carries a `setupRequired: true` claim. The frontend `AdminGuard` detects this and redirects back to the wizard.

**After wizard completes:** The backend calls `POST /auth/refresh` to issue a fresh access token without the `setupRequired` flag, then the frontend navigates to the admin dashboard. If refresh fails, the admin is logged out and must log in again (the new login will issue a clean token).

### Admin email change notification

When the admin changes their primary email, an email is sent to the **backup email**:

```
Subject: [SECURITY] MyHomeServicer admin login email was changed

The admin login email was changed from <old> to <new>.

If you did not make this change, secure your account immediately.
Use the super admin rescue at <login-url> to regain access.
```

---

## Tiered Recovery Chain

```
Tier 1 - Self-service
  Admin is logged in → changes own email/password/PIN/backup email
  via settings page. All PIN-gated.

Tier 2 - Forgot password (normal recovery)
  Admin forgot password → OTP sent to configured BACKUP email
  6-digit code, 300s expiry.
  Admin must STILL have access to their backup email.

Tier 3 - Super admin rescue (BREAK GLASS)
  Admin lost everything: primary + backup email access.
  → OTP sent to hardcoded coffeeinveins@gmail.com
  → Requires typed reason (min 10 chars)
  → Uses Google Gmail API (OAuth2), not SMTP
  → 300s expiry, 6-digit code
  → Rate-limited: 1 req / 15 min / IP
  → Logged to audit trail with IP + user agent + reason
```

---

## Tier 1 - Self-Service (Settings)

### Available actions (all PIN-gated)

| Action | Endpoint | PIN required |
|--------|----------|-------------|
| Change primary email | `PATCH /admin/me/email` | Yes |
| Change password | `PATCH /admin/me/password` | Yes (old password also checked) |
| Change action PIN | `PATCH /admin/me/pin` | Yes (old PIN also checked) |
| Set/change backup email | `PATCH /admin/me/backup-email` | Yes |
| View masked backup email | `GET /admin/me/backup-email` | Yes |

### Backup email validation

- Must be different from the admin's primary email
- Must pass basic email format validation
- A verification email is sent to the new backup address on change:

```
Subject: [MyHomeServicer] Admin backup email updated

Your admin backup email has been changed to <email>.
This address will receive account recovery OTP codes.

If you did not make this change, use the super admin rescue
at <login-url> immediately.
```

---

## Tier 2 - Backup Email OTP

### Flow

```
[Admin clicks "Forgot password?" on login page]
  │
  ├─ Role check: is this the admin email? ── NO ──→ Use existing forgot-password flow
  │
  └─ YES
       │
       ├─ Does backup email exist? ── NO ──→ "No recovery email configured.
       │                                         Use the super admin rescue option below."
       │
       └─ YES
            │
            ├─ Generate 6-digit OTP
            ├─ Store in AdminOtp table (or Redis with 300s TTL)
            ├─ Send to backup email via sendEmail() (SMTP or console.log)
            │
            └─ Response: "If the email exists, an OTP has been sent."
```

### OTP verification

| Field | Value |
|-------|-------|
| OTP length | 6 digits |
| Expiry | 300 seconds (5 minutes) |
| Max attempts | 5 per IP per 15 minutes |
| Lockout | 10 failures → 1 hour lockout per email |
| On success | Issue a password-reset token (UUID), return to client |

### Password reset

Same pattern as existing `POST /auth/reset-password`:
- Token is stored on the User record (`resetToken`, `resetTokenExpiry`)
- Admin sets new password + PIN in one request
- Old OTP records are invalidated
- `passwordChangedAt` is set to now
- Backup email remains unchanged

### Reused endpoint

The existing `POST /auth/forgot-password` route is extended:
```typescript
if (email === adminEmail && !hasBackupEmail) {
  // No backup configured - show rescue option
  return res.json({
    message: '...',
    showRescueOption: true,  // frontend shows "Super admin rescue" link
  });
}
if (email === adminEmail && hasBackupEmail) {
  // Send OTP to backup email
  await sendOtpToBackupEmail(admin);
  return res.json({ message: 'If configured, an OTP has been sent.' });
}
```

---

## Tier 3 - Super Admin Rescue (Break Glass)

### Entry points

1. **Login page** - small "Lost admin access?" link visible when the email field contains `admin@demo.local` or when the forgot-password flow returns `showRescueOption: true`
2. **Direct URL** - `/auth/admin/rescue` (no auth, rate-limited)

### Flow

```
POST /auth/admin/rescue
Body: { reason: string (min 10 chars) }
Rate limit: 1 req / 15 min / IP
Audit: log IP + user agent + reason + timestamp

1. Validate reason (min 10 chars, max 500 chars)
2. Generate 6-digit OTP
3. Hash OTP with SHA-256, store hash in AdminOtp table (300s TTL)
4. Send email to coffeeinveins@gmail.com via Google Gmail API (OAuth2)

Subject: [URGENT] MyHomeServicer Admin Recovery - Action Required

Body:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MyHomeServicer - Super Admin Recovery
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A recovery request was made for the MyHomeServicer admin panel.

Reason from requester:
  <reason>

One-time recovery code: <6-digit OTP>
Expires in: 5 minutes

If you did NOT request this, secure the admin account immediately
by logging in and changing all credentials.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MyHomeServicer Security
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Why Google Gmail API (not SMTP)

SMTP requires configuring SMTP host/port/credentials - which might not be set up, or those very credentials might be locked inside the vault the admin can't access. The Gmail API uses a **separate** OAuth2 credential set stored in `.env` (not the vault), so it always works.

**Env vars for rescue email:**
```
GOOGLE_GMAIL_CLIENT_ID=
GOOGLE_GMAIL_CLIENT_SECRET=
GOOGLE_GMAIL_REFRESH_TOKEN=
```

These are the bare minimum to call `gmail.users.messages.send()` via a service account or OAuth2 client with Gmail API scope.

### Verification

Same OTP verify endpoint as Tier 2:
```
POST /auth/admin/verify-otp
Body: { email, otp: string }
→ { token: "reset-uuid" }
```

Then the same password reset endpoint:
```
POST /auth/admin/reset-password
Body: { token, newPassword, newPin }
→ { message: "Password and PIN updated." }
```

**After rescue reset:**
- `passwordChangedAt` is nulled → forces the full first-login wizard again
- Backup email is **cleared** → must be re-set in the wizard
- Vault password is **reset** → admin needs to re-enter API keys via the vault UI
- All existing refresh tokens for the admin are revoked

---

## API Keys Vault - Two-Layer Encryption

### Architecture

```
┌──────────────────────────────────────────────────┐
│                   Database                        │
│  ApiKeyConfig {                                   │
│    key: "STRIPE_SECRET_KEY"                       │
│    encryptedValue: <AES-256-GCM ciphertext>       │
│    iv: <base64 IV>                                │
│    authTag: <base64 GCM auth tag>                 │
│  }                                                │
│  Each row encrypted with SYSTEM KEY (Layer 1)     │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│          config-vault.ts (backend)                │
│                                                   │
│  BOOT:  loadVault()                              │
│         For each row:                             │
│           systemKey = HMAC-SHA256(JWT_SECRET)     │
│           plaintext = AES-256-GCM.decrypt(        │
│             encryptedValue, iv, authTag,          │
│             systemKey                             │
│           )                                       │
│         Store in in-memory Map<key, plaintext>     │
│                                                   │
│  RUNTIME: getKey("STRIPE_SECRET_KEY")             │
│           → Map value if exists, else process.env │
│                                                   │
│  UI SESSION: unlockVault(vaultPassword)           │
│           → Derive vaultKey with PBKDF2           │
│           → Store vaultKey in session memory      │
│           → Temporarily decrypt for display       │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│          Admin UI - API Keys Page                 │
│                                                   │
│  Step 1: Enter vault password (session-only)      │
│  Step 2: See all keys decrypted (masked by default)│
│  Step 3: Edit keys, click "Test" to validate     │
│  Step 4: Save → backend encrypts with system key  │
│           + re-derives from vault password        │
└──────────────────────────────────────────────────┘
```

### Layer 1 - System Key (boot-time)

| Field | Value |
|-------|-------|
| Key derivation | `HMAC-SHA256(JWT_SECRET, "admin-config-vault")` |
| Algorithm | AES-256-GCM |
| Purpose | Auto-decrypt on boot so backend uses DB-stored keys at runtime |
| Key location | Never stored - derived from JWT_SECRET on every boot |

### Layer 2 - Vault Password (UI access gate)

| Field | Value |
|-------|-------|
| Storage | bcrypt hash on `User.vaultPasswordHash` |
| Purpose | Session authorization to view/edit keys in the admin UI |
| Key location | First-time: bcrypt hash stored on User row. Subsequent: bcrypt.compare. |

The vault password is NOT an encryption layer. It is purely an **access gate** for the admin UI. If you know the vault password, the backend decrypts the stored values (Layer 1) and shows them to you. If you don't, the API returns the key names only (masked).

### How the two layers interact

1. **First visit to API Keys page:**
   - Admin sets a vault password → backend stores `bcrypt.hash(vaultPassword, 12)` on `User.vaultPasswordHash`
   - No keys are encrypted with this password - it's just authentication

2. **Subsequent visits:**
   - Admin enters vault password → backend verifies with `bcrypt.compare`
   - If correct: backend decrypts all Layer-1 values with system key, returns plaintext
   - If wrong: backend returns 401

3. **On save (admin edits keys):**
   - Admin enters vault password (to unlock)
   - Edits keys in UI → frontend sends plaintext values
   - Backend encrypts each value with system key (Layer 1), upserts to DB
   - Calls `configVault.refreshVault()` to update in-memory cache

4. **On boot:**
   - `config-vault.ts` loads all rows, decrypts with system key
   - Populates in-memory cache
   - `getKey("STRIPE_SECRET_KEY")` checks cache → `process.env` fallback
   - Runtime works regardless of whether vault password was ever set

### Vault password reset via rescue

When the super admin rescue (Tier 3) is triggered and completed:
- `User.vaultPasswordHash` is cleared (set to NULL)
- Admin goes through first-login wizard
- When admin visits API Keys page, they see: "Your vault is locked. Create a vault password to manage API keys."
- Admin sets a new vault password → new bcrypt hash stored
- All existing API key values remain in the DB (decrypted with Layer 1 system key, viewable once new vault password is set)

### DB model

```prisma
model ApiKeyConfig {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key            String   @unique // e.g. "STRIPE_SECRET_KEY", "GOOGLE_MAPS_API_KEY"
  encryptedValue String   // AES-256-GCM ciphertext, base64-encoded
  iv             String   // AES initialization vector, base64-encoded
  authTag        String   // GCM authentication tag, base64-encoded
  updatedAt      DateTime @default(now()) @updatedAt
  updatedBy      String   @db.Uuid // admin user ID
  createdAt      DateTime @default(now())
}
```

---

## Backend Config Resolution

### `lib/config-vault.ts`

```typescript
class ConfigVault {
  private cache: Map<string, string> = new Map();
  private systemKey: Buffer;

  constructor() {
    // Derive system key from JWT_SECRET
    this.systemKey = crypto.createHmac('sha256', env.JWT_SECRET)
      .update('admin-config-vault')
      .digest();
  }

  /** Load all keys from DB on boot. */
  async loadVault(): Promise<void> {
    const rows = await prisma.apiKeyConfig.findMany();
    for (const row of rows) {
      try {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          this.systemKey,
          Buffer.from(row.iv, 'base64'),
        );
        decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
        let plain = decipher.update(row.encryptedValue, 'base64', 'utf8');
        plain += decipher.final('utf8');
        this.cache.set(row.key, plain);
      } catch {
        // Failed to decrypt - skip this key (logged at warn level)
        logger.warn(`Config vault: failed to decrypt key ${row.key}`);
      }
    }
  }

  /** Get a config value: vault cache → process.env → default from env.ts */
  getKey(keyName: string): string {
    return this.cache.get(keyName) ?? process.env[keyName] ?? '';
  }

  /** Refresh cache from DB (called after admin saves edits). */
  async refreshVault(): Promise<void> {
    this.cache.clear();
    await this.loadVault();
  }
}
```

### Integration with env.ts

`env.ts` is not modified. Instead, the `ConfigVault` is a secondary source that **overlays** `process.env`. Any code that reads env vars goes through:

```typescript
// Before: env.STRIPE_SECRET_KEY
// After:  configVault.getKey('STRIPE_SECRET_KEY') || env.STRIPE_SECRET_KEY
```

A migration wrapper is added to `stripe.ts`, `s3.ts`, `geocoding.ts`, etc. - or a single `getEnv(key)` utility that checks vault first.

---

## Admin UI Pages

### Page 1: First-login wizard (`/admin/setup`)

4-step wizard (PIN-gated at step 3):
1. Enter backup email (with confirmation field)
2. Set action PIN (6 digits, confirm)
3. Change password (min 8 chars, must contain number)
4. Optionally enter vault password (or skip, can do later in API Keys page)

### Page 2: API Keys vault (`/admin/settings/api-keys`)

Two states:

**Locked state:** One input field for vault password + "Unlock" button. "Forgot vault password?" link opens a modal explaining that after Tier 3 rescue, they can create a new vault password.

**Unlocked state:** Key list grouped by category:

| Category | Keys |
|----------|------|
| Google | `GOOGLE_MAPS_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| AI | `AICHAT_LLM_API_KEY`, `AICHAT_LLM_FALLBACK_API_KEY` |
| Storage | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BASE_URL` |
| Email (SMTP) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Rescue Gmail | `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_GMAIL_REFRESH_TOKEN` |
| Admin | `ADMIN_EMAILS` |
| Other | Any additional keys in the DB that don't match above categories |

Each row:
- Key name (bold, monospace)
- Masked value (show/hide toggle as eye icon)
- "Edit" button → opens inline input
- "Test" button → runs key-specific validation (Stripe: balance check, Maps: geocode, S3: list buckets, SMTP: send test email to backup address)
- "Remove" button → deletes DB override, falls back to `.env`
- Unsaved indicator (diamond icon if value differs from last save)

**Save button:** Sends all changed values to `PUT /admin/api-keys`. Backend re-encrypts each with system key + vault key, upserts to DB, calls `configVault.refreshVault()`, logs to audit.

### Page 3: Rescue status in login page

Small "Lost admin access?" link below the login form. When clicked:
- If email field contains the admin email → "Check your backup email for an OTP" (Tier 2)
- If no backup email configured → "Use the super admin rescue option" (Tier 3)
- When email field is empty → "Enter your admin email first"

---

## Audit Trail

All key changes and rescue attempts are logged:

| Event | Audit action | Details |
|-------|-------------|---------|
| Key updated | `apikey.update` | `keyName`, `oldPrefix` (first 4 chars), `newPrefix` |
| Key removed | `apikey.delete` | `keyName` |
| Key test | `apikey.test` | `keyName`, `result: success\|failure` |
| Backup email set | `admin.backup-email.set` | Masked email |
| Tier 3 rescue triggered | `admin.rescue.triggered` | IP, user agent, reason |
| Tier 3 rescue completed | `admin.rescue.completed` | IP |
| Vault password changed | `admin.vault-password.changed` | (no passwords logged) |
| Admin password changed | `admin.password.changed` | (no passwords logged) |
| Admin PIN changed | `admin.pin.changed` | (no PINs logged) |
| Admin email changed | `admin.email.changed` | Old email prefix, new email prefix |

---

## Rate Limiting & Security

| Endpoint | Rate Limit | Lockout |
|----------|------------|---------|
| `POST /auth/admin/rescue` | 1 req / 15 min / IP | N/A |
| `POST /auth/admin/verify-otp` | 5 req / 15 min / IP | 1 hour after 10 failures |
| `POST /auth/admin/reset-password` | 3 req / 15 min / IP | N/A |
| `PUT /admin/api-keys` | 10 req / min / admin | N/A |
| `PATCH /admin/me/backup-email` | 3 req / hour / admin | N/A |
| `POST /auth/admin/forgot-password` | 2 req / hour / email | N/A |

### Additional security rules

- **OTP hashing:** OTP is SHA-256 hashed before storing. The plaintext is never persisted.
- **IP logging:** All rescue endpoint calls log IP + user agent + timestamp.
- **No user enumeration:** Rescue endpoint always returns the same message regardless of whether the admin exists.
- **Refresh token revocation:** After a rescue reset, `DELETE FROM refresh_token WHERE userId = adminId`.
- **Vault password strength:** Must be ≥ 12 chars, contain lowercase + uppercase + number.

---

## API Endpoints

### Admin Self-Service (existing routes extended)

| Method | Path | Auth | PIN | Body | Response |
|--------|------|------|-----|------|----------|
| `PATCH` | `/admin/me/email` | Admin | Yes | `{ email }` | `{ message }` |
| `PATCH` | `/admin/me/password` | Admin | Yes | `{ oldPassword, newPassword }` | `{ message }` |
| `PATCH` | `/admin/me/pin` | Admin | Yes | `{ oldPin, newPin }` | `{ message }` |
| `PATCH` | `/admin/me/backup-email` | Admin | Yes | `{ email }` | `{ message }` |
| `GET` | `/admin/me/backup-email` | Admin | Yes | - | `{ email: "co***@***.com" }` |

### Recovery / Rescue

| Method | Path | Auth | Rate Limit | Body | Response |
|--------|------|------|------------|------|----------|
| `POST` | `/auth/admin/forgot-password` | None | 2/hr/email | `{ email }` | `{ message }` |
| `POST` | `/auth/admin/rescue` | None | 1/15min/IP | `{ reason }` | `{ message, expiresIn: 300 }` |
| `POST` | `/auth/admin/verify-otp` | None | 5/15min/IP | `{ email, otp }` | `{ token }` or `{ error }` |
| `POST` | `/auth/admin/reset-password` | None | 3/15min/IP | `{ token, newPassword, newPin }` | `{ message }` |

### API Keys Vault

| Method | Path | Auth | PIN | Body | Response |
|--------|------|------|-----|------|----------|
| `GET` | `/admin/api-keys` | Admin | No | - | `{ keys: [{ key, hasValue: bool }] }` |
| `PUT` | `/admin/api-keys` | Admin | No | `{ keys: [{ key, value }] }` | `{ message, updated: string[] }` |
| `POST` | `/admin/api-keys/unlock` | Admin | No | `{ vaultPassword }` | `{ keys: [{ key, value }] }` (decrypted) |
| `POST` | `/admin/api-keys/change-vault-password` | Admin | Yes | `{ oldPassword, newPassword }` | `{ message }` |
| `POST` | `/admin/api-keys/test/:keyName` | Admin | No | - | `{ ok: bool, message }` |

---

## Schema Additions

### New models

```prisma
model ApiKeyConfig {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key            String   @unique
  encryptedValue String
  iv             String
  authTag        String
  updatedAt      DateTime @default(now()) @updatedAt
  updatedBy      String   @db.Uuid
  createdAt      DateTime @default(now())
  @@map("api_key_config")
}

model AdminOtp {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email     String   // Which email this OTP was sent to
  otpHash   String   // SHA-256 of the 6-digit OTP
  purpose   String   // "backup_recovery" | "super_admin_rescue"
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())
  @@map("admin_otp")
}
```

### User model additions

```prisma
model User {
  // ... existing fields
  passwordChangedAt DateTime?     // NULL = first login / rescue reset pending
  vaultPasswordHash String?       // bcrypt hash of vault password; NULL = vault locked
  backupEmail       String?       // Admin's configured recovery email (lowercased)
}
```

### Env additions

```
# Gmail API - used ONLY for super admin rescue (Tier 3)
# These live in .env, NOT in the API keys vault
GOOGLE_GMAIL_CLIENT_ID=
GOOGLE_GMAIL_CLIENT_SECRET=
GOOGLE_GMAIL_REFRESH_TOKEN=
```

---

## Implementation Order

The implementation is split into **three phases** for clean parallel development:

### Phase A - Schema + Rescue System (Backend-heavy)

| Step | Area | Description |
|------|------|-------------|
| A1 | Schema | Add `ApiKeyConfig`, `AdminOtp`, `User.passwordChangedAt`, `User.vaultPasswordHash`, `User.backupEmail` |
| A2 | Backend | `lib/gmail-rescue.ts` - Google Gmail API OAuth2 email sender |
| A3 | Backend | `services/admin-rescue.service.ts` - OTP generation, SHA-256 hashing, verification, password/PIN reset |
| A4 | Backend | Tier 2: extend `POST /auth/forgot-password` for admin detection + backup email OTP |
| A5 | Backend | Tier 3: `POST /auth/admin/rescue` - break glass endpoint, rate limiting, Gmail API send |
| A6 | Backend | Tier 1: admin self-service endpoints (`PATCH /admin/me/{email,password,pin,backup-email}`) |
| A7 | Backend | First-login wizard gate (`setupRequired` JWT claim, `passwordChangedAt` check in auth login) |
| A8 | Backend | Audit trail integration for all rescue/key events |

### Phase B - API Keys Vault (Backend + Frontend)

| Step | Area | Description | Depends on |
|------|------|-------------|------------|
| B1 | Backend | `lib/config-vault.ts` - system key derivation (HMAC-SHA256 from JWT_SECRET), load/refresh/get | A1 |
| B2 | Backend | `GET /admin/api-keys`, `PUT /admin/api-keys`, `POST /admin/api-keys/unlock` endpoints | B1 |
| B3 | Backend | `POST /admin/api-keys/change-vault-password` endpoint | B1 |
| B4 | Backend | `POST /admin/api-keys/test/:keyName` - per-key validation (Stripe balance, Maps geocode, S3 list, SMTP test) | B1 |
| B5 | Frontend | API Keys vault page - lock/unlock, key list grouped by category, show/hide, edit, test, save | B2-B4 |

### Phase C - Frontend UI

| Step | Area | Description | Depends on |
|------|------|-------------|------------|
| C1 | Frontend | Admin first-login wizard (4-step: backup email → PIN → password → vault password optional) | A7 |
| C2 | Frontend | Admin settings - backup email, password, PIN management | A6 |
| C3 | Frontend | Login page - "Lost admin access?" UI + rescue flow (reason input, OTP verify, reset) | A4, A5 |
| C4 | Doc | Update schema-notes.md, api-doc.md, seed-plan.md | All |
