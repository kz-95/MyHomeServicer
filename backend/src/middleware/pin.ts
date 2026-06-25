import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { asyncHandler } from '../lib/async-handler';
import { checkPinCooldown, recordPinFailure, recordPinSuccess, consumePinSuccess } from './pin-cooldown';

/**
 * Verify a PIN against an entity (Servicer or User). A null/absent `pinHash`
 * returns `false` (no PIN configured → access denied, never silently accepted).
 * There is intentionally NO hardcoded default-PIN fallback - see security-notes.md.
 */
export async function verifyPin(
  entity: { pinHash?: string | null },
  pin: string,
): Promise<boolean> {
  if (!entity.pinHash) {
    return false;
  }
  return bcrypt.compare(pin, entity.pinHash);
}

/**
 * Action-PIN gate for sensitive admin routes (settings, penalty rules,
 * feature flags, fee changes). The PIN is a second credential separate from
 * the login password - see security-notes.md §1.
 *
 * The PIN is supplied inline via the `X-Action-Pin` header.
 */
export const requirePin = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || req.user.kind !== 'user' || req.user.role !== 'admin') {
      throw new ApiError('FORBIDDEN', 'Admin account required');
    }

    const userId = req.user.id;
    await checkPinCooldown(userId);

    const pin = req.header('x-action-pin');
    if (!pin) {
      throw new ApiError('PIN_REQUIRED', 'This action requires the admin action PIN');
    }

    const admin = await prisma.user.findUnique({ where: { id: userId } });
    if (!admin?.actionPinHash) {
      throw new ApiError('PIN_REQUIRED', 'No action PIN is configured for this admin');
    }

    const ok = await bcrypt.compare(pin, admin.actionPinHash);
    if (!ok) {
      await recordPinFailure(userId);
      throw new ApiError('PIN_INVALID', 'Incorrect action PIN');
    }

    await recordPinSuccess(userId);
    // Consume the verified state after the response finishes so a subsequent
    // PIN-gated request must re-verify (one-shot consumption - BE-019).
    _res.on('finish', () => {
      consumePinSuccess(userId).catch(() => {});
    });
    req.pinVerified = true;
    next();
  },
);
