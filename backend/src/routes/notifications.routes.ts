import { Router } from 'express';
import { body } from 'express-validator';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { notFound } from '../lib/errors';
import { readPrefs, NOTIFICATION_TYPES } from '../services/notification.service';

/**
 * Notification endpoints - role-agnostic. Works for customers, admins
 * (USER rows) and servicers alike; the recipient is resolved from `req.user`.
 */
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

/** The where-clause matching the calling principal's notifications. */
function ownWhere(u: { kind: string; id: string }) {
  return u.kind === 'servicer' ? { servicerId: u.id } : { userId: u.id };
}

/** GET /notifications - the caller's notifications, newest first. */
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await prisma.notification.findMany({
      where: ownWhere(req.user!),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ data, unread: data.filter((n) => !n.isRead).length });
  }),
);

/** GET /notifications/prefs - the caller's notification settings. */
notificationsRouter.get(
  '/prefs',
  asyncHandler(async (req, res) => {
    let raw: unknown = null;
    if (req.user!.kind === 'servicer') {
      const m = await prisma.servicer.findUnique({
        where: { id: req.user!.id },
        select: { notificationPrefs: true },
      });
      raw = m?.notificationPrefs;
    } else {
      const u = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { notificationPrefs: true },
      });
      raw = u?.notificationPrefs;
    }
    res.json({ prefs: readPrefs(raw), types: NOTIFICATION_TYPES });
  }),
);

/** PUT /notifications/prefs - update notification settings. */
notificationsRouter.put(
  '/prefs',
  validate([
    body('types').optional().isObject(),
    body('followedCategoryIds').optional().isArray(),
  ]),
  asyncHandler(async (req, res) => {
    const prefs = readPrefs({
      types: req.body.types,
      followedCategoryIds: req.body.followedCategoryIds,
    });
    const data = { notificationPrefs: prefs as unknown as Prisma.InputJsonValue };
    if (req.user!.kind === 'servicer') {
      await prisma.servicer.update({ where: { id: req.user!.id }, data });
    } else {
      await prisma.user.update({ where: { id: req.user!.id }, data });
    }
    res.json({ prefs });
  }),
);

/** PATCH /notifications/read-all - mark every notification read. */
notificationsRouter.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { ...ownWhere(req.user!), isRead: false },
      data: { isRead: true },
    });
    res.status(204).send();
  }),
);

/** PATCH /notifications/:id/read - mark one notification read. */
notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findFirst({
      where: { id: req.params.id, ...ownWhere(req.user!) },
    });
    if (!n) throw notFound('Notification not found');
    await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
    res.status(204).send();
  }),
);
