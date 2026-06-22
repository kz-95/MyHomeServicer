import { prisma } from '../lib/prisma';
import { emitToUser, emitToServicer } from '../socket';
import { logger } from '../lib/logger';

/**
 * Notification service. Notifications target a customer/admin (`userId`) or a
 * servicer (`servicerId`). Each recipient has `notificationPrefs` controlling
 * which notification types they receive and which categories they follow.
 */

export interface NotificationPrefs {
  /** Per-type on/off toggles. */
  types: Record<string, boolean>;
  /** Category ids the recipient follows — empty means "all categories". */
  followedCategoryIds: string[];
}

/** Known notification types (the settings UI renders a toggle per type). */
export const NOTIFICATION_TYPES = ['orders', 'jobs', 'listings', 'promos', 'queues', 'payments'] as const;

/** Default settings — every type on, no category filter. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  types: { orders: true, jobs: true, listings: true, promos: true, queues: true },
  followedCategoryIds: [],
};

/** Normalise a stored prefs JSON blob, filling any missing fields. */
export function readPrefs(raw: unknown): NotificationPrefs {
  const p = (raw ?? {}) as Partial<NotificationPrefs>;
  return {
    types: { ...DEFAULT_NOTIFICATION_PREFS.types, ...(p.types ?? {}) },
    followedCategoryIds: Array.isArray(p.followedCategoryIds) ? p.followedCategoryIds : [],
  };
}

interface NotificationInput {
  /** One of NOTIFICATION_TYPES (unknown types are never filtered out). */
  type: string;
  message: string;
  userId?: string;
  servicerId?: string;
  /** In-app redirect target for a click, e.g. `/customer/quotes/<id>`. */
  linkUrl?: string;
  /** Optional category id — drives the "followed categories" filter. */
  category?: string;
  linkQuoteList?: string;
  linkReorder?: string;
}

/**
 * Creates an in-app notification row, unless the recipient has that type
 * switched off, or they follow specific categories and this one isn't among
 * them. Never throws — a notification failure must not break the triggering
 * action. Pushes a lightweight socket event for the customer badge.
 */
export async function notify(input: NotificationInput): Promise<void> {
  try {
    let prefs = DEFAULT_NOTIFICATION_PREFS;
    if (input.userId) {
      const u = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { notificationPrefs: true },
      });
      prefs = readPrefs(u?.notificationPrefs);
    } else if (input.servicerId) {
      const m = await prisma.servicer.findUnique({
        where: { id: input.servicerId },
        select: { notificationPrefs: true },
      });
      prefs = readPrefs(m?.notificationPrefs);
    } else {
      return;
    }

    if (prefs.types[input.type] === false) return;
    if (
      input.category &&
      prefs.followedCategoryIds.length > 0 &&
      !prefs.followedCategoryIds.includes(input.category)
    ) {
      return;
    }

    const row = await prisma.notification.create({
      data: {
        userId: input.userId ?? null,
        servicerId: input.servicerId ?? null,
        type: input.type,
        message: input.message,
        linkUrl: input.linkUrl ?? null,
        category: input.category ?? null,
        linkQuoteList: input.linkQuoteList ?? null,
        linkReorder: input.linkReorder ?? null,
      },
    });
    const payload = { id: row.id, type: row.type, message: row.message, createdAt: row.createdAt };
    if (input.userId) {
      emitToUser(input.userId, 'notification.new', payload);
    } else if (input.servicerId) {
      emitToServicer(input.servicerId, 'notification.new', payload);
    }
  } catch (err) {
    logger.error('Failed to create notification', { error: (err as Error).message });
  }
}

/**
 * Notifies every admin — admins are USER rows with `role = admin`. Used for
 * "a queue item needs settling" alerts.
 */
export async function notifyAdmins(
  input: Omit<NotificationInput, 'userId' | 'servicerId'>,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'admin', deletedAt: null },
      select: { id: true },
    });
    for (const a of admins) {
      await notify({ ...input, userId: a.id });
    }
  } catch (err) {
    logger.error('notifyAdmins failed', { error: (err as Error).message });
  }
}
