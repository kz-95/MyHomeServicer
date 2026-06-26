import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError, forbidden, unauthorized } from '../lib/errors';
import { AuthPrincipal } from '../types/express';
import { logger } from '../lib/logger';
import { isProd } from '../config/env';
import { inspectAccessToken } from '../services/auth.service';

/**
 * Real authentication (auth day). Resolves a principal from the
 * `Authorization: Bearer` JWT. In non-production environments it falls back
 * to the `x-dev-user` dev-bypass header so local development keeps working.
 *
 * Every downstream route reads `req.user` - unchanged from the dev-bypass
 * era, so swapping in this middleware required no route changes.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    const result = inspectAccessToken(header.slice(7));
    if (result.status === 'valid') {
      const p = result.principal;
      req.user = { id: p.id, kind: p.kind, role: p.role, email: p.email, isDemo: p.isDemo, setupRequired: p.setupRequired };
      next();
      return;
    }
    if (result.status === 'expired') {
      // Signal the client to silently refresh and retry.
      next(new ApiError('TOKEN_EXPIRED', 'Access token has expired'));
      return;
    }
    // Malformed/forged token - treat as no token so public routes
    // continue unauthenticated. requireAuth catches it on protected routes.
    next();
    return;
  }
  // No Bearer token. Dev-bypass fallback - never honoured in production.
  if (!isProd) {
    await devBypassAuth(req, _res, next);
    return;
  }
  next();
}

/**
 * Dev-bypass authentication (TODO.md auth strategy).
 *
 * V1 development uses an `x-dev-user` header carrying a demo account email.
 * The middleware resolves it to a User or Servicer and attaches `req.user`.
 * On auth day this is swapped for real JWT verification - every downstream
 * route already reads `req.user`, so no route changes are needed then.
 */
export async function devBypassAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('x-dev-user');
  if (!header) {
    next();
    return;
  }

  try {
    const servicer = await prisma.servicer.findFirst({
      where: { email: header, deletedAt: null },
    });
    if (servicer) {
      req.user = {
        id: servicer.id,
        kind: 'servicer',
        role: 'servicer',
        email: servicer.email,
        isDemo: servicer.isDemo,
      };
      next();
      return;
    }

    const user = await prisma.user.findFirst({
      where: { email: header, deletedAt: null },
    });
    if (user) {
      req.user = {
        id: user.id,
        kind: 'user',
        role: user.role,
        email: user.email,
        isDemo: user.isDemo,
      };
      if (user.role === 'admin' && !user.passwordChangedAt) {
        req.user.setupRequired = true;
      }
    } else {
      logger.warn('x-dev-user did not match any account', { header });
    }
  } catch (err) {
    logger.error('devBypassAuth lookup failed', { error: (err as Error).message });
  }
  next();
}

/** Reject the request unless an authenticated principal is present. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  next();
}

/** Require the principal to be a servicer account. */
export function requireServicer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  if (req.user.kind !== 'servicer') {
    next(forbidden('Servicer account required'));
    return;
  }
  next();
}

/** Require the principal to be an admin user. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  if (req.user.kind !== 'user' || req.user.role !== 'admin') {
    next(forbidden('Admin account required'));
    return;
  }
  next();
}

/** Require a user-kind principal (customer or admin - not servicer). */
export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  if (req.user.kind !== 'user') {
    next(forbidden('User account required'));
    return;
  }
  next();
}

/** Require a plain customer account (not servicer, not admin). */
export function requireCustomer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  if (req.user.kind !== 'user' || req.user.role !== 'customer') {
    next(forbidden('Customer account required'));
    return;
  }
  next();
}

export function requireSetupComplete(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.setupRequired) {
    next(forbidden('Admin setup not complete. Please complete the setup wizard first.'));
    return;
  }
  next();
}

export type { AuthPrincipal };
