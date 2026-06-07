# PIN in Registration + Account Settings

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

Every servicer has a 6-digit action PIN. Used to confirm cancellations, withdrawals, admin review actions. Admin PIN already exists (`123456`). This spec adds PIN setup for servicers at registration and management in account settings.

## Current state

- `Servicer` model has `pinHash` field (from prior admin PIN work)
- `PinService` exists — `requirePin(req)` reads `x-action-pin` header, verifies bcrypt hash
- Admin uses PIN for platform settings changes (`PATCH /admin/settings`, `PATCH /admin/categories/:id`)
- **No servicer PIN** — servicers have no PIN set or verified

## Schema

No schema changes needed. `Servicer.pinHash` already exists. If a servicer has never set a PIN:
- `pinHash` is `null`
- Default PIN `123456` is assumed (checked in code, not stored in DB)

## Default PIN

Both admin and servicer default: **123456**. Hardcoded fallback when `pinHash` is null:

```typescript
// In PinService.verifyPin():
const providedHash = await bcrypt.hash(pin, 12);
const storedHash = user.pinHash;
const isValid = storedHash
  ? await bcrypt.compare(pin, storedHash)
  : pin === '123456'; // default when no PIN set
```

This means new registrations start with `123456` without needing to store it.

## Backend changes

### Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/register/servicer/pin` | Set initial PIN during registration (optional) |
| `GET` | `/servicer/account/pin-status` | Returns `{ hasPin: boolean }` |
| `PUT` | `/servicer/account/pin` | Change PIN (requires current PIN) |
| `POST` | `/servicer/account/verify-pin` | Verify PIN for cancel flow, returns `{ ok: boolean }` |

### PUT /servicer/account/pin

```typescript
validate([
  body('currentPin').isString().isLength({ min: 6, max: 6 }),
  body('newPin').isString().isLength({ min: 6, max: 6 }),
])
```

If `currentPin` matches (or is default `123456` when no hash), hash `newPin` and store on `Servicer.pinHash`.

### POST /servicer/account/verify-pin

```typescript
validate([body('pin').isString().isLength({ min: 6, max: 6 })])
```

Returns `{ ok: true }` if PIN matches, `{ ok: false }` if not. Used by the cancel flow modal.

### Registration flow

**File:** `backend/src/routes/auth.routes.ts`

Add optional PIN step to servicer registration:

```typescript
// POST /auth/register — existing endpoint. After account creation:
// If pin is provided in body:
if (body.pin) {
  const pinHash = await bcrypt.hash(body.pin, 12);
  await prisma.servicer.update({
    where: { id: newServicer.id },
    data: { pinHash },
  });
}
```

PIN field is **optional** at registration. The servicer can skip and use `123456` by default.

## Frontend changes

### Registration form

**File:** `frontend/src/app/pages/register.component.ts`

Add Step 3 (optional) to the servicer registration wizard:

```
Step 1: Account (email, password, name)     ← existing
Step 2: Business (businessName, phone, etc)  ← existing  
Step 3: Action PIN (optional)                ← NEW
```

Step 3 UI:
```
┌────────────────────────────────────────┐
│  Set your Action PIN (optional)         │
│                                         │
│  Your PIN protects cancellations        │
│  and withdrawals. Skip to use the       │
│  default: 123456.                       │
│                                         │
│  PIN (6 digits)     [••••]              │
│  Confirm PIN        [••••]              │
│                                         │
│  [Skip]              [Continue]         │
└────────────────────────────────────────┘
```

The `[Skip]` button sets no PIN on the account. `[Continue]` sends `{ pin }` in the registration body.

### Servicer Account Settings

**File:** `frontend/src/app/servicer/pages/account.component.ts`

New section below business details:

```
┌── ACTION PIN ──────────────────────────────────┐
│                                                  │
│  Your PIN is used to confirm cancellations       │
│  and withdrawals.                                │
│                                                  │
│  Status:  ● PIN set (hidden)                     │
│           ○ Using default (123456)               │
│                                                  │
│  [Change PIN]    [Verify PIN]                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

Change PIN modal:
```
┌────────────────────────────────────────┐
│  Change PIN                            │
│                                         │
│  Current PIN      [••••]               │
│  New PIN          [••••]               │
│  Confirm new PIN  [••••]               │
│                                         │
│  [Save]              [Cancel]           │
└────────────────────────────────────────┘
```

### Cancel flow integration (referenced by dispatch-overlay spec)

The cancel flow uses `PinService.requirePin()` on the backend via the existing `x-action-pin` header, or via `POST /servicer/account/verify-pin` for the new combined cancel modal.

The combined cancel modal (detailed in the dispatch-overlay spec) contains:
- Reason textarea
- PIN input
- Validates PIN via POST `/servicer/account/verify-pin` before submitting

## Files changed (summary)

| File | Change |
|------|--------|
| `backend/src/services/pin.service.ts` | Add default-PIN fallback logic |
| `backend/src/routes/auth.routes.ts` | Accept optional `pin` in registration body |
| `backend/src/routes/servicer.routes.ts` | Add `pin-status`, `change-pin`, `verify-pin` routes |
| `frontend/src/app/pages/register.component.ts` | Add Step 3: optional PIN setup |
| `frontend/src/app/servicer/pages/account.component.ts` | Add PIN section + change modal |
| `backend/tests/money.test.ts` (existing) | Not affected — PIN is separate |

## DoD

| Gate | Expected |
|------|----------|
| `npx tsc --noEmit` backend | 0 errors |
| `ng build` frontend | Exit 0 |
| Registration with PIN → stored in `pinHash` | ✅ |
| Registration without PIN → null `pinHash` → default `123456` works | ✅ |
| Change PIN modal updates hash | ✅ |
| `POST /servicer/account/verify-pin` returns correct ok/false | ✅ |
| Default PIN `123456` works for accounts with no hash | ✅ |
| `docs/ai-context/schema-notes.md` updated with `pinHash` field | ✅ |
