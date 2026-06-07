import { Router } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { registerLimiter } from '../middleware/rate-limit';
import { findAdmin, sendOtpToBackupEmail, sendOtpToRescueEmail, verifyOtp, resetAdminPassword } from '../services/admin-rescue.service';

export const adminRescueRouter = Router();

adminRescueRouter.post(
  '/forgot-password',
  registerLimiter,
  validate([body('email').isEmail()]),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase().trim();
    const admin = await findAdmin();
    if (!admin || admin.email !== email) {
      res.json({ message: 'If the email exists, a recovery code has been sent.' });
      return;
    }
    if (!admin.backupEmail) {
      res.json({
        message: 'No recovery email is configured for this account.',
        showRescueOption: true,
      });
      return;
    }
    await sendOtpToBackupEmail();
    res.json({ message: 'If configured, a recovery code has been sent to your backup email.' });
  }),
);

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
