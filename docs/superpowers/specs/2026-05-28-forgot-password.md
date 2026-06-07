# Forgot Password (Nodemailer)

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

Customers and servicers can reset their password via email. A "Forgot password?" link on the login page sends a reset link, the user clicks it and sets a new password.

## Approach

Nodemailer + Gmail SMTP App Password. Free, no API keys, works immediately.

## Backend changes

### Dependencies

```
npm install nodemailer
npm install -D @types/nodemailer
```

### Email sender lib

**New file:** `backend/src/lib/email.ts`

```typescript
import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
    // Dev fallback: log to console
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject} | Body: ${html}`);
    return;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || 'noreply@myhomeservicer.com',
    to,
    subject,
    html,
  });
}
```

### .env additions

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<brevo-login-email>
SMTP_PASS=<brevo-smtp-key>
SMTP_FROM=My Home Servicer <noreply@myhomeservicer.com>
```

### User schema

No new fields needed. Reuse existing `User` and `Servicer` models. Add `resetToken` and `resetTokenExpiry`:

```prisma
// On User model:
resetToken        String?   @unique @map("reset_token")
resetTokenExpiry  DateTime? @map("reset_token_expiry")

// On Servicer model (same fields):
resetToken        String?   @unique @map("reset_token")
resetTokenExpiry  DateTime? @map("reset_token_expiry")
```

Run `npx prisma db push` after schema change.

### Routes

**New file:** `backend/src/routes/auth.routes.ts` (add to existing)

#### POST /auth/forgot-password

```typescript
validate([body('email').isEmail()])

1. Find user by email (check both User and Servicer tables)
2. If not found, return 200 anyway (don't reveal which emails exist)
3. Generate reset token: crypto.randomUUID()
4. Set resetTokenExpiry = now + 1 hour
5. Send email with link: http://localhost:4200/auth/reset?token=<token>
6. Log: `[DEV EMAIL]` in dev mode

Response: { message: 'If the email exists, a reset link has been sent.' }
```

#### POST /auth/reset-password

```typescript
validate([
  body('token').isString().notEmpty(),
  body('newPassword').isString().isLength({ min: 8 }).matches(passwordRegex),
])

1. Find user by resetToken
2. Check resetTokenExpiry > now
3. Hash newPassword, update
4. Clear resetToken and resetTokenExpiry
5. Return { message: 'Password updated.' }
```

### Password validation

Existing regex: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$` (from CLAUDE.md / previous validation work).

## Frontend changes

### Login page

**File:** `frontend/src/app/pages/login.component.ts`

Add "Forgot password?" link below the password field:

```html
<div class="forgot-row">
  <a routerLink="/auth/forgot">Forgot password?</a>
</div>
```

### Forgot password page

**New file:** `frontend/src/app/pages/forgot-password.component.ts`

```
┌────────────────────────────────────────────┐
│  Forgot Password                           │
│                                            │
│  Enter your email and we'll send you a     │
│  reset link.                               │
│                                            │
│  Email          [____________________]     │
│                                            │
│  [Send reset link]                         │
│                                            │
│  ← Back to login                           │
└────────────────────────────────────────────┘

After submit:
┌────────────────────────────────────────────┐
│  Check your email                          │
│                                            │
│  If the email exists, a reset link has     │
│  been sent. Check your inbox and spam.     │
│                                            │
│  The link expires in 1 hour.               │
│                                            │
│  [Back to login]  [Resend]                 │
└────────────────────────────────────────────┘
```

### Reset password page

**New file:** `frontend/src/app/pages/reset-password.component.ts`

```
┌────────────────────────────────────────────┐
│  Set new password                          │
│                                            │
│  New password      [________________]     │
│  Confirm password  [________________]      │
│                                            │
│  Password must have at least 8 chars,      │
│  uppercase, lowercase, number, symbol.     │
│                                            │
│  [Reset password]                          │
│                                            │
│  ← Back to login                           │
└────────────────────────────────────────────┘
```

### Route registration

**File:** `frontend/src/app/app.routes.ts`

```typescript
{ path: 'auth/forgot', loadComponent: () => import('./pages/forgot-password.component').then(m => m.ForgotPasswordComponent) },
{ path: 'auth/reset', loadComponent: () => import('./pages/reset-password.component').then(m => m.ResetPasswordComponent) },
```

## App password setup (1-time manual step)

1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** if not already on
3. Go to **App passwords** (search in Google Account settings)
4. Select "Mail" + "Other" → name it "MyHomeServicer"
5. Copy the 16-character app password
6. Add to `.env` as `SMTP_PASS`

## DoD

| Gate | Expected |
|------|----------|
| `db push` adds `resetToken` + `resetTokenExpiry` on User + Servicer | ✅ |
| Backend `tsc --noEmit` | 0 errors |
| `ng build` frontend | Exit 0 |
| Login page shows "Forgot password?" link | ✅ |
| `/auth/forgot` → email input → shows "Check your email" | ✅ |
| Dev mode logs reset link to console (no email sent) | ✅ |
| `/auth/reset?token=xxx` shows password form | ✅ |
| Valid token + new password → password updated, login works | ✅ |
| Expired token → error message | ✅ |
| Invalid token → error message | ✅ |
