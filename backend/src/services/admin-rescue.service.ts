import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { sendEmail } from '../lib/email';
import { sendRescueEmail } from '../lib/gmail-rescue';
import { recordAudit } from './ledger.service';

const BCRYPT_COST = 12;
const OTP_EXPIRY_MS = 300_000;

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function findAdmin(): Promise<{ id: string; email: string; backupEmail: string | null } | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'admin' },
    select: { id: true, email: true, backupEmail: true },
  });
  return admin;
}

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

export async function sendOtpToRescueEmail(reason: string, ip: string, userAgent: string): Promise<void> {
  if (reason.length < 10 || reason.length > 500) {
    throw badRequest('Reason must be between 10 and 500 characters.');
  }

  const otp = generateOtp();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  await prisma.adminOtp.create({
    data: {
      email: 'coffeeinveins@gmail.com',
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
    actorType: 'system',
    action: 'admin.rescue.triggered',
    newValue: { ip, userAgent, reasonLength: reason.length },
  });
  logger.warn('Super admin rescue triggered', { ip, reason: reason.substring(0, 50) });
}

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

  await prisma.adminOtp.update({
    where: { id: record.id },
    data: { used: true },
  });

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
      passwordChangedAt: null,
      backupEmail: null,
    },
  });

  await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });

  await recordAudit({
    actorUserId: admin.id,
    actorType: 'admin',
    action: 'admin.rescue.completed',
    newValue: {},
  });
  logger.warn('Admin rescue completed — all credentials reset', { adminId: admin.id });
}
