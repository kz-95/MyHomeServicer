import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/email';

function buildDeactivatedEmail(originalEmail: string, count: number): string {
  const clean = originalEmail.replace(/[_+]d\d{2}(?=@)/, '');
  const [local, domain] = clean.split('@');
  const suffix = `_d${String(count).padStart(2, '0')}`;
  return `${local}${suffix}@${domain}`;
}

export async function deactivateUser(user: { id: string; email: string }, reason: string): Promise<void> {
  const newCount = ((user as any).deactivationCount ?? 0) + 1;
  const newEmail = buildDeactivatedEmail(user.email, newCount);

  await prisma.$transaction(async (tx) => {
    const activeBookings = await tx.booking.findMany({
      where: { userId: user.id, status: { in: ['confirmed', 'pending_confirm', 'in_progress'] } },
      select: { id: true },
    });
    for (const b of activeBookings) {
      await tx.booking.update({ where: { id: b.id }, data: { status: 'cancelled', cancelReason: `Cancelled on account deactivation: ${reason}` } });
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        active: false,
        deactivationCount: newCount,
        deactivatedAt: new Date(),
        name: '[deactivated]',
        passwordHash: null,
        contactName: null,
        contactNumber: null,
        phone: '',
      },
    });

    await tx.refreshToken.deleteMany({ where: { userId: user.id } });

    if (newCount >= 10) {
      await tx.bannedEmail.upsert({
        where: { email: user.email },
        create: { email: user.email, reason: `Auto-banned after ${newCount} deactivations`, deactivations: newCount },
        update: { deactivations: newCount },
      });
    }
  });

  await sendEmail(user.email, 'Your MyHomeServicer account has been deactivated',
    `<p>Your account has been deactivated as requested.</p><p>Reason: ${reason}</p>`);
}

export async function deactivateServicer(servicer: { id: string; email: string }, reason: string): Promise<void> {
  const newCount = ((servicer as any).deactivationCount ?? 0) + 1;
  const newEmail = buildDeactivatedEmail(servicer.email, newCount);

  await prisma.$transaction(async (tx) => {
    const activeBookings = await tx.booking.findMany({
      where: { merchantId: servicer.id, status: { in: ['confirmed', 'pending_confirm', 'in_progress'] } },
      select: { id: true },
    });
    for (const b of activeBookings) {
      await tx.booking.update({ where: { id: b.id }, data: { status: 'cancelled' } });
    }

    await tx.servicer.update({
      where: { id: servicer.id },
      data: {
        email: newEmail,
        active: false,
        deactivationCount: newCount,
        deactivatedAt: new Date(),
        name: '[deactivated]',
        businessName: '[deactivated]',
        passwordHash: null,
        phone: '',
      },
    });

    await tx.refreshToken.deleteMany({ where: { merchantId: servicer.id } });

    if (newCount >= 10) {
      await tx.bannedEmail.upsert({
        where: { email: servicer.email },
        create: { email: servicer.email, reason: `Auto-banned after ${newCount} deactivations`, deactivations: newCount },
        update: { deactivations: newCount },
      });
    }
  });

  await sendEmail(servicer.email, 'Your MyHomeServicer account has been deactivated',
    `<p>Your account has been deactivated as requested.</p><p>Reason: ${reason}</p>`);
}
