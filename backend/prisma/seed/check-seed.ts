import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const servicers = await prisma.servicer.findMany({ select: { id: true, businessName: true } });
  for (const m of servicers) {
    const stats = await prisma.booking.groupBy({
      by: ['status'],
      where: { servicerId: m.id },
      _count: true,
    });
    const total = stats.reduce((s, r) => s + r._count, 0);
    const statuses = stats.map(r => `${r.status}: ${r._count}`).join(', ');

    const escrow = await prisma.transaction.aggregate({
      where: { servicerId: m.id, type: 'escrow_release' },
      _sum: { amount: true },
      _count: true,
    });

    const firstTxn = await prisma.transaction.findFirst({
      where: { servicerId: m.id, type: 'escrow_release' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const lastTxn = await prisma.transaction.findFirst({
      where: { servicerId: m.id, type: 'escrow_release' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    console.log(
      m.businessName.padEnd(35) +
      ' bookings: ' + String(total).padStart(3) +
      '  [' + statuses + ']' +
      '  escrow: RM' + String(escrow._sum.amount ?? 0).padStart(8) +
      ' (' + escrow._count + ' txns)' +
      '  range: ' + (firstTxn?.createdAt.toISOString().slice(0,10) ?? '-') +
      ' to ' + (lastTxn?.createdAt.toISOString().slice(0,10) ?? '-')
    );
  }

  // Invoice verification
  const allInvoices = await prisma.invoice.findMany({
    orderBy: { sequenceNumber: 'asc' },
    select: { invoiceNumber: true, subtotal: true, promoDiscount: true, total: true, platformFee: true },
  });
  let mismatches = 0;
  let feeOk = 0;
  let feeBad = 0;
  for (const inv of allInvoices) {
    const expectedTotal = Number(inv.subtotal) - Number(inv.promoDiscount);
    if (Math.abs(expectedTotal - Number(inv.total)) > 0.01) mismatches++;
    const expectedFee = Math.round(Number(inv.total) * 0.08 * 100) / 100;
    if (Math.abs(expectedFee - Number(inv.platformFee)) > 0.01) feeBad++;
    else feeOk++;
  }
  console.log('\n--- Invoice checks ---');
  console.log('Total invoices: ' + allInvoices.length);
  console.log('Subtotal - discount != total: ' + mismatches + ' mismatches');
  console.log('Platform fee at 8% of total: ' + feeOk + ' ok, ' + feeBad + ' bad');

  // Check cancelled bookings
  const cancelled = await prisma.booking.count({ where: { status: 'cancelled' } });
  console.log('\nCancelled bookings total: ' + cancelled);

  // Check all bookings have invoices where applicable
  const completedWithInvoice = await prisma.booking.count({
    where: { status: 'completed', invoices: { some: {} } },
  });
  const completedTotal = await prisma.booking.count({ where: { status: 'completed' } });
  console.log('Completed bookings with invoices: ' + completedWithInvoice + ' / ' + completedTotal);

  await prisma.$disconnect();
}
main().catch((err) => { console.error(err.message); process.exit(1); });
