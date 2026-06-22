import { prisma } from '../lib/prisma';
import { verifyPin } from '../middleware/pin';
import { checkPinCooldown, recordPinFailure, recordPinSuccess } from '../middleware/pin-cooldown';
import { badRequest, notFound } from '../lib/errors';
import { getSetting } from './settings.service';
import { notifyWithdrawalSubmitted } from './admin.service';

export async function transferBalance(
  servicerId: string,
  direction: 'deposit_to_credit' | 'credit_to_deposit',
  amount: number,
  pin: string,
): Promise<{ depositBalance: number; creditBalance: number }> {
  await checkPinCooldown(servicerId);
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId },
    select: { id: true, pinHash: true },
  });
  if (!servicer) throw notFound('Servicer not found');

  const ok = await verifyPin(servicer, pin);
  if (!ok) {
    await recordPinFailure(servicerId);
    throw badRequest('Incorrect PIN');
  }
  await recordPinSuccess(servicerId);

  return prisma.$transaction(async (tx) => {
    if (direction === 'deposit_to_credit') {
      const deposit = await tx.servicerDeposit.findUnique({ where: { servicerId: servicerId } });
      if (!deposit) throw notFound('Deposit account not found');
      const current = Number(deposit.currentBalance);
      const minReq = Number(deposit.minimumRequired);
      if (current - amount < minReq) {
        throw badRequest(`Cannot transfer — minimum RM ${minReq.toFixed(2)} must remain in deposit`);
      }
      await tx.servicerDeposit.update({
        where: { servicerId: servicerId },
        data: { currentBalance: { decrement: amount } },
      });
      await tx.servicer.update({
        where: { id: servicerId },
        data: { creditBalance: { increment: amount } },
      });
    } else {
      const current = await tx.servicer.findUnique({ where: { id: servicerId }, select: { creditBalance: true } });
      if (!current) throw notFound('Servicer not found');
      if (Number(current.creditBalance) < amount) {
        throw badRequest('Insufficient credit balance');
      }
      await tx.servicer.update({
        where: { id: servicerId },
        data: { creditBalance: { decrement: amount } },
      });
      await tx.servicerDeposit.upsert({
        where: { servicerId: servicerId },
        create: { servicerId: servicerId, currentBalance: amount, totalDeposited: 0, minimumRequired: 100 },
        update: { currentBalance: { increment: amount } },
      });
    }

    const updatedServicer = await tx.servicer.findUnique({ where: { id: servicerId }, select: { creditBalance: true } });
    const updatedDeposit = await tx.servicerDeposit.findUnique({ where: { servicerId: servicerId }, select: { currentBalance: true } });
    return {
      depositBalance: Number(updatedDeposit?.currentBalance ?? 0),
      creditBalance: Number(updatedServicer?.creditBalance ?? 0),
    };
  });
}

export async function requestWithdrawal(
  servicerId: string,
  amount: number,
  pin: string,
): Promise<{ message: string; withdrawalId: string }> {
  await checkPinCooldown(servicerId);
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId },
    select: { id: true, creditBalance: true, pinHash: true, bankName: true, bankAccount: true },
  });
  if (!servicer) throw notFound('Servicer not found');
  if (!servicer.bankName || !servicer.bankAccount) {
    throw badRequest('Set your bank account details before withdrawing.');
  }

  const ok = await verifyPin(servicer, pin);
  if (!ok) {
    await recordPinFailure(servicerId);
    throw badRequest('Incorrect PIN.');
  }
  await recordPinSuccess(servicerId);

  const minimum = await getSetting<{ amount: number }>('servicer_credit_withdrawal_minimum');
  if (amount < (minimum.amount ?? 50)) {
    throw badRequest(`Minimum withdrawal is RM ${minimum.amount ?? 50}`);
  }

  // Reserve check — in-flight withdrawals reduce available balance (BE-001 double-spend fix).
  const inFlight = await prisma.servicerWithdrawal.aggregate({
    where: { servicerId: servicerId, status: { in: ['pending', 'approved'] } },
    _sum: { amount: true },
  });
  const reserved = Number(inFlight._sum.amount ?? 0);
  const available = Number(servicer.creditBalance) - reserved;
  if (amount > available) {
    throw badRequest(
      `Withdrawal exceeds available credit balance (RM ${available.toFixed(2)} available after in-flight requests)`,
    );
  }

  const withdrawal = await prisma.servicerWithdrawal.create({
    data: {
      servicerId: servicerId,
      amount,
      bankName: servicer.bankName,
      bankAccount: servicer.bankAccount,
    },
  });
  await notifyWithdrawalSubmitted(withdrawal.id, servicerId);
  return { message: 'Withdrawal request submitted for admin review.', withdrawalId: withdrawal.id };
}
