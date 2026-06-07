# Deactivate Account + _d## Suffix + 10-Strike Ban

> 2026-05-28 · Brainstorming session · ⚠️ PARTIALLY IMPLEMENTED

## Implementation status (2026-05-28)

| Area | Status | Notes |
|------|--------|-------|
| Schema: `User.active/deactivationCount/deactivatedAt` | ✅ Code written | Stale Prisma Client — needs `db push` |
| Schema: `Servicer.active/deactivationCount/deactivatedAt` | ✅ Code written | Stale Prisma Client — needs `db push` |
| Schema: `BannedEmail` model | ✅ Code written | Stale Prisma Client — needs `db push` |
| Service: `deactivate.service.ts` | ✅ Code written | 7 tsc errors (stale client + `notes` field) — see Known Issues |
| Route: `POST /user/me/deactivate` (customer) | ✅ Code written | Uses password verification |
| Route: `POST /servicer/me/deactivate` (servicer) | ✅ Code written | Uses PIN verification |
| Auth: banned email check on registration | ✅ Code written | Added to `POST /auth/register` + `register-servicer` |
| Frontend: customer deactivation UI (3-step modal) | ✅ Code written | Danger Zone section + 3-step modal in `account.component.ts` |
| Frontend: servicer deactivation UI | ❌ Not started | Needs Danger Zone section in `servicer/pages/account.component.ts` |
| Admin: banned accounts tab | ❌ Not started | Specced in `2026-05-28-admin-banned-accounts.md` |
| `db push` | ❌ Pending | Must run DLL-lock protocol |
| Tests | ❌ Not started | |

### Known issues in uncommitted code

1. **`deactivate.service.ts:21`** — `notes` field does not exist on `Booking`. Booking model has no generic `notes` column. Use existing booking cancellation flow or store the reason via `Report` model instead.
2. **`deactivate.service.ts:28,71`** — `active` field not available because Prisma Client is stale (schema not pushed). Resolves after `db push`.
3. **`deactivate.service.ts:42,84`** — `prisma.bannedEmail` not available (stale client). Resolves after `db push`.
4. **`deactivate.service.ts:30,59`** — `prisma.bannedEmail.findUnique` same stale-client issue.

**Execute order:** (1) Fix `notes` bug → (2) `db push` → (3) verify tsc → (4) build servicer deactivation UI → (5) build admin banned accounts tab → (6) test.

## Goal

Users can permanently deactivate their account. On deactivation, the email gets a `_d01` (then `_d02`...) suffix for tracking. If the same email is deactivated **10 times**, that email is permanently banned from registration.

Dependencies: requires **PIN in registration** spec (PIN for confirmation), requires **Forgot Password** spec (email notification).

## Design overview

```
User clicks "Deactivate Account" in settings

  ↓

Step 1: Confirmation warning
  "This action is permanent. Your data will be anonymized.
   You won't be able to log in again.
   Open bookings will be cancelled."

Step 2: Reason + PIN (same combined modal as cancel flow)
  [Reason textarea] + [PIN input]

Step 3: Final confirmation
  "Are you absolutely sure? Type 'DELETE' to confirm."

  ↓

Backend:
  - Email gets suffix: ahmad@gmail.com → ahmad+_d01@gmail.com
  - User.active = false
  - Increment deactivationCount on email record
  - If deactivationCount >= 10 → email added to banned_emails table
  - Send notification email: "Your account has been deactivated"
```

## Schema changes

### User model additions

```prisma
model User {
  // existing fields...
  active            Boolean   @default(true) @map("active")
  deactivationCount Int       @default(0) @map("deactivation_count")
  deactivatedAt     DateTime? @map("deactivated_at")

  @@map("users")
}
```

### New BannedEmail model

```prisma
model BannedEmail {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email        String   @unique
  reason       String?
  bannedAt     DateTime @default(now()) @map("banned_at")
  bannedBy     String?  @map("banned_by")   // admin ID if admin banned, null if auto
  deactivations Int     @default(0)          // how many deactivations triggered this

  @@map("banned_emails")
}
```

### Servicer model (same additions)

Same `active`, `deactivationCount`, `deactivatedAt` fields on `Servicer` model.

### Registration guard

In `POST /auth/register` and `POST /auth/register/servicer`:

```typescript
// Before creating account:
const banned = await prisma.bannedEmail.findUnique({ where: { email: req.body.email } });
if (banned) throw badRequest('This email has been banned and cannot register.');
```

## Backend API

### POST /user/me/deactivate

```typescript
validate([
  body('reason').isString().notEmpty().maxLength(500),
  body('pin').isString().isLength({ min: 6, max: 6 }),
])

1. Verify PIN (via PinService.requirePin() or POST /servicer/account/verify-pin equivalent for customers)
2. If PIN wrong → 401
3. Check deactivationCount
4. Generate new email with suffix: baseEmail + `_d${String(count + 1).padStart(2, '0')}` + domain
   e.g. ahmad@gmail.com → ahmad_d01@gmail.com (strips + alias, appends _d01 before @)
5. Update user: email = suffixed, active = false, deactivationCount++, deactivatedAt = now()
6. If deactivationCount + 1 >= 10 → add to BannedEmail
7. Cancel any open bookings (batch: POST /bookings/:id/cancel for each active booking)
8. Send deactivation confirmation email (via nodemailer)
9. Invalidate all sessions (clear refresh tokens)
10. Return { message: 'Account deactivated.' }
```

### Email suffix logic

```typescript
function buildDeactivatedEmail(originalEmail: string, count: number): string {
  // Strip any existing _dNN suffix (in case of re-registration edge case)
  const clean = originalEmail.replace(/[_+]d\d{2}(?=@)/, '');
  const [local, domain] = clean.split('@');
  const suffix = `_d${String(count).padStart(2, '0')}`;
  return `${local}${suffix}@${domain}`;
}
// Example: ahmad@gmail.com count=1 → ahmad_d01@gmail.com
//          ahmad_d01@gmail.com count=2 (after re-register) → ahmad_d02@gmail.com
```

### Post-deactivation behavior

- Login attempts with the original email: return generic "Account not found" (don't reveal it was deactivated)
- The suffixed email is what's stored, so normal login flow still matches nothing
- Reactivation: not supported in MVP (user creates a new account)

## Frontend changes

### Account Settings → Deactivate

**File:** `frontend/src/app/customer/pages/account.component.ts` (customer)
**File:** `frontend/src/app/servicer/pages/account.component.ts` (servicer)

New section at the bottom of account page, in a danger-palette card:

```
┌── DANGER ZONE ─────────────────────────────────┐
│                                                  │
│  Deactivate Account                              │
│                                                  │
│  This will permanently disable your account.      │
│  You won't be able to log in again.               │
│  Open bookings will be cancelled.                 │
│                                                  │
│  [Deactivate my account]  (red/danger button)     │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Step 1 — Confirmation warning

```
┌────────────────────────────────────────────┐
│  ⚠️ Deactivate your account?               │
│                                             │
│  • This action cannot be undone             │
│  • Your email will be suffixed and hidden   │
│  • You won't be able to log in again        │
│  • Open bookings will be cancelled          │
│  • Your data will be anonymized             │
│                                             │
│  [Continue]     [Cancel]                    │
└────────────────────────────────────────────┘
```

### Step 2 — Reason + PIN (combined modal)

```
┌────────────────────────────────────────────┐
│  Confirm deactivation                      │
│                                             │
│  Reason for leaving *                       │
│  ┌─────────────────────────────────────────┐│
│  │  Found another service...               ││
│  └─────────────────────────────────────────┘│
│                                             │
│  Enter your PIN                             │
│  ┌──────────────────────────┐               │
│  │  [••••]                  │               │
│  └──────────────────────────┘               │
│                                             │
│  (Customer: no PIN required, skip this)     │
│                                             │
│  [Continue]     [Cancel]                    │
└────────────────────────────────────────────┘
```

Note: PIN is only required for **servicers**. Customers don't have PINs — they use password verification instead.

### Step 3 — Final confirmation

```
┌────────────────────────────────────────────┐
│  Are you absolutely sure?                   │
│                                             │
│  Type "DELETE" to confirm:                  │
│  ┌──────────────────────────┐               │
│  │  [________]              │               │
│  └──────────────────────────┘               │
│                                             │
│  [Deactivate my account]     [Cancel]       │
└────────────────────────────────────────────┘
```

### Flow summary

```
Customer/Servicer clicks "Deactivate"
  → Warning modal [Continue] [Cancel]
    → Reason + verify (PIN for servicer, password for customer) [Continue] [Cancel]
      → Type "DELETE" to confirm [Deactivate] [Cancel]
        → POST /user/me/deactivate { reason, pin }
          → Success: auto-logout, redirect to login page with message
```

## Customer PIN alternative

Customers don't have an action PIN. For customer deactivation:
- Step 2 asks for **password** instead of PIN
- Validates via existing `POST /auth/login` logic (password check, no token issued)

## DoD

| Gate | Expected |
|------|----------|
| `db push` adds `active`, `deactivationCount`, `deactivatedAt` + `BannedEmail` model | ✅ |
| `npx tsc --noEmit` backend | 0 errors |
| `ng build` frontend | Exit 0 |
| Deactivation adds `_d01` suffix to email | ✅ |
| Re-register + deactivate again → `_d02` | ✅ |
| 10th deactivation adds email to `BannedEmail` | ✅ |
| Banned email cannot register (400 error) | ✅ |
| Login with original email → "Account not found" | ✅ |
| Active bookings cancelled on deactivation | ✅ |
| Deactivation email sent (dev mode: console log) | ✅ |
| Customer deactivation uses password, not PIN | ✅ |
| Servicer deactivation uses PIN | ✅ |
| "Type DELETE to confirm" gate works | ✅ |
