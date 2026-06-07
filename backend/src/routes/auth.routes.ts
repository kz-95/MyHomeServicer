import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { loginLimiter, registerLimiter } from '../middleware/rate-limit';
import { prisma } from '../lib/prisma';
import { register, registerMerchant, login, refresh, logout } from '../services/auth.service';
import { isGoogleConfigured } from '../services/google-auth.service';
import { env } from '../config/env';
import { sendEmail } from '../lib/email';
import { badRequest } from '../lib/errors';
import { awardPoints } from '../services/points.service';
import { findAdmin, sendOtpToBackupEmail } from '../services/admin-rescue.service';

/** Authentication endpoints. */
export const authRouter = Router();

/** POST /auth/register — create a new customer account. */
authRouter.post(
  '/register',
  registerLimiter,
  validate([
    body('name').isString().trim().notEmpty().isLength({ min: 2, max: 100 }),
    body('email').isEmail(),
    body('phone').isString().trim().isMobilePhone('any'),
    body('password').isString().isLength({ min: 8 }).matches(/[0-9]/),
  ]),
  asyncHandler(async (req, res) => {
    const banned = await prisma.bannedEmail.findUnique({ where: { email: req.body.email.toLowerCase().trim() } });
    if (banned) throw badRequest('This email has been banned and cannot register.');
    const { user, tokens } = await register(req.body);
    awardPoints(user.id, 500, 'earn_welcome', undefined, '🎉 Welcome! Here are 500 free points to get started.').catch(() => {});
    res.status(201).json({
      user: { id: user.id, name: req.body.name, email: user.email, role: user.role, creditBalance: user.creditBalance },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }),
);

/** POST /auth/register-merchant — create a new merchant ("servicer") account. */
authRouter.post(
  '/register-merchant',
  registerLimiter,
  validate([
    body('name').isString().trim().notEmpty().isLength({ min: 2, max: 100 }),
    body('email').isEmail(),
    body('phone').isString().trim().isMobilePhone('any'),
    body('password').isString().isLength({ min: 8 }).matches(/[0-9]/),
    body('confirmPassword').isString().custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match.');
      return true;
    }),
    body('businessName').isString().trim().notEmpty().isLength({ min: 2, max: 200 }),
    body('categoryId').isUUID(),
    body('isCompany').optional().isBoolean(),
    body('taxNumber').optional({ values: 'null' }).isString().isLength({ max: 50 }),
    body('businessRegistrationNumber').optional({ values: 'null' }).isString().isLength({ max: 50 }),
    body('serviceAreas').optional().isArray(),
    body('pin').optional().isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const banned = await prisma.bannedEmail.findUnique({ where: { email: req.body.email.toLowerCase().trim() } });
    if (banned) throw badRequest('This email has been banned and cannot register.');
    const { user, tokens } = await registerMerchant(req.body);
    if (req.body.pin) {
      const pinHash = await bcrypt.hash(req.body.pin, 12);
      await prisma.servicer.update({ where: { id: user.id }, data: { pinHash } });
    }
    res.status(201).json({
      user: { id: user.id, name: req.body.name, email: user.email, role: user.role, creditBalance: user.creditBalance, depositBalance: user.depositBalance },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }),
);

/**
 * POST /auth/login — verify credentials, issue tokens.
 *
 * CRITICAL: This route MUST stay at exactly `POST /login` under the `/auth`
 * prefix (full path: POST /api/v1/auth/login). Do NOT rename, move, or change
 * the HTTP method. The frontend AuthService, proxy config, and morgan skip rule
 * all depend on this exact path. Changing it is a regression that will break
 * login for every account — this has caused prod-blocking 404s before.
 */
authRouter.post(
  '/login', // CRITICAL: do not change this path or method
  loginLimiter,
  validate([body('email').isEmail(), body('password').isString().isLength({ min: 8 })]),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await login(req.body.email, req.body.password);
    const u: Record<string, unknown> = { id: user.id, email: user.email, role: user.role, creditBalance: user.creditBalance, isDemo: user.isDemo };
    if (user.depositBalance !== undefined) u['depositBalance'] = user.depositBalance;
    res.json({
      user: u,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }),
);

/** POST /auth/refresh — rotate tokens using a valid refresh token. */
authRouter.post(
  '/refresh',
  validate([body('refreshToken').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    const tokens = await refresh(req.body.refreshToken);
    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  }),
);

/** POST /auth/logout — revoke the refresh token. */
authRouter.post(
  '/logout',
  validate([body('refreshToken').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    await logout(req.body.refreshToken);
    res.status(204).send();
  }),
);

/** POST /auth/forgot-password — send reset link. */
authRouter.post(
  '/forgot-password',
  registerLimiter,
  validate([
    body('email').isEmail(),
  ]),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase().trim();

    // Admin forgot-password is handled by the rescue system
    const admin = await findAdmin();
    if (admin && admin.email === email) {
      if (!admin.backupEmail) {
        return res.json({
          message: 'No recovery email is configured for this account.',
          showRescueOption: true,
        });
      }
      await sendOtpToBackupEmail();
      return res.json({ message: 'If configured, a recovery code has been sent to your backup email.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const servicer = await prisma.servicer.findUnique({ where: { email } });
    if (!user && !servicer) {
      return res.json({ message: 'If the email exists, a reset link has been sent.' });
    }
    const token = crypto.randomUUID();
    const expiry = new Date(Date.now() + 3600000);
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { resetToken: token, resetTokenExpiry: expiry } });
    } else if (servicer) {
      await prisma.servicer.update({ where: { id: servicer.id }, data: { resetToken: token, resetTokenExpiry: expiry } });
    }
    const resetLink = `${env.APP_URL}/auth/reset?token=${token}`;
    await sendEmail(email, 'Reset your MyHomeServicer password',
      `<p>Click the link below to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 1 hour.</p>`);
    return res.json({ message: 'If the email exists, a reset link has been sent.' });
  }),
);

/** POST /auth/reset-password — consume token and update password. */
authRouter.post(
  '/reset-password',
  validate([
    body('token').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 8 }).matches(/[0-9]/),
  ]),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    let entity: { id: string } | null = null;
    let isUser = false;
    const u = await prisma.user.findUnique({ where: { resetToken: token } });
    if (u) { entity = u; isUser = true; }
    const s = await prisma.servicer.findUnique({ where: { resetToken: token } });
    if (s) { entity = s; isUser = false; }
    if (!entity) throw badRequest('Invalid or expired reset link.');

    const record = await (isUser
      ? prisma.user.findUnique({ where: { id: entity.id }, select: { resetTokenExpiry: true } })
      : prisma.servicer.findUnique({ where: { id: entity.id }, select: { resetTokenExpiry: true } }));
    if (!record?.resetTokenExpiry || record.resetTokenExpiry < new Date()) {
      throw badRequest('Reset link has expired. Please request a new one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    if (isUser) {
      await prisma.user.update({ where: { id: entity.id }, data: { passwordHash, resetToken: null, resetTokenExpiry: null } });
    } else {
      await prisma.servicer.update({ where: { id: entity.id }, data: { passwordHash, resetToken: null, resetTokenExpiry: null } });
    }
    res.json({ message: 'Password updated. You can now log in with your new password.' });
  }),
);

// ── Google OAuth ────────────────────────────────────────────────────────────

/**
 * GET /auth/google — initiate Google OAuth sign-in.
 * Only registered when GOOGLE_CLIENT_ID is configured.
 */
if (isGoogleConfigured()) {
  authRouter.get('/google', passport.authenticate('google', { session: false }));

  /**
   * GET /auth/google/callback — handle Google OAuth callback.
   * Verifies the auth code, creates/links the user, issues JWT tokens,
   * then redirects to the frontend callback page with tokens in query params.
   */
  authRouter.get(
    '/google/callback',
    (req: Request, res: Response, next: NextFunction) => {
      passport.authenticate('google', { session: false }, (err: Error | null, result?: { accessToken: string; refreshToken: string; principal: Record<string, unknown> } | false) => {
        if (err) return next(err);
        if (!result) {
          return res.redirect(`${env.APP_URL}/login?error=google_auth_failed`);
        }
        const params = new URLSearchParams({
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
          user: JSON.stringify(result.principal),
        });
        res.redirect(`${env.APP_URL}/auth/callback?${params.toString()}`);
      })(req, res, next);
    },
  );
}
