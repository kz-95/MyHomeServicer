import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';

/**
 * Saved Payment Methods — customer-side CRUD for storing Stripe payment
 * methods (cards) for faster checkout.
 *
 * Tied to User via `userId`. Unsetting isDefault before setting a new one is
 * handled atomically in a transaction.
 */

// ── Query ──────────────────────────────────────────────────────────────────────

/** List saved payment methods for a user. */
export async function listPaymentMethods(userId: string) {
  return prisma.savedPaymentMethod.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

/** Get a single saved payment method by id, scoped to userId. */
export async function getPaymentMethod(userId: string, id: string) {
  const pm = await prisma.savedPaymentMethod.findUnique({ where: { id } });
  if (!pm || pm.userId !== userId) {
    throw notFound('Payment method not found');
  }
  return pm;
}

// ── Mutate ─────────────────────────────────────────────────────────────────────

export interface CreatePaymentMethodInput {
  stripePaymentMethodId: string;
  brand: string;       // visa | mastercard | amex
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault?: boolean;
}

/** Add a saved payment method. If isDefault, unset all others first. */
export async function createPaymentMethod(userId: string, input: CreatePaymentMethodInput) {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.savedPaymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.savedPaymentMethod.create({
      data: {
        userId,
        stripePaymentMethodId: input.stripePaymentMethodId,
        brand: input.brand,
        last4: input.last4,
        expMonth: input.expMonth,
        expYear: input.expYear,
        isDefault: input.isDefault ?? false,
      },
    });
  });
}

export interface UpdatePaymentMethodInput {
  isDefault?: boolean;
  expMonth?: number;
  expYear?: number;
}

/** Update a saved payment method (set default, update expiry). */
export async function updatePaymentMethod(userId: string, id: string, input: UpdatePaymentMethodInput) {
  await getPaymentMethod(userId, id); // ownership check

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.savedPaymentMethod.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return tx.savedPaymentMethod.update({
      where: { id },
      data: input,
    });
  });
}

/** Delete a saved payment method. */
export async function deletePaymentMethod(userId: string, id: string) {
  await getPaymentMethod(userId, id); // ownership check
  return prisma.savedPaymentMethod.delete({ where: { id } });
}
