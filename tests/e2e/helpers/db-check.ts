// tests/e2e/helpers/db-check.ts
// Uses the backend API (fetch) for all DB assertions to avoid importing
// PrismaClient in the Playwright worker context, which causes dual
// @playwright/test version conflicts with the frontend node_modules.
const BACKEND = 'http://localhost:3000/api/v1';

export interface BookingData {
  id: string;
  status: string;
  price: number;
  paymentTiming: string;
  settlementMethod: string;
  scheduledDate: string;
  timeSlot: string;
  quoteRequestId: string;
  customerId: string;
  servicerId: string;
  invoiceId?: string;
}

export interface TransactionData {
  id: string;
  type: string;
  amount: string;
  bookingId: string;
  userId: string;
  createdAt: string;
}

export async function getBooking(bookingId: string): Promise<BookingData | null> {
  const res = await fetch(`${BACKEND}/bookings/${bookingId}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export async function getTransactions(bookingId: string): Promise<TransactionData[]> {
  const res = await fetch(`${BACKEND}/transactions?bookingId=${bookingId}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export async function getCustomerBalance(userId: string): Promise<number> {
  const res = await fetch(`${BACKEND}/users/${userId}`);
  if (!res.ok) return 0;
  const json = await res.json();
  return Number(json.data?.creditBalance ?? json.creditBalance ?? 0);
}

export async function getInvoice(bookingId: string) {
  const res = await fetch(`${BACKEND}/bookings/${bookingId}/invoice`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export async function getBookingCount(): Promise<number> {
  const res = await fetch(`${BACKEND}/bookings`);
  if (!res.ok) return 0;
  const json = await res.json();
  return Array.isArray(json.data) ? json.data.length : 0;
}

export async function getCategoryCount(): Promise<number> {
  const res = await fetch(`${BACKEND}/categories?scope=all`);
  if (!res.ok) return 0;
  const json = await res.json();
  return Array.isArray(json.data) ? json.data.length : 0;
}

export async function verifyEscrowIntegrity(
  bookingId: string,
  log: { ok: (l: string, d?: string) => void; fail: (l: string, d?: string) => void; rootCause: (t: string, a: string) => void; db: (l: string, d: string) => void }
): Promise<void> {
  const txns = await getTransactions(bookingId);
  const escrowHold = txns.find(t => t.type === 'escrow_hold');
  const escrowRelease = txns.find(t => t.type === 'escrow_release');
  const platformFee = txns.find(t => t.type === 'platform_fee');

  if (!escrowHold) { log.fail('escrow_hold', 'NOT FOUND'); return; }

  log.db('escrow_hold', `amount=${Number(escrowHold.amount)}`);

  if (escrowRelease) {
    log.db('escrow_release', `amount=${Number(escrowRelease.amount)}`);
  }
  if (platformFee) {
    log.db('platform_fee', `amount=${Number(platformFee.amount)}`);
  }

  if (escrowRelease && platformFee) {
    const hold = Number(escrowHold.amount);
    const release = Number(escrowRelease.amount);
    const fee = Number(platformFee.amount);
    const drift = Math.abs(hold - release - fee);

    if (drift < 0.02) {
      log.ok('Escrow invariant holds', `hold=${hold} === release=${release} + fee=${fee}`);
    } else {
      log.fail('Escrow invariant broken', `hold=${hold} !== release=${release} + fee=${fee} (drift=${drift})`);
      log.rootCause('Escrow leakage', [
        `  hold amount: ${hold}`,
        `  release amount: ${release}`,
        `  platform fee: ${fee}`,
        `  unaccounted: ${drift}`,
        `  Likely cause: computeTotal() or splitUrgentFee() mismatch.`,
        `  Check: backend/src/lib/money.ts, booking.service.ts doneJob().`,
      ].join('\n'));
    }
  }
}

export async function disconnect(): Promise<void> {
  // No-op; no Prisma connection to close
}
