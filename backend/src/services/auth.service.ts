import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { env, allowDemo } from '../config/env';
import { ApiError, badRequest, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import { pairedCustomerEmail } from '../lib/paired-account';

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface Principal {
  id: string;
  kind: 'user' | 'servicer';
  role: 'customer' | 'admin' | 'servicer';
  email: string;
  name: string;
  isDemo: boolean;
  setupRequired?: boolean;
  creditBalance: number;
  depositBalance?: number;
  isOnline?: boolean;
}

/** SHA-256 hash used to store refresh tokens (security-notes.md §1). */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Server-side password strength check — bypassed for demo accounts. */
export function assertPasswordStrength(password: string): void {
  if (password.length < 8 || !/[0-9]/.test(password)) {
    throw badRequest('Password must be at least 8 characters and contain a number');
  }
}

/** Sign a short-lived access token. */
function signAccessToken(p: Principal): string {
    const payload: Record<string, unknown> = {
      sub: p.id,
      kind: p.kind,
      role: p.role,
      email: p.email,
      name: p.name,
      isDemo: p.isDemo,
      creditBalance: p.creditBalance,
    };
    if (p.setupRequired !== undefined) payload['setupRequired'] = p.setupRequired;
    if (p.depositBalance !== undefined) payload['depositBalance'] = p.depositBalance;
    if (p.isOnline !== undefined) payload['isOnline'] = p.isOnline;

    return jwt.sign(
      payload,
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions,
    );
}

/** Issue an access + refresh token pair, persisting the refresh token hash. */
export async function issueTokens(p: Principal): Promise<TokenPair> {
  const accessToken = signAccessToken(p);
  const raw = randomBytes(48).toString('hex');
  const refreshToken = jwt.sign({ sub: p.id, kind: p.kind, jti: raw }, env.REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  } as jwt.SignOptions);

  await prisma.refreshToken.create({
    data: {
      userId: p.kind === 'user' ? p.id : null,
      merchantId: p.kind === 'servicer' ? p.id : null,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  return { accessToken, refreshToken };
}

export type TokenInspection =
  | { status: 'valid'; principal: Principal }
  | { status: 'expired' }
  | { status: 'invalid' };

/**
 * Inspect an access token, distinguishing a valid token from an expired one
 * (so the API can return TOKEN_EXPIRED and the client can silently refresh)
 * and from a malformed/forged one.
 */
export function inspectAccessToken(token: string): TokenInspection {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    return {
      status: 'valid',
      principal: {
        id: String(payload.sub),
        kind: payload.kind,
        role: payload.role,
        email: payload.email,
        name: payload.name,
        isDemo: Boolean(payload.isDemo),
        creditBalance: Number(payload.creditBalance ?? 0),
        ...(payload.setupRequired !== undefined ? { setupRequired: Boolean(payload.setupRequired) } : {}),
        ...(payload.depositBalance !== undefined ? { depositBalance: Number(payload.depositBalance) } : {}),
        ...(payload.isOnline !== undefined ? { isOnline: Boolean(payload.isOnline) } : {}),
      },
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { status: 'expired' };
    return { status: 'invalid' };
  }
}

/** Verify an access token and return the principal, or null. */
export function verifyAccessToken(token: string): Principal | null {
  const result = inspectAccessToken(token);
  return result.status === 'valid' ? result.principal : null;
}

// ── Account lookup across User + Servicer tables ─────────────────────────────

type Account =
  | { kind: 'user'; record: Awaited<ReturnType<typeof prisma.user.findFirst>> }
  | { kind: 'servicer'; record: Awaited<ReturnType<typeof prisma.servicer.findFirst>> };

async function findAccountByEmail(email: string): Promise<Account | null> {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (user) return { kind: 'user', record: user };
  const merchant = await prisma.servicer.findFirst({ where: { email, deletedAt: null } });
  if (merchant) return { kind: 'servicer', record: merchant };
  return null;
}

// ── Register ─────────────────────────────────────────────────────────────────

export async function register(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<{ user: Principal; tokens: TokenPair }> {
  assertPasswordStrength(input.password);
  const existing = await findAccountByEmail(input.email);
  if (existing) throw new ApiError('CONFLICT', 'An account with that email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: {
      role: 'customer',
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
    },
  });
  const principal: Principal = {
    id: user.id,
    kind: 'user',
    role: 'customer',
    email: user.email,
    name: user.name,
    isDemo: false,
    creditBalance: Number(user.creditBalance),
  };
  return { user: principal, tokens: await issueTokens(principal) };
}

/** Register a merchant account (with deposit + a default proposal preset). */
export async function registerMerchant(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  businessName: string;
  categoryId: string;
  isCompany?: boolean;
  taxNumber?: string;
  businessRegistrationNumber?: string;
  serviceAreas?: string[];
}): Promise<{ user: Principal; tokens: TokenPair }> {
  assertPasswordStrength(input.password);
  const existing = await findAccountByEmail(input.email);
  if (existing) throw new ApiError('CONFLICT', 'An account with that email already exists');

  // The merchant's platform category is fixed at registration.
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, deletedAt: null, parentCategoryId: null },
  });
  if (!category) throw badRequest('A valid platform category is required');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const merchant = await prisma.servicer.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      businessName: input.businessName,
      categoryId: input.categoryId,
      isCompany: input.isCompany ?? false,
      taxNumber: input.taxNumber ?? null,
      businessRegistrationNumber: input.businessRegistrationNumber ?? null,
      serviceAreas: input.serviceAreas ?? [],
      deposit: { create: { totalDeposited: 0, currentBalance: 0, minimumRequired: 100 } },
      proposalPresets: {
        create: {
          name: 'Standard quote',
          message: `Thanks for considering ${input.businessName}.`,
          isDefault: true,
        },
      },
    },
  });
  const principal: Principal = {
    id: merchant.id,
    kind: 'servicer',
    role: 'servicer',
    email: merchant.email,
    name: merchant.name,
    isDemo: false,
    creditBalance: Number(merchant.creditBalance),
    depositBalance: 0,
    isOnline: merchant.isOnline,
  };
  return { user: principal, tokens: await issueTokens(principal) };
}

// ── Customer mode (merchant operating as a customer) ─────────────────────────

/**
 * Provisions (or reuses) the customer-side account paired with a merchant so
 * the merchant can operate the platform as a customer ("customer mode").
 *
 * The paired user gets a synthetic, non-deliverable email so it never shadows
 * the merchant in `findAccountByEmail` — a normal login with the merchant's
 * real email therefore still resolves to the merchant account. Customer mode
 * is only ever reached through the in-app toggle, never a direct login.
 */
export async function switchToCustomer(
  merchantId: string,
): Promise<{ user: Principal; tokens: TokenPair }> {
  const merchant = await prisma.servicer.findUnique({ where: { id: merchantId } });
  if (!merchant || merchant.deletedAt) throw unauthorized('Servicer account not found');

  const pairedEmail = pairedCustomerEmail(merchant.id);
  let user = await prisma.user.findFirst({ where: { email: pairedEmail } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        role: 'customer',
        name: merchant.name,
        email: pairedEmail,
        phone: merchant.phone,
        passwordHash: merchant.passwordHash ?? '',
        isDemo: merchant.isDemo,
      },
    });
  }
  const principal: Principal = {
    id: user.id,
    kind: 'user',
    role: 'customer',
    email: user.email,
    name: user.name,
    isDemo: user.isDemo,
    creditBalance: Number(user.creditBalance),
  };
  return { user: principal, tokens: await issueTokens(principal) };
}

// ── Login ────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
): Promise<{ user: Principal; tokens: TokenPair }> {
  const account = await findAccountByEmail(email);
  if (!account || !account.record) {
    throw unauthorized('Invalid email or password');
  }
  const record = account.record;

  // Google-only account — no password set.
  if (!record.passwordHash) {
    throw unauthorized('This account uses Google sign-in. Please sign in with Google.');
  }

  // Account lockout check.
  if (record.lockedUntil && record.lockedUntil > new Date()) {
    throw new ApiError('ACCOUNT_LOCKED', 'Account locked — too many failed attempts. Try again later.');
  }

  // Demo accounts are blocked in production unless the demo surface is opted in
  // (DEMO_LOGIN_ENABLED) — e.g. on a dedicated demo deployment.
  if (record.isDemo && !allowDemo) {
    throw new ApiError('FORBIDDEN', 'Demo accounts are disabled in production');
  }

  const ok = await bcrypt.compare(password, record.passwordHash);
  if (!ok) {
    await registerFailedLogin(account.kind, record.id, record.failedLoginCount);
    throw unauthorized('Invalid email or password');
  }

  // Successful login — reset the failure counter.
  if (record.failedLoginCount > 0 || record.lockedUntil) {
    await resetLoginCounter(account.kind, record.id);
  }

  let depositBalance: number | undefined;
  if (account.kind === 'servicer') {
    const dep = await prisma.merchantDeposit.findUnique({
      where: { merchantId: record.id },
      select: { currentBalance: true },
    });
    depositBalance = dep ? Number(dep.currentBalance) : undefined;
  }

  const isServicer = account.kind === 'servicer';
  const principal: Principal = {
    id: record.id,
    kind: account.kind,
    role: isServicer ? 'servicer' : (record as { role: 'customer' | 'admin' }).role,
    email: record.email,
    name: isServicer ? (record as { name: string }).name : (record as { name: string }).name,
    isDemo: record.isDemo,
    creditBalance: Number(record.creditBalance),
    depositBalance,
    ...(isServicer ? { isOnline: (record as unknown as { isOnline: boolean }).isOnline } : {}),
  };

  if (principal.role === 'admin') {
    const adminUser = await prisma.user.findUnique({
      where: { id: principal.id },
      select: { passwordChangedAt: true },
    });
    if (adminUser && !adminUser.passwordChangedAt) {
      principal.setupRequired = true;
    }
  }

  return { user: principal, tokens: await issueTokens(principal) };
}

/**
 * Rebuild the current principal straight from the database for an already
 * authenticated request. Used by GET /session so the frontend can validate a
 * stored token against the backend on startup (never trusting localStorage
 * alone) and pick up fresh balances. Throws 401 if the account no longer exists.
 */
export async function getCurrentPrincipal(
  kind: 'user' | 'servicer',
  id: string,
): Promise<Principal> {
  if (kind === 'user') {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw unauthorized('Account not found');
    const principal: Principal = {
      id,
      kind,
      role: user.role,
      email: user.email,
      name: user.name,
      isDemo: user.isDemo,
      creditBalance: Number(user.creditBalance),
    };
    if (user.role === 'admin' && !user.passwordChangedAt) {
      principal.setupRequired = true;
    }
    return principal;
  }
  const merchant = await prisma.servicer.findUnique({ where: { id } });
  if (!merchant) throw unauthorized('Account not found');
  const dep = await prisma.merchantDeposit.findUnique({
    where: { merchantId: merchant.id },
    select: { currentBalance: true },
  });
  return {
    id,
    kind,
    role: 'servicer',
    email: merchant.email,
    name: merchant.name,
    isDemo: merchant.isDemo,
    creditBalance: Number(merchant.creditBalance),
    depositBalance: dep ? Number(dep.currentBalance) : undefined,
    isOnline: merchant.isOnline,
  };
}

async function registerFailedLogin(kind: 'user' | 'servicer', id: string, current: number) {
  const next = current + 1;
  const data =
    next >= MAX_FAILED_LOGINS
      ? { failedLoginCount: next, lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
      : { failedLoginCount: next };
  if (kind === 'user') await prisma.user.update({ where: { id }, data });
  else await prisma.servicer.update({ where: { id }, data });
  logger.warn('Failed login attempt', { kind, attempts: next });
}

async function resetLoginCounter(kind: 'user' | 'servicer', id: string) {
  const data = { failedLoginCount: 0, lockedUntil: null };
  if (kind === 'user') await prisma.user.update({ where: { id }, data });
  else await prisma.servicer.update({ where: { id }, data });
}

// ── Refresh ──────────────────────────────────────────────────────────────────

export async function refresh(refreshToken: string): Promise<TokenPair> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, env.REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized('Refresh token is no longer valid');
  }

  const kind = payload.kind as 'user' | 'servicer';
  const id = String(payload.sub);
  let principal: Principal;
  if (kind === 'user') {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw unauthorized('Account not found');
    principal = { id, kind, role: user.role, email: user.email, name: user.name, isDemo: user.isDemo, creditBalance: Number(user.creditBalance) };
    if (user.role === 'admin' && !user.passwordChangedAt) {
      principal.setupRequired = true;
    }
  } else {
    const merchant = await prisma.servicer.findUnique({ where: { id } });
    if (!merchant) throw unauthorized('Account not found');
    const dep = await prisma.merchantDeposit.findUnique({
      where: { merchantId: merchant.id },
      select: { currentBalance: true },
    });
    principal = { id, kind, role: 'servicer', email: merchant.email, name: merchant.name, isDemo: merchant.isDemo, creditBalance: Number(merchant.creditBalance), depositBalance: dep ? Number(dep.currentBalance) : undefined };
  }

  // Rotate: revoke the old refresh token, issue a fresh pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  return issueTokens(principal);
}

// ── Logout ───────────────────────────────────────────────────────────────────

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ── Action PIN ───────────────────────────────────────────────────────────────

/** Set or change an admin's action PIN (bcrypt-hashed, separate from login). */
export async function setActionPin(adminId: string, pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) {
    throw badRequest('Action PIN must be 4-8 digits');
  }
  const hash = await bcrypt.hash(pin, BCRYPT_COST);
  await prisma.user.update({ where: { id: adminId }, data: { actionPinHash: hash } });
}
