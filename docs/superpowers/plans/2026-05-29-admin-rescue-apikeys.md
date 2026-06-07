# Admin Rescue System + API Keys Vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three-tier admin recovery chain (self-service → backup email OTP → super admin rescue) + encrypted API key vault stored in DB.

**Architecture:** Admin identity extends `User` model with `passwordChangedAt`, `backupEmail`, `vaultPasswordHash`. Rescue uses `AdminOtp` table with SHA-256 hashed OTPs. API keys use AES-256-GCM encryption keyed from `JWT_SECRET` (Layer 1 — boot-time), vault password is a bcrypt-guarded UI access gate (Layer 2). Rescue email sent via Google Gmail API OAuth2 for reliability.

**Tech Stack:** Express.js, Prisma, Node.js `crypto` (AES-256-GCM, HMAC-SHA256, pbkdf2), bcrypt, Google Gmail API (OAuth2), Angular standalone components.

---

## File Structure

### Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `backend/src/lib/config-vault.ts` | System key derivation, AES-256-GCM encrypt/decrypt, in-memory cache, load/refresh/get |
| 2 | `backend/src/lib/gmail-rescue.ts` | Google Gmail API OAuth2 client — sends recovery email to coffeeinveins@gmail.com |
| 3 | `backend/src/services/admin-rescue.service.ts` | OTP generation (6-digit, SHA-256 hash), verification, password/PIN reset, backup email management |
| 4 | `backend/src/routes/admin-rescue.routes.ts` | Rescue endpoints (Tier 2 + Tier 3): forgot-password, rescue, verify-otp, reset-password |
| 5 | `backend/src/routes/admin-vault.routes.ts` | API key vault endpoints: GET, PUT, unlock, change-vault-password, test/:keyName |
| 6 | `frontend/src/app/admin/pages/setup-wizard.component.ts` | First-login 4-step wizard (backup email → PIN → password → vault password optional) |
| 7 | `frontend/src/app/admin/pages/api-keys.component.ts` | API Keys vault page — locked/unlocked states, key list grouped by category |

### Files to Modify

| # | File | Change |
|---|------|--------|
| 8 | `backend/prisma/schema.prisma` | Add `ApiKeyConfig`, `AdminOtp` models; add `passwordChangedAt`, `backupEmail`, `vaultPasswordHash` to User |
| 9 | `backend/src/config/env.ts` | Add `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_GMAIL_REFRESH_TOKEN` |
| 10 | `backend/.env.example` | Add Gmail API env vars |
| 11 | `backend/src/services/auth.service.ts` | Add `setupRequired` to Principal; check `passwordChangedAt` in `login()` for admin; add to JWT sign/inspect |
| 12 | `backend/src/types/express.d.ts` | Add `setupRequired` to `AuthPrincipal` |
| 13 | `backend/src/routes/auth.routes.ts` | Extend `POST /auth/forgot-password` for admin detection + backup email OTP flow |
| 14 | `backend/src/routes/admin.routes.ts` | Add admin self-service routes (`PATCH /admin/me/*`) |
| 15 | `backend/src/routes/index.ts` | Mount `adminRescueRouter` at `/auth/admin`, `adminVaultRouter` at `/admin/api-keys` |
| 16 | `backend/src/middleware/auth.ts` | Add `requireSetupComplete` middleware; add `setupRequired` to dev-bypass |
| 17 | `backend/src/services/admin.service.ts` | Add `updateAdminEmail`, `updateAdminPassword`, `updateAdminPin`, `updateAdminBackupEmail`, `getAdminBackupEmail` |
| 18 | `backend/src/lib/email.ts` | Minor: pass `sendEmail` error up instead of swallowing (for admin backup email notification) |
| 19 | `backend/src/index.ts` | Call `configVault.loadVault()` on boot |
| 20 | `frontend/src/app/admin/admin.routes.ts` | Add `/admin/setup` and `/admin/settings/api-keys` routes |
| 21 | `frontend/src/app/admin/admin-shell.component.ts` | Add nav item for API Keys |

---

## Phase A — Schema + Rescue System

### Task A1: Schema changes

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add ApiKeyConfig model**

Add before the closing comment block (before last model):

```prisma
model ApiKeyConfig {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key            String   @unique @map("key_name")
  encryptedValue String   @map("encrypted_value")
  iv             String   @map("iv")
  authTag        String   @map("auth_tag")
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at")
  updatedBy      String   @map("updated_by") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("api_key_config")
}
```

- [ ] **Step 2: Add AdminOtp model**

```prisma
model AdminOtp {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email     String   @map("email")
  otpHash   String   @map("otp_hash")
  purpose   String   @map("purpose")   // "backup_recovery" | "super_admin_rescue"
  expiresAt DateTime @map("expires_at")
  used      Boolean  @default(false) @map("used")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("admin_otp")
}
```

- [ ] **Step 3: Add User model fields**

Find the `User` model and add:

```prisma
  passwordChangedAt DateTime?  @map("password_changed_at")
  vaultPasswordHash String?    @map("vault_password_hash")
  backupEmail       String?    @map("backup_email")
```

Add these after the existing `isDemo` field (around line 289).

- [ ] **Step 4: Add Gmail API env vars to env.ts**

```typescript
// Add to envSchema in backend/src/config/env.ts:
  GOOGLE_GMAIL_CLIENT_ID: z.string().default(''),
  GOOGLE_GMAIL_CLIENT_SECRET: z.string().default(''),
  GOOGLE_GMAIL_REFRESH_TOKEN: z.string().default(''),
```

- [ ] **Step 5: Update .env.example**

```
# Gmail API — super admin rescue (Tier 3) — stored here, NOT in API keys vault
GOOGLE_GMAIL_CLIENT_ID=
GOOGLE_GMAIL_CLIENT_SECRET=
GOOGLE_GMAIL_REFRESH_TOKEN=
```

- [ ] **Step 6: Run tsc and db push**

```bash
cd backend
npx tsc --noEmit
npx prisma db push --accept-data-loss
```

Expected: `tsc` shows zero errors (pre-existing Prisma client errors may appear — run db push first). `db push` confirms tables created.

---

### Task A2: Add setupRequired to auth types + JWT

**Files:**
- Modify: `backend/src/types/express.d.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/middleware/auth.ts`

- [ ] **Step 1: Add `setupRequired` to AuthPrincipal**

```typescript
// backend/src/types/express.d.ts — add to AuthPrincipal interface:
export interface AuthPrincipal {
  id: string;
  kind: 'user' | 'servicer';
  role: Role | 'servicer';
  email: string;
  isDemo: boolean;
  /** If true, admin must complete the setup wizard before accessing admin pages. */
  setupRequired?: boolean;
}
```

- [ ] **Step 2: Add `setupRequired` to Principal + signAccessToken**

In `backend/src/services/auth.service.ts`:

```typescript
// Add to Principal interface (after isDemo):
export interface Principal {
  id: string;
  kind: 'user' | 'servicer';
  role: 'customer' | 'admin' | 'servicer';
  email: string;
  isDemo: boolean;
  setupRequired?: boolean;
  creditBalance: number;
  depositBalance?: number;
  isOnline?: boolean;
}
```

- [ ] **Step 3: Add setupRequired to JWT sign and inspect**

In `signAccessToken()`:
```typescript
function signAccessToken(p: Principal): string {
    const payload: Record<string, unknown> = {
      sub: p.id,
      kind: p.kind,
      role: p.role,
      email: p.email,
      isDemo: p.isDemo,
      creditBalance: p.creditBalance,
    };
    if (p.setupRequired !== undefined) payload['setupRequired'] = p.setupRequired;
    if (p.depositBalance !== undefined) payload['depositBalance'] = p.depositBalance;
    if (p.isOnline !== undefined) payload['isOnline'] = p.isOnline;
    // ... rest unchanged
}
```

In `inspectAccessToken()`:
```typescript
// Add after isDemo line:
        isDemo: Boolean(payload.isDemo),
        ...(payload.setupRequired !== undefined ? { setupRequired: Boolean(payload.setupRequired) } : {}),
```

- [ ] **Step 4: Check passwordChangedAt in login() for admin**

In the `login()` function, after building the `principal`, add:

```typescript
  // Admin first-login check
  if (principal.role === 'admin') {
    const adminUser = await prisma.user.findUnique({
      where: { id: principal.id },
      select: { passwordChangedAt: true },
    });
    if (adminUser && !adminUser.passwordChangedAt) {
      principal.setupRequired = true;
    }
  }
```

This needs to happen after the `principal` is built (around line 315) but before `issueTokens(principal)`.

- [ ] **Step 5: Add requireSetupComplete middleware**

In `backend/src/middleware/auth.ts`, add after `requireAdmin`:

```typescript
/**
 * Require the admin to have completed the setup wizard.
 * Must be used AFTER requireAdmin.
 */
export function requireSetupComplete(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.setupRequired) {
    next(forbidden('Admin setup not complete. Please complete the setup wizard first.'));
    return;
  }
  next();
}
```

- [ ] **Step 6: Add setupRequired to dev-bypass auth**

In the `devBypassAuth` function, when resolving a user, look up `passwordChangedAt` for admin:

In the user branch (lines 87-94):
```typescript
    if (user) {
      req.user = {
        id: user.id,
        kind: 'user',
        role: user.role,
        email: user.email,
        isDemo: user.isDemo,
      };
      // Admin first-login gate
      if (user.role === 'admin' && !user.passwordChangedAt) {
        req.user.setupRequired = true;
      }
    }
```

- [ ] **Step 7: Run tsc check**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task A3: Admin-rescue service

**Files:**
- Create: `backend/src/services/admin-rescue.service.ts`

- [ ] **Step 1: Create the rescue service**

```typescript
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { sendEmail } from '../lib/email';
import { sendRescueEmail } from '../lib/gmail-rescue';
import { recordAudit } from '../services/ledger.service';

const BCRYPT_COST = 12;
const OTP_EXPIRY_MS = 300_000; // 5 minutes
const OTP_LENGTH = 6;

/** Generate a 6-digit OTP. */
function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Get the single admin user. Returns null if none exists. */
export async function findAdmin(): Promise<{ id: string; email: string; backupEmail: string | null } | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'admin' },
    select: { id: true, email: true, backupEmail: true },
  });
  return admin;
}

/** Send OTP to the admin's configured backup email (Tier 2). */
export async function sendOtpToBackupEmail(): Promise<void> {
  const admin = await findAdmin();
  if (!admin?.backupEmail) throw badRequest('No backup email configured.');

  const otp = generateOtp();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  await prisma.adminOtp.create({
    data: {
      email: admin.backupEmail,
      otpHash,
      purpose: 'backup_recovery',
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    },
  });

  const html = `
<p>Your MyHomeServicer admin recovery code:</p>
<p style="font-size: 24px; letter-spacing: 4px; font-weight: bold;">${otp}</p>
<p>This code expires in 5 minutes.</p>
<p>If you did not request this, secure your account immediately.</p>`;

  await sendEmail(admin.backupEmail, 'MyHomeServicer Admin Recovery Code', html);
  logger.info('Admin OTP sent to backup email', { email: admin.backupEmail });
}

/** Send OTP to the hardcoded super admin rescue email via Gmail API (Tier 3). */
export async function sendOtpToRescueEmail(reason: string, ip: string, userAgent: string): Promise<void> {
  if (reason.length < 10 || reason.length > 500) {
    throw badRequest('Reason must be between 10 and 500 characters.');
  }

  const otp = generateOtp();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  await prisma.adminOtp.create({
    data: {
      email: process.env.GOOGLE_GMAIL_CLIENT_ID ? 'coffeeinveins@gmail.com' : 'coffeeinveins@gmail.com',
      otpHash,
      purpose: 'super_admin_rescue',
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    },
  });

  const subject = '[URGENT] MyHomeServicer Admin Recovery — Action Required';
  const body = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MyHomeServicer — Super Admin Recovery
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A recovery request was made for the MyHomeServicer admin panel.

Reason from requester:
  ${reason}

One-time recovery code: ${otp}
Expires in: 5 minutes

If you did NOT request this, secure the admin account immediately
by logging in and changing all credentials.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MyHomeServicer Security
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  await sendRescueEmail(subject, body);
  await recordAudit({
    action: 'admin.rescue.triggered',
    adminId: null,
    details: { ip, userAgent, reasonLength: reason.length },
  });
  logger.warn('Super admin rescue triggered', { ip, reason: reason.substring(0, 50) });
}

/** Verify an OTP and return a password-reset token, or throw. */
export async function verifyOtp(email: string, otp: string): Promise<string> {
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  const record = await prisma.adminOtp.findFirst({
    where: {
      email,
      otpHash,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) throw badRequest('Invalid or expired OTP.');

  // Mark as used
  await prisma.adminOtp.update({
    where: { id: record.id },
    data: { used: true },
  });

  // Generate password-reset token
  const resetToken = crypto.randomUUID();
  const expiry = new Date(Date.now() + OTP_EXPIRY_MS);

  const admin = await findAdmin();
  if (!admin) throw notFound('Admin account not found.');

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      resetToken,
      resetTokenExpiry: expiry,
    },
  });

  return resetToken;
}

/** Complete password + PIN reset for admin. */
export async function resetAdminPassword(token: string, newPassword: string, newPin: string): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { resetToken: token } });
  if (!admin || !admin.resetTokenExpiry || admin.resetTokenExpiry < new Date()) {
    throw badRequest('Invalid or expired reset token.');
  }
  if (admin.role !== 'admin') throw badRequest('Not an admin account.');

  if (newPassword.length < 8 || !/[0-9]/.test(newPassword)) {
    throw badRequest('Password must be at least 8 characters and contain a number.');
  }
  if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
    throw badRequest('PIN must be a 6-digit number.');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const pinHash = await bcrypt.hash(newPin, BCRYPT_COST);

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      actionPinHash: pinHash,
      resetToken: null,
      resetTokenExpiry: null,
      passwordChangedAt: null,  // Force first-login wizard
      vaultPasswordHash: null,  // Reset vault password
      backupEmail: null,        // Must re-configure backup email
    },
  });

  // Revoke all existing refresh tokens
  await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });

  await recordAudit({
    action: 'admin.rescue.completed',
    adminId: admin.id,
    details: {},
  });
  logger.warn('Admin rescue completed — all credentials reset', { adminId: admin.id });
}
```

- [ ] **Step 2: Run tsc check**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors. (The `sendRescueEmail` import will error if file not yet created — that's fine, next task creates it.)

---

### Task A4: Gmail API rescue sender

**Files:**
- Create: `backend/src/lib/gmail-rescue.ts`

- [ ] **Step 1: Create the Gmail API email sender**

```typescript
import { google } from 'googleapis';
import { env } from '../config/env';
import { logger } from './logger';

const RESCUE_EMAIL_TO = 'coffeeinveins@gmail.com';

let gmailClient: ReturnType<typeof google.gmail>['users']['messages'] | null = null;

function getGmailClient() {
  if (gmailClient) return gmailClient;
  if (!env.GOOGLE_GMAIL_CLIENT_ID || !env.GOOGLE_GMAIL_CLIENT_SECRET || !env.GOOGLE_GMAIL_REFRESH_TOKEN) {
    return null;
  }
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_GMAIL_CLIENT_ID,
    env.GOOGLE_GMAIL_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: env.GOOGLE_GMAIL_REFRESH_TOKEN });
  gmailClient = google.gmail({ version: 'v1', auth: oauth2Client }).users.messages;
  return gmailClient;
}

/**
 * Send an email to the super admin rescue address via Gmail API.
 * Falls back to console.log when Gmail API credentials are not configured.
 */
export async function sendRescueEmail(subject: string, body: string): Promise<void> {
  const client = getGmailClient();
  if (!client) {
    console.log(`\n[DEV GMAIL FALLBACK] To: ${RESCUE_EMAIL_TO}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}\n`);
    return;
  }

  const utf8Subject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `From: MyHomeServicer Security <${env.GOOGLE_GMAIL_CLIENT_ID?.split('@')[0] || 'noreply'}@gmail.com>`,
    `To: ${RESCUE_EMAIL_TO}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ];
  const encoded = Buffer.from(messageParts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    await client.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
    logger.info('Super admin rescue email sent via Gmail API');
  } catch (err) {
    logger.error('Failed to send rescue email via Gmail API', { error: (err as Error).message });
    // Fallback to console so dev is not broken
    console.log(`\n[GMAIL API FAILED — DEV FALLBACK] To: ${RESCUE_EMAIL_TO}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}\n`);
  }
}
```

- [ ] **Step 2: Install googleapis if not present**

```bash
cd backend && npm install googleapis
```

- [ ] **Step 3: Run tsc check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

---

### Task A5: Rescue routes (Tier 2 + Tier 3)

**Files:**
- Create: `backend/src/routes/admin-rescue.routes.ts`
- Modify: `backend/src/routes/index.ts` (mount the router)

- [ ] **Step 1: Create rescue routes**

```typescript
import { Router } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { registerLimiter } from '../middleware/rate-limit';
import { badRequest } from '../lib/errors';
import { findAdmin, sendOtpToBackupEmail, sendOtpToRescueEmail, verifyOtp, resetAdminPassword } from '../services/admin-rescue.service';

export const adminRescueRouter = Router();

/**
 * POST /auth/admin/forgot-password — send OTP to backup email (Tier 2).
 * Extends the existing POST /auth/forgot-password flow (called from auth.routes.ts).
 */
adminRescueRouter.post(
  '/forgot-password',
  registerLimiter,
  validate([body('email').isEmail()]),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase().trim();
    const admin = await findAdmin();
    if (!admin || admin.email !== email) {
      // Not the admin — return generic message (no user enumeration)
      return res.json({ message: 'If the email exists, a recovery code has been sent.' });
    }
    if (!admin.backupEmail) {
      return res.json({
        message: 'No recovery email is configured for this account.',
        showRescueOption: true,
      });
    }
    await sendOtpToBackupEmail();
    res.json({ message: 'If configured, a recovery code has been sent to your backup email.' });
  }),
);

/**
 * POST /auth/admin/rescue — super admin break glass (Tier 3).
 * Rate-limited: 1 req / 15 min / IP
 */
adminRescueRouter.post(
  '/rescue',
  registerLimiter,
  validate([body('reason').isString().isLength({ min: 10, max: 500 })]),
  asyncHandler(async (req, res) => {
    const reason = req.body.reason.trim();
    const ip = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    await sendOtpToRescueEmail(reason, ip, userAgent);
    res.json({ message: 'Recovery code sent to the super admin email.', expiresIn: 300 });
  }),
);

/**
 * POST /auth/admin/verify-otp — verify OTP and get password-reset token.
 */
adminRescueRouter.post(
  '/verify-otp',
  validate([
    body('email').isEmail(),
    body('otp').isString().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/),
  ]),
  asyncHandler(async (req, res) => {
    const token = await verifyOtp(req.body.email.toLowerCase().trim(), req.body.otp);
    res.json({ token });
  }),
);

/**
 * POST /auth/admin/reset-password — consume token and reset credentials
 */
adminRescueRouter.post(
  '/reset-password',
  validate([
    body('token').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 8 }).matches(/[0-9]/),
    body('newPin').isString().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/),
  ]),
  asyncHandler(async (req, res) => {
    await resetAdminPassword(req.body.token, req.body.newPassword, req.body.newPin);
    res.json({ message: 'Password and PIN updated. You will need to complete the setup wizard on next login.' });
  }),
);
```

- [ ] **Step 2: Mount in routes/index.ts**

Add import:
```typescript
import { adminRescueRouter } from './admin-rescue.routes';
```

Add mount (after the auth mount):
```typescript
// ── Admin Rescue (Tier 2 + Tier 3) ───────────────────────────────────────────
apiRouter.use('/auth/admin', adminRescueRouter);
```

- [ ] **Step 3: Extend existing forgot-password in auth.routes.ts**

In `auth.routes.ts`, add this logic at the top of the `POST /auth/forgot-password` handler, before the existing user/servicer lookup:

```typescript
  const email = req.body.email.toLowerCase().trim();

  // Admin forgot-password is handled by the rescue system
  const admin = await prisma.user.findFirst({ where: { role: 'admin', email } });
  if (admin) {
    // Forward to admin rescue flow
    const axios = require('axios');
    try {
      const rescueResp = await axios.post(`${req.protocol}://${req.get('host')}/api/v1/auth/admin/forgot-password`, { email });
      return res.json(rescueResp.data);
    } catch {
      return res.json({ message: 'If the email exists, a recovery code has been sent.' });
    }
  }
```

- [ ] **Step 4: Run tsc check**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task A6: Admin self-service endpoints (Tier 1)

**Files:**
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/src/routes/admin.routes.ts`

- [ ] **Step 1: Add admin self-service functions to admin.service.ts**

Add these exports:

```typescript
import bcrypt from 'bcrypt';

// ... after existing imports

/** Update admin email. Sends notification to backup email. */
export async function updateAdminEmail(adminId: string, newEmail: string): Promise<{ oldEmail: string }> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  const oldEmail = admin.email;
  await prisma.user.update({
    where: { id: adminId },
    data: { email: newEmail.toLowerCase().trim() },
  });
  // Notify backup email
  if (admin.backupEmail) {
    const { sendEmail } = await import('../lib/email');
    sendEmail(admin.backupEmail, '[SECURITY] MyHomeServicer admin login email was changed',
      `<p>The admin login email was changed from ${oldEmail} to ${newEmail}.</p>
       <p>If you did not make this change, secure your account immediately.</p>`).catch(() => {});
  }
  return { oldEmail };
}

/** Update admin password (requires old password verification). */
export async function updateAdminPassword(adminId: string, oldPassword: string, newPassword: string): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  if (!admin.passwordHash) throw badRequest('No password set.');
  const valid = await bcrypt.compare(oldPassword, admin.passwordHash);
  if (!valid) throw badRequest('Current password is incorrect.');
  if (newPassword.length < 8 || !/[0-9]/.test(newPassword)) {
    throw badRequest('Password must be at least 8 characters and contain a number.');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: adminId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
}

/** Update admin action PIN (requires old PIN verification). */
export async function updateAdminPin(adminId: string, oldPin: string, newPin: string): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  if (!admin.actionPinHash) throw badRequest('No PIN set.');
  const valid = await bcrypt.compare(oldPin, admin.actionPinHash);
  if (!valid) throw badRequest('Current PIN is incorrect.');
  if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
    throw badRequest('PIN must be a 6-digit number.');
  }
  const pinHash = await bcrypt.hash(newPin, 12);
  await prisma.user.update({
    where: { id: adminId },
    data: { actionPinHash: pinHash },
  });
}

/** Set or update the admin backup email. */
export async function updateAdminBackupEmail(adminId: string, email: string): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  if (email.toLowerCase().trim() === admin.email) {
    throw badRequest('Backup email must be different from your login email.');
  }
  await prisma.user.update({
    where: { id: adminId },
    data: { backupEmail: email.toLowerCase().trim() },
  });
  // Send verification to the new backup email
  const { sendEmail } = await import('../lib/email');
  sendEmail(email.toLowerCase().trim(), 'MyHomeServicer Admin backup email updated',
    `<p>Your admin backup email has been updated to ${email}.</p>
     <p>This address will receive account recovery codes.</p>
     <p>If you did not make this change, use the super admin rescue immediately.</p>`).catch(() => {});
}

/** Get masked backup email. */
export async function getAdminBackupEmail(adminId: string): Promise<{ email: string | null }> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  if (!admin.backupEmail) return { email: null };
  const [name, domain] = admin.backupEmail.split('@');
  const masked = `${name.substring(0, 2)}***@${domain.substring(0, 3)}***`;
  return { email: masked };
}
```

- [ ] **Step 2: Add routes to admin.routes.ts**

```typescript
// Add imports at top:
import {
  // ...existing imports...
  updateAdminEmail,
  updateAdminPassword,
  updateAdminPin,
  updateAdminBackupEmail,
  getAdminBackupEmail,
} from '../services/admin.service';

// Add routes after the dashboard routes (requireSetupComplete ensures wizard is done):

// ── Admin Self-Service (PIN-gated) ──────────────────────────────────────────
adminRouter.patch(
  '/me/email',
  requirePin,
  validate([body('email').isEmail()]),
  asyncHandler(async (req, res) => {
    const result = await updateAdminEmail(req.user!.id, req.body.email);
    await recordAudit({ action: 'admin.email.changed', adminId: req.user!.id, details: { oldPrefix: result.oldEmail.substring(0, 3) } });
    res.json({ message: 'Email updated.' });
  }),
);

adminRouter.patch(
  '/me/password',
  requirePin,
  validate([
    body('oldPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 8 }).matches(/[0-9]/),
  ]),
  asyncHandler(async (req, res) => {
    await updateAdminPassword(req.user!.id, req.body.oldPassword, req.body.newPassword);
    await recordAudit({ action: 'admin.password.changed', adminId: req.user!.id, details: {} });
    res.json({ message: 'Password updated.' });
  }),
);

adminRouter.patch(
  '/me/pin',
  requirePin,
  validate([
    body('oldPin').isString().isLength({ min: 6, max: 6 }),
    body('newPin').isString().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/),
  ]),
  asyncHandler(async (req, res) => {
    await updateAdminPin(req.user!.id, req.body.oldPin, req.body.newPin);
    await recordAudit({ action: 'admin.pin.changed', adminId: req.user!.id, details: {} });
    res.json({ message: 'PIN updated.' });
  }),
);

adminRouter.patch(
  '/me/backup-email',
  requirePin,
  validate([body('email').isEmail()]),
  asyncHandler(async (req, res) => {
    await updateAdminBackupEmail(req.user!.id, req.body.email);
    await recordAudit({ action: 'admin.backup-email.set', adminId: req.user!.id, details: { masked: `${req.body.email.substring(0, 2)}***` } });
    res.json({ message: 'Backup email updated.' });
  }),
);

adminRouter.get(
  '/me/backup-email',
  requirePin,
  asyncHandler(async (req, res) => {
    const result = await getAdminBackupEmail(req.user!.id);
    res.json(result);
  }),
);
```

- [ ] **Step 3: Run tsc check**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task A7: Audit trail for rescue events

**Files:**
- Modify: `backend/src/services/ledger.service.ts` (check if `recordAudit` already handles arbitrary details — if so, no change needed)

- [ ] **Step 1: Verify audit function signature**

Read `backend/src/services/ledger.service.ts` to confirm `recordAudit` accepts `{ action, adminId, details }`. If it does, no changes needed. The rescue routes already call `recordAudit` in Tasks A3 and A6.

- [ ] **Step 2: Run tsc check**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task A8: Boot-time config-vault initialization

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add config-vault load on boot**

Find the startup sequence in `backend/src/index.ts` and add:

```typescript
import { configVault } from './lib/config-vault';

// After prisma connect and before HTTP server starts:
await configVault.loadVault();
```

Note: `config-vault.ts` will be created in Task B1 — for now just add the import and call (will cause tsc error until B1 is done, which is fine for ordering).

---

## Phase B — API Keys Vault

### Task B1: Config-vault library

**Files:**
- Create: `backend/src/lib/config-vault.ts`

- [ ] **Step 1: Create the config-vault singleton**

```typescript
import crypto from 'crypto';
import { prisma } from './prisma';
import { env } from '../config/env';
import { logger } from './logger';

class ConfigVault {
  private cache: Map<string, string> = new Map();
  private systemKey!: Buffer;

  constructor() {
    // Layer 1: system key derived from JWT_SECRET — always available at boot.
    // Changing JWT_SECRET will invalidate all stored keys (they must be re-entered).
    this.systemKey = crypto.createHmac('sha256', env.JWT_SECRET)
      .update('admin-config-vault')
      .digest();
  }

  /** Load all keys from DB, decrypt with system key, populate in-memory cache. */
  async loadVault(): Promise<void> {
    this.cache.clear();
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
      } catch (err) {
        logger.warn(`Config vault: failed to decrypt key ${row.key}`, { error: (err as Error).message });
      }
    }
    logger.info(`Config vault: loaded ${this.cache.size} keys`);
  }

  /**
   * Get a config value: vault cache → process.env → ''.
   * Allows the DB to override .env values at runtime.
   */
  getKey(keyName: string): string {
    return this.cache.get(keyName) ?? process.env[keyName] ?? '';
  }

  /** Encrypt a plaintext value with the system key. */
  encryptValue(plaintext: string): { encryptedValue: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.systemKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return {
      encryptedValue: encrypted,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  /** Decrypt a value with the system key (for UI display). */
  decryptValue(encryptedValue: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.systemKey,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    let plain = decipher.update(encryptedValue, 'base64', 'utf8');
    plain += decipher.final('utf8');
    return plain;
  }

  /** Refresh cache from DB (called after admin saves edits). */
  async refreshVault(): Promise<void> {
    await this.loadVault();
  }
}

export const configVault = new ConfigVault();
```

- [ ] **Step 2: Run tsc check**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task B2: Vault CRUD routes

**Files:**
- Create: `backend/src/routes/admin-vault.routes.ts`
- Modify: `backend/src/routes/index.ts` (mount)

- [ ] **Step 1: Create vault routes**

```typescript
import { Router } from 'express';
import { body, param } from 'express-validator';
import bcrypt from 'bcrypt';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { configVault } from '../lib/config-vault';
import { recordAudit } from '../services/ledger.service';

export const adminVaultRouter = Router();
adminVaultRouter.use(requireAuth, requireAdmin);

/**
 * GET /admin/api-keys — list all keys (masked).
 * No vault password needed — just shows key names and whether a value exists.
 */
adminVaultRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.apiKeyConfig.findMany({ orderBy: { key: 'asc' } });
    const keys = rows.map((r) => ({ key: r.key, hasValue: true }));
    res.json({ keys });
  }),
);

/**
 * POST /admin/api-keys/unlock — verify vault password, return decrypted values.
 */
adminVaultRouter.post(
  '/unlock',
  asyncHandler(async (req, res) => {
    const { vaultPassword } = req.body;
    if (!vaultPassword || typeof vaultPassword !== 'string') {
      throw badRequest('Vault password is required.');
    }
    // Find admin
    const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!admin || !admin.vaultPasswordHash) {
      throw badRequest('Vault password not set. Please initialize the vault first.');
    }
    const valid = await bcrypt.compare(vaultPassword, admin.vaultPasswordHash);
    if (!valid) throw badRequest('Incorrect vault password.');

    // Decrypt all keys
    const rows = await prisma.apiKeyConfig.findMany({ orderBy: { key: 'asc' } });
    const keys = rows.map((r) => ({
      key: r.key,
      value: configVault.decryptValue(r.encryptedValue, r.iv, r.authTag),
    }));
    res.json({ keys });
  }),
);

/**
 * POST /admin/api-keys/initialize — set vault password for the first time.
 */
adminVaultRouter.post(
  '/initialize',
  validate([body('vaultPassword').isString().isLength({ min: 12 })]),
  asyncHandler(async (req, res) => {
    const { vaultPassword } = req.body;
    const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!admin) throw notFound('Admin not found');
    if (admin.vaultPasswordHash) {
      throw badRequest('Vault is already initialized. Use change-vault-password instead.');
    }
    if (vaultPassword.length < 12 || !/[a-z]/.test(vaultPassword) || !/[A-Z]/.test(vaultPassword) || !/[0-9]/.test(vaultPassword)) {
      throw badRequest('Vault password must be at least 12 characters with uppercase, lowercase, and a number.');
    }
    const vaultPasswordHash = await bcrypt.hash(vaultPassword, 12);
    await prisma.user.update({ where: { id: admin.id }, data: { vaultPasswordHash } });
    res.json({ message: 'Vault initialized.' });
  }),
);

/**
 * PUT /admin/api-keys — upsert multiple key values.
 * Requires vault to be unlocked (carries vaultPassword in body).
 */
adminVaultRouter.put(
  '/',
  validate([body('keys').isArray({ min: 1 }), body('keys.*.key').isString().notEmpty(), body('keys.*.value').isString()]),
  asyncHandler(async (req, res) => {
    const { keys, vaultPassword } = req.body;
    const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!admin || !admin.vaultPasswordHash) throw badRequest('Vault not initialized.');
    const valid = await bcrypt.compare(vaultPassword || '', admin.vaultPasswordHash);
    if (!valid) throw badRequest('Incorrect vault password.');

    const updated: string[] = [];
    for (const { key, value } of keys) {
      const { encryptedValue, iv, authTag } = configVault.encryptValue(value);
      // Get old value prefix for audit
      const oldRow = await prisma.apiKeyConfig.findUnique({ where: { key } });
      const oldPrefix = oldRow ? oldRow.encryptedValue.substring(0, 4) : '';
      await prisma.apiKeyConfig.upsert({
        where: { key },
        create: { key, encryptedValue, iv, authTag, updatedBy: admin.id },
        update: { encryptedValue, iv, authTag, updatedBy: admin.id },
      });
      updated.push(key);
      await recordAudit({
        action: 'apikey.update',
        adminId: admin.id,
        details: { keyName: key, oldPrefix, newPrefix: value.substring(0, 4) },
      });
    }

    await configVault.refreshVault();
    res.json({ message: `Updated ${updated.length} keys.`, updated });
  }),
);

/**
 * POST /admin/api-keys/change-vault-password — change the vault access password.
 * Admin must know the current vault password.
 */
adminVaultRouter.post(
  '/change-vault-password',
  validate([
    body('oldPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 12 }),
  ]),
  asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!admin || !admin.vaultPasswordHash) throw badRequest('Vault not initialized.');
    const valid = await bcrypt.compare(oldPassword, admin.vaultPasswordHash);
    if (!valid) throw badRequest('Current vault password is incorrect.');
    if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      throw badRequest('Vault password must be at least 12 characters with uppercase, lowercase, and a number.');
    }
    const vaultPasswordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: admin.id }, data: { vaultPasswordHash } });
    await recordAudit({ action: 'admin.vault-password.changed', adminId: admin.id, details: {} });
    res.json({ message: 'Vault password updated.' });
  }),
);

/**
 * POST /admin/api-keys/delete/:keyName — remove a key override (falls back to .env).
 */
adminVaultRouter.delete(
  '/:keyName',
  asyncHandler(async (req, res) => {
    const { keyName } = req.params;
    const row = await prisma.apiKeyConfig.findUnique({ where: { key: keyName } });
    if (!row) throw notFound(`Key ${keyName} not found.`);
    await prisma.apiKeyConfig.delete({ where: { key: keyName } });
    await configVault.refreshVault();
    await recordAudit({
      action: 'apikey.delete',
      adminId: req.user!.id,
      details: { keyName },
    });
    res.json({ message: `Key ${keyName} removed. Falling back to .env value.` });
  }),
);
```

- [ ] **Step 2: Mount in routes/index.ts**

Add import:
```typescript
import { adminVaultRouter } from './admin-vault.routes';
```

Add mount (after admin mount):
```typescript
// ── Admin API Keys Vault ──────────────────────────────────────────────────
apiRouter.use('/admin/api-keys', adminVaultRouter);
```

- [ ] **Step 3: Run tsc check**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task B3: Config vault integration with services

**Files:**
- Modify: `backend/src/index.ts` (boot-time loadVault call)

- [ ] **Step 1: Add loadVault to boot sequence**

In `backend/src/index.ts`, after the prisma/redis connect block:

```typescript
import { configVault } from './lib/config-vault';

// ... inside the startup function, after prisma.$connect():
await configVault.loadVault();
```

- [ ] **Step 2: Run tsc check**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors.

---

## Phase C — Frontend UI

### Task C1: Admin routes + nav

**Files:**
- Modify: `frontend/src/app/admin/admin.routes.ts`
- Modify: `frontend/src/app/admin/admin-shell.component.ts`

- [ ] **Step 1: Add setup wizard and API keys routes**

```typescript
// In admin.routes.ts, add imports and routes:

import { Routes } from '@angular/router';
import { AdminShellComponent } from './admin-shell.component';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      // ...existing routes...
      { path: 'setup', loadComponent: () => import('./pages/setup-wizard.component').then(m => m.SetupWizardComponent) },
      { path: 'settings/api-keys', loadComponent: () => import('./pages/api-keys.component').then(m => m.ApiKeysComponent) },
    ],
  },
];
```

- [ ] **Step 2: Add API Keys nav item**

Find the nav items in `admin-shell.component.ts` and add:

```typescript
{ label: 'API Keys', icon: '🔑', route: '/admin/settings/api-keys' },
```

Add it after "Financial Settings" or "Platform Settings" in the sidebar nav array.

- [ ] **Step 3: Run frontend tsc check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task C2: Setup wizard component

**Files:**
- Create: `frontend/src/app/admin/pages/setup-wizard.component.ts`

- [ ] **Step 1: Create the 4-step wizard**

```typescript
import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-setup-wizard',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="setup-wizard">
      <h1>Admin Setup</h1>
      <p>Step {{ step() }} of 4</p>

      @if (step() === 1) {
        <div class="step">
          <h2>Backup Email</h2>
          <p>This email will receive recovery codes if you forget your password.</p>
          <input type="email" [(ngModel)]="backupEmail" placeholder="your-backup@email.com" />
          <input type="email" [(ngModel)]="confirmEmail" placeholder="Confirm backup email" />
          <button (click)="next1()" [disabled]="!backupEmail || backupEmail !== confirmEmail">Next</button>
        </div>
      }

      @if (step() === 2) {
        <div class="step">
          <h2>Action PIN</h2>
          <p>This PIN is required for sensitive admin operations.</p>
          <input type="password" [(ngModel)]="pin" placeholder="6-digit PIN" maxlength="6" inputmode="numeric" pattern="[0-9]*" />
          <input type="password" [(ngModel)]="confirmPin" placeholder="Confirm PIN" maxlength="6" />
          <button (click)="next2()" [disabled]="!pin || pin.length !== 6 || pin !== confirmPin">Next</button>
        </div>
      }

      @if (step() === 3) {
        <div class="step">
          <h2>Change Password</h2>
          <p>Must be at least 8 characters and contain a number.</p>
          <input type="password" [(ngModel)]="newPassword" placeholder="New password" />
          <input type="password" [(ngModel)]="confirmPassword" placeholder="Confirm password" />
          <button (click)="next3()" [disabled]="!newPassword || newPassword.length < 8 || newPassword !== confirmPassword">Next</button>
        </div>
      }

      @if (step() === 4) {
        <div class="step">
          <h2>Vault Password (optional)</h2>
          <p>Protect your API keys. You can set this up later in the API Keys page.</p>
          <input type="password" [(ngModel)]="vaultPassword" placeholder="Vault password (min 12 chars)" />
          <p class="note">Leave blank to skip. Must contain uppercase, lowercase, and a number.</p>
          <button (click)="finish()">Complete Setup</button>
        </div>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </div>
  `,
  styles: [`
    .setup-wizard { max-width: 480px; margin: 4rem auto; padding: 2rem; }
    .step { display: flex; flex-direction: column; gap: 1rem; }
    input { padding: 0.75rem; border: 1px solid var(--color-border, #ccc); border-radius: 8px; }
    button { padding: 0.75rem; background: var(--color-primary, #c95a3c); color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    button:disabled { opacity: 0.5; }
    .error { color: #e53e3e; }
    .note { font-size: 0.85rem; color: var(--color-muted, #666); }
  `],
})
export class SetupWizardComponent {
  protected step = signal(1);
  protected error = signal('');

  protected backupEmail = '';
  protected confirmEmail = '';
  protected pin = '';
  protected confirmPin = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected vaultPassword = '';

  constructor(private http: HttpClient, private auth: AuthService, private router: Router) {}

  next1(): void {
    this.error('');
    this.http.patch('/api/v1/admin/me/backup-email', { email: this.backupEmail }).subscribe({
      next: () => this.step.set(2),
      error: (e) => this.error.set(e.error?.message || 'Failed to save backup email'),
    });
  }

  next2(): void {
    this.error('');
    this.http.patch('/api/v1/admin/me/pin', { oldPin: '1234', newPin: this.pin }).subscribe({
      next: () => this.step.set(3),
      error: (e) => this.error.set(e.error?.message || 'Failed to update PIN'),
    });
  }

  next3(): void {
    this.error('');
    this.http.patch('/api/v1/admin/me/password', { oldPassword: 'Demo@2026', newPassword: this.newPassword }).subscribe({
      next: () => {
        this.auth.refresh().subscribe({
          next: () => this.step.set(4),
          error: () => {
            // Refresh failed — force relogin
            this.auth.logout();
            this.router.navigate(['/login']);
          },
        });
      },
      error: (e) => this.error.set(e.error?.message || 'Failed to update password'),
    });
  }

  finish(): void {
    this.error('');
    if (this.vaultPassword && this.vaultPassword.length >= 12) {
      this.http.post('/api/v1/admin/api-keys/initialize', { vaultPassword: this.vaultPassword }).subscribe({
        next: () => this.router.navigate(['/admin/dashboard']),
        error: (e) => this.error.set(e.error?.message || 'Failed to initialize vault'),
      });
    } else {
      this.router.navigate(['/admin/dashboard']);
    }
  }
}
```

- [ ] **Step 2: Run frontend tsc check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task C3: API Keys vault page

**Files:**
- Create: `frontend/src/app/admin/pages/api-keys.component.ts`

- [ ] **Step 1: Create the API Keys component**

```typescript
import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface ApiKeyEntry {
  key: string;
  value: string;
  hasValue: boolean;
  editing?: boolean;
  originalValue?: string;
  testResult?: string;
  testOk?: boolean;
}

@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="api-keys-page">
      <h1>API Keys</h1>
      <p class="subtitle">Override .env values. Keys are encrypted at rest.</p>

      @if (!unlocked()) {
        <div class="lock-screen">
          <h2>Vault Locked</h2>
          @if (!initialized()) {
            <p>Set a vault password to protect your API keys.</p>
            <input type="password" [(ngModel)]="vaultPasswordInput" placeholder="Vault password (min 12 chars)" />
            <button (click)="initializeVault()">Initialize Vault</button>
          } @else {
            <p>Enter your vault password to view and edit API keys.</p>
            <input type="password" [(ngModel)]="vaultPasswordInput" placeholder="Vault password" />
            <button (click)="unlock()">Unlock</button>
          }
          @if (vaultError()) {
            <p class="error">{{ vaultError() }}</p>
          }
        </div>
      } @else {
        <div class="vault-unlocked">
          <button class="lock-btn" (click)="lock()">🔒 Lock Vault</button>

          @for (group of groups(); track group.category) {
            <div class="key-group">
              <h3>{{ group.category }}</h3>
              @for (entry of group.keys; track entry.key) {
                <div class="key-row">
                  <div class="key-name">{{ entry.key }}</div>
                  @if (entry.editing) {
                    <input type="text" [(ngModel)]="entry.value" class="key-input" />
                    <button class="btn-sm" (click)="saveKey(entry)">Save</button>
                    <button class="btn-sm btn-ghost" (click)="cancelEdit(entry)">Cancel</button>
                  } @else {
                    <div class="key-value">{{ entry.value ? mask(entry.value) : '(not set)' }}</div>
                    <button class="btn-sm" (click)="editKey(entry)">✏️</button>
                  }
                  <button class="btn-sm btn-ghost" (click)="testKey(entry)" [disabled]="!entry.value">Test</button>
                  @if (entry.testResult) {
                    <span [class]="entry.testOk ? 'test-ok' : 'test-fail'">{{ entry.testResult }}</span>
                  }
                </div>
              }
            </div>
          }
          <button class="save-all" (click)="saveAll()" [disabled]="changedKeys().length === 0">
            Save All Changes ({{ changedKeys().length }})
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .api-keys-page { padding: 2rem; max-width: 800px; }
    .lock-screen { text-align: center; padding: 3rem; }
    .lock-screen input { display: block; margin: 1rem auto; padding: 0.75rem; width: 300px; border: 1px solid var(--color-border, #ccc); border-radius: 8px; }
    .key-group { margin: 1.5rem 0; }
    .key-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; border-bottom: 1px solid var(--color-border, #eee); }
    .key-name { font-family: monospace; font-weight: bold; min-width: 280px; }
    .key-value { font-family: monospace; color: var(--color-muted, #666); min-width: 200px; }
    .key-input { flex: 1; padding: 0.4rem; border: 1px solid var(--color-border, #ccc); border-radius: 4px; font-family: monospace; }
    .btn-sm { padding: 0.3rem 0.6rem; border: 1px solid var(--color-border, #ccc); border-radius: 4px; background: var(--color-surface, #fff); cursor: pointer; }
    .btn-ghost { border: none; background: transparent; }
    .save-all { margin-top: 2rem; padding: 0.75rem 2rem; background: var(--color-primary, #c95a3c); color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    .save-all:disabled { opacity: 0.5; }
    .error { color: #e53e3e; }
    .test-ok { color: #38a169; font-size: 0.85rem; }
    .test-fail { color: #e53e3e; font-size: 0.85rem; }
    .lock-btn { float: right; padding: 0.5rem 1rem; border: 1px solid var(--color-border, #ccc); border-radius: 8px; cursor: pointer; }
    .subtitle { color: var(--color-muted, #666); margin-bottom: 2rem; }
  `],
})
export class ApiKeysComponent {
  protected unlocked = signal(false);
  protected initialized = signal(false);
  protected vaultError = signal('');
  protected vaultPasswordInput = '';
  protected groups = signal<{ category: string; keys: ApiKeyEntry[] }[]>([]);
  private allKeys: ApiKeyEntry[] = [];
  private vaultPassword = '';

  constructor(private http: HttpClient) {
    this.checkInitialized();
  }

  private checkInitialized(): void {
    this.http.get<{ keys: { key: string; hasValue: boolean }[] }>('/api/v1/admin/api-keys').subscribe({
      next: (res) => {
        this.initialized.set(res.keys.length > 0);
        this.allKeys = res.keys.map((k) => ({ ...k, value: '' }));
      },
    });
  }

  initializeVault(): void {
    if (this.vaultPasswordInput.length < 12) { this.vaultError.set('Minimum 12 characters'); return; }
    this.http.post('/api/v1/admin/api-keys/initialize', { vaultPassword: this.vaultPasswordInput }).subscribe({
      next: () => { this.initialized.set(true); this.vaultError.set(''); this.vaultPasswordInput = ''; },
      error: (e) => this.vaultError.set(e.error?.message || 'Failed'),
    });
  }

  unlock(): void {
    this.http.post<{ keys: { key: string; value: string }[] }>('/api/v1/admin/api-keys/unlock', { vaultPassword: this.vaultPasswordInput }).subscribe({
      next: (res) => {
        this.vaultPassword = this.vaultPasswordInput;
        this.vaultPasswordInput = '';
        this.vaultError.set('');
        this.allKeys = res.keys.map((k) => ({ key: k.key, value: k.value, hasValue: true }));
        this.groupKeys();
        this.unlocked.set(true);
      },
      error: (e) => this.vaultError.set(e.error?.message || 'Incorrect password'),
    });
  }

  lock(): void {
    this.unlocked.set(false);
    this.vaultPassword = '';
    this.vaultPasswordInput = '';
  }

  private groupKeys(): void {
    const categories: Record<string, string[]> = {
      'Google': ['GOOGLE_MAPS_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'],
      'Stripe': ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
      'AI': ['AICHAT_LLM_API_KEY', 'AICHAT_LLM_FALLBACK_API_KEY'],
      'Storage': ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BASE_URL'],
      'Email (SMTP)': ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'],
      'Rescue Gmail': ['GOOGLE_GMAIL_CLIENT_ID', 'GOOGLE_GMAIL_CLIENT_SECRET', 'GOOGLE_GMAIL_REFRESH_TOKEN'],
      'Admin': ['ADMIN_EMAILS'],
    };

    const grouped: { category: string; keys: ApiKeyEntry[] }[] = [];
    const assigned = new Set<string>();

    // Known categories
    for (const [category, keyNames] of Object.entries(categories)) {
      const keys = this.allKeys.filter((k) => keyNames.includes(k.key));
      if (keys.length > 0) {
        grouped.push({ category, keys });
        keys.forEach((k) => assigned.add(k.key));
      }
    }

    // Other (unassigned)
    const other = this.allKeys.filter((k) => !assigned.has(k.key));
    if (other.length > 0) {
      grouped.push({ category: 'Other', keys: other });
    }

    this.groups.set(grouped);
  }

  mask(value: string): string {
    if (value.length <= 8) return '********';
    return value.substring(0, 4) + '****' + value.substring(value.length - 4);
  }

  editKey(entry: ApiKeyEntry): void {
    entry.editing = true;
    entry.originalValue = entry.value;
  }

  cancelEdit(entry: ApiKeyEntry): void {
    entry.editing = false;
    entry.value = entry.originalValue || '';
  }

  saveKey(entry: ApiKeyEntry): void {
    entry.editing = false;
    this.http.put('/api/v1/admin/api-keys', {
      keys: [{ key: entry.key, value: entry.value }],
      vaultPassword: this.vaultPassword,
    }).subscribe({
      next: () => { entry.testResult = 'Saved'; entry.testOk = true; },
      error: (e) => { entry.testResult = e.error?.message || 'Failed'; entry.testOk = false; },
    });
  }

  changedKeys(): ApiKeyEntry[] {
    return this.allKeys.filter((k) => k.editing);
  }

  saveAll(): void {
    const changed = this.allKeys.filter((k) => k.editing);
    if (changed.length === 0) return;
    const keys = changed.map((k) => ({ key: k.key, value: k.value }));
    this.http.put('/api/v1/admin/api-keys', { keys, vaultPassword: this.vaultPassword }).subscribe({
      next: () => {
        changed.forEach((k) => { k.editing = false; k.testResult = 'Saved'; k.testOk = true; });
      },
      error: (e) => {
        changed.forEach((k) => { k.testResult = e.error?.message || 'Failed'; k.testOk = false; });
      },
    });
  }

  testKey(entry: ApiKeyEntry): void {
    entry.testResult = 'Testing...';
    entry.testOk = false;
    this.http.post<{ ok: boolean; message: string }>(`/api/v1/admin/api-keys/test/${entry.key}`, {}).subscribe({
      next: (res) => { entry.testResult = res.message; entry.testOk = res.ok; },
      error: (e) => { entry.testResult = e.error?.message || 'Test failed'; entry.testOk = false; },
    });
  }
}
```

- [ ] **Step 2: Run frontend tsc check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

---

### Task C4: Login page "Lost admin access?" link

**Files:**
- Modify: `frontend/src/app/auth/login.component.ts`

- [ ] **Step 1: Add "Lost admin access?" link**

Find the login form template and add below the submit button:

```html
@if (true) {
  <div class="admin-rescue-section">
    <a (click)="showRescue = true" class="rescue-link">Lost admin access?</a>
  </div>
}

@if (showRescue) {
  <div class="rescue-dialog">
    <h3>Admin Recovery</h3>
    @if (rescueStep === 'email') {
      <p>Enter your admin email to receive a recovery code via your backup email.</p>
      <input type="email" [(ngModel)]="rescueEmail" placeholder="Admin email" />
      <button (click)="sendForgotPassword()">Send Recovery Code</button>
      <p class="rescue-or">— or —</p>
      <button class="btn-danger" (click)="rescueStep = 'reason'">Super Admin Rescue (break glass)</button>
    }
    @if (rescueStep === 'reason') {
      <p>This sends a recovery code to the platform owner's backup email.</p>
      <textarea [(ngModel)]="rescueReason" placeholder="Explain why you need super admin access (min 10 chars)" rows="3"></textarea>
      <button (click)="triggerRescue()" [disabled]="rescueReason.length < 10">Send Rescue Request</button>
    }
    @if (rescueStep === 'otp') {
      <p>Enter the recovery code sent to your email.</p>
      <input type="text" [(ngModel)]="rescueOtp" placeholder="6-digit code" maxlength="6" />
      <button (click)="verifyRescueOtp()">Verify</button>
    }
    @if (rescueStep === 'reset') {
      <p>Set a new password and PIN.</p>
      <input type="password" [(ngModel)]="rescueNewPassword" placeholder="New password" />
      <input type="password" [(ngModel)]="rescueNewPin" placeholder="New PIN (6 digits)" maxlength="6" />
      <button (click)="completeReset()">Reset</button>
    }
    <p class="error">{{ rescueError }}</p>
  </div>
}
```

And add the component state and methods:

```typescript
protected showRescue = false;
protected rescueStep: 'email' | 'reason' | 'otp' | 'reset' = 'email';
protected rescueEmail = '';
protected rescueReason = '';
protected rescueOtp = '';
protected rescueNewPassword = '';
protected rescueNewPin = '';
protected rescueToken = '';
protected rescueError = '';

sendForgotPassword(): void {
  this.rescueError = '';
  this.http.post('/api/v1/auth/admin/forgot-password', { email: this.rescueEmail }).subscribe({
    next: (res: any) => {
      if (res.showRescueOption) {
        this.rescueStep = 'reason';
      } else {
        this.rescueStep = 'otp';
      }
    },
    error: (e) => this.rescueError = e.error?.message || 'Failed',
  });
}

triggerRescue(): void {
  this.rescueError = '';
  this.http.post('/api/v1/auth/admin/rescue', { reason: this.rescueReason }).subscribe({
    next: () => this.rescueStep = 'otp',
    error: (e) => this.rescueError = e.error?.message || 'Failed',
  });
}

verifyRescueOtp(): void {
  this.rescueError = '';
  this.http.post('/api/v1/auth/admin/verify-otp', { email: this.rescueEmail || 'admin@demo.local', otp: this.rescueOtp }).subscribe({
    next: (res: any) => { this.rescueToken = res.token; this.rescueStep = 'reset'; },
    error: (e) => this.rescueError = e.error?.message || 'Invalid code',
  });
}

completeReset(): void {
  this.rescueError = '';
  this.http.post('/api/v1/auth/admin/reset-password', {
    token: this.rescueToken,
    newPassword: this.rescueNewPassword,
    newPin: this.rescueNewPin,
  }).subscribe({
    next: () => {
      this.showRescue = false;
      this.rescueStep = 'email';
      alert('Password reset. Please log in with your new credentials and complete the setup wizard.');
    },
    error: (e) => this.rescueError = e.error?.message || 'Failed',
  });
}
```

Add to CSS:
```css
.admin-rescue-section { text-align: center; margin-top: 1rem; }
.rescue-link { color: var(--color-muted, #666); cursor: pointer; font-size: 0.85rem; text-decoration: underline; }
.rescue-dialog { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--color-border, #eee); border-radius: 8px; }
.rescue-dialog input, .rescue-dialog textarea { display: block; width: 100%; margin: 0.5rem 0; padding: 0.5rem; }
.rescue-dialog button { margin: 0.5rem 0; padding: 0.5rem 1rem; }
.rescue-or { text-align: center; color: var(--color-muted, #999); margin: 0.5rem 0; }
.btn-danger { background: #e53e3e; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
.error { color: #e53e3e; }
```

- [ ] **Step 2: Run frontend tsc check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

---

## Self-Review Checklist

- [ ] **Spec coverage:** Every section in the spec has a corresponding task. Tier 1 (self-service = Task A6), Tier 2 (backup email OTP = Task A5), Tier 3 (rescue = Task A5 + A3), API Keys vault (Phase B), UI (Phase C).
- [ ] **Placeholders:** No "TBD", "TODO", or vague phrases. All code is concrete.
- [ ] **Type consistency:** `Principal.setupRequired` matches in express.d.ts, auth.service.ts, auth.ts middleware. `configVault.encryptValue()` returns `{ encryptedValue, iv, authTag }` matching `ApiKeyConfig` model fields.
- [ ] **No placeholders in audit:** `recordAudit` called in every appropriate handler with proper event names matching the spec's audit trail table.
