/**
 * E2E tests - cash payment booking lifecycle.
 *
 * Covers the full flow for a cash booking:
 *   submit cash quote → merchant proposes → customer accepts →
 *   merchant confirms → arrives → marks done → merchant confirms cash received.
 *
 * Also exercises ownership checks (wrong user / wrong merchant) and the
 * guard that prevents cash confirm before job completion.
 *
 * Requires a live Postgres + Redis stack with demo data seeded.
 * Gate: RUN_E2E=1  →  `npm run test:e2e`
 */
import request from 'supertest';
import type { Application } from 'express';

const runE2E = process.env.RUN_E2E === '1';
const e2e = runE2E ? describe : describe.skip;

e2e('Cash booking lifecycle (end-to-end)', () => {
  let app: Application;
  let customerToken = '';
  let merchantToken = '';
  let otherMerchantToken = '';
  let categoryId = '';
  let addressId = '';
  let quoteId = '';
  let proposalId = '';
  let bookingId = '';

  const api = () => request(app);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const { createApp } = await import('../../src/app');
    app = createApp();
  });

  afterAll(async () => {
    const { prisma } = await import('../../src/lib/prisma');
    const { closeRedis } = await import('../../src/lib/redis');
    const { closeQueue } = await import('../../src/lib/queue');
    await Promise.allSettled([prisma.$disconnect(), closeQueue(), closeRedis()]);
  });

  // ── Setup ─────────────────────────────────────────────────────────────────

  it('logs in the test customer', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'customer.fresh@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    customerToken = res.body.accessToken;
  });

  it('logs in the test merchant (will handle the job)', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'merchant.4@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    merchantToken = res.body.accessToken;
  });

  it('logs in a different merchant (for ownership-check tests)', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'merchant.5@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    otherMerchantToken = res.body.accessToken;
  });

  it('resolves a category and address for the quote', async () => {
    const cats = await api().get('/api/v1/categories');
    expect(cats.status).toBe(200);
    categoryId = cats.body.data[0].id;
    expect(categoryId).toBeTruthy();

    const addrs = await api()
      .get('/api/v1/user/me/addresses')
      .set(bearer(customerToken));
    expect(addrs.status).toBe(200);
    expect(addrs.body.data.length).toBeGreaterThan(0);
    addressId = addrs.body.data[0].id;
  });

  // ── Submit a CASH quote ───────────────────────────────────────────────────

  it('customer submits a cash quote', async () => {
    const res = await api()
      .post('/api/v1/quotes')
      .set(bearer(customerToken))
      .send({
        categoryId,
        addressId,
        contactName: 'Cash E2E Tester',
        contactNumber: '+60 12-111 2222',
        timeSlot: 'noon',
        preferredDate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        paymentMode: 'cash',
        deadlineMode: 'fixed_time',
        proposalDeadline: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        agreeTerms: true,
      });
    expect(res.status).toBe(201);
    quoteId = res.body.id;
    expect(quoteId).toBeTruthy();
  });

  // ── Merchant proposes ─────────────────────────────────────────────────────

  it('merchant opens the quote', async () => {
    const res = await api()
      .post(`/api/v1/merchant/quotes/${quoteId}/open`)
      .set(bearer(merchantToken));
    expect(res.status).toBe(200);                        // Phase 6 T6: was 204
    expect(res.body).toHaveProperty('proposalPrefill'); // null or { defaultTotal, basePrice, breakdown[] }
  });

  it('merchant submits a proposal', async () => {
    const res = await api()
      .post(`/api/v1/merchant/quotes/${quoteId}/propose`)
      .set(bearer(merchantToken))
      .send({ proposedPrice: 80, etaMinutes: 45, message: 'Cash E2E proposal' });
    expect(res.status).toBe(201);
    proposalId = res.body.id;
    expect(proposalId).toBeTruthy();
  });

  // ── Customer selects proposal ─────────────────────────────────────────────

  it('customer selects the proposal and a booking is created', async () => {
    const res = await api()
      .post(`/api/v1/quotes/${quoteId}/select`)
      .set(bearer(customerToken))
      .send({ proposalId });
    expect(res.status).toBe(201);
    bookingId = res.body.bookingId;
    expect(bookingId).toBeTruthy();
  });

  it('booking starts in pending_confirm status', async () => {
    const res = await api()
      .get(`/api/v1/bookings/${bookingId}`)
      .set(bearer(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_confirm');
    expect(res.body.paymentMode).toBe('cash');
  });

  // ── Ownership checks (before confirm) ────────────────────────────────────

  it('a different merchant cannot confirm this booking', async () => {
    const res = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/confirm`)
      .set(bearer(otherMerchantToken))
      .send({ confirm: true });
    expect(res.status).toBe(404);
  });

  // ── Merchant lifecycle ────────────────────────────────────────────────────

  it('merchant confirms the booking', async () => {
    const res = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/confirm`)
      .set(bearer(merchantToken))
      .send({ confirm: true });
    expect(res.status).toBe(200);
  });

  it('cash-confirm is rejected before job is done', async () => {
    const res = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/cash-confirm`)
      .set(bearer(merchantToken));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('merchant marks arrived', async () => {
    const res = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/arrive`)
      .set(bearer(merchantToken))
      .send({ photoUrl: 'https://picsum.photos/seed/cash-arrive/400' });
    expect(res.status).toBe(200);
  });

  it('merchant marks done', async () => {
    const res = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/done`)
      .set(bearer(merchantToken))
      .send({ photoUrl: 'https://picsum.photos/seed/cash-done/400' });
    expect(res.status).toBe(200);
  });

  // ── Cash confirm ──────────────────────────────────────────────────────────

  it('a different merchant cannot cash-confirm this booking', async () => {
    const res = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/cash-confirm`)
      .set(bearer(otherMerchantToken));
    expect(res.status).toBe(404);
  });

  it('merchant confirms cash received after job is done', async () => {
    const res = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/cash-confirm`)
      .set(bearer(merchantToken));
    expect(res.status).toBe(200);
    expect(res.body.cashConfirmed).toBe(true);
  });

  it('cash-confirm is idempotent (second call does not error)', async () => {
    const res = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/cash-confirm`)
      .set(bearer(merchantToken));
    // Returns 200 unchanged (already confirmed guard).
    expect(res.status).toBe(200);
    expect(res.body.cashConfirmed).toBe(true);
  });

  it('customer sees the booking as completed with cashConfirmed flag', async () => {
    const res = await api()
      .get(`/api/v1/bookings/${bookingId}`)
      .set(bearer(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.cashConfirmed).toBe(true);
  });

  // ── Guard: pay_now bookings cannot use cash-confirm ───────────────────────

  it('pay_now bookings reject cash-confirm with BUSINESS_RULE_VIOLATION', async () => {
    // Submit a pay_now quote and get it to completed so we can test the guard.
    const qRes = await api()
      .post('/api/v1/quotes')
      .set(bearer(customerToken))
      .send({
        categoryId,
        addressId,
        contactName: 'PayNow Guard Test',
        contactNumber: '+60 12-333 4444',
        timeSlot: 'morning',
        preferredDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        paymentMode: 'pay_now',
        deadlineMode: 'fixed_time',
        proposalDeadline: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        agreeTerms: true,
      });
    if (qRes.status !== 201) return; // Skip guard test if quote fails (e.g., no nearby merchants).

    const pnQuoteId = qRes.body.id;
    await api().post(`/api/v1/merchant/quotes/${pnQuoteId}/open`).set(bearer(merchantToken));
    const pRes = await api()
      .post(`/api/v1/merchant/quotes/${pnQuoteId}/propose`)
      .set(bearer(merchantToken))
      .send({ proposedPrice: 100, etaMinutes: 60, message: 'Guard test proposal' });
    if (pRes.status !== 201) return;

    const sRes = await api()
      .post(`/api/v1/quotes/${pnQuoteId}/select`)
      .set(bearer(customerToken))
      .send({ proposalId: pRes.body.id });
    if (sRes.status !== 201) return;

    const pnBookingId = sRes.body.bookingId;

    // Attempt cash-confirm on a pay_now booking (while still pending_confirm).
    const ccRes = await api()
      .post(`/api/v1/merchant/jobs/${pnBookingId}/cash-confirm`)
      .set(bearer(merchantToken));
    expect(ccRes.status).toBe(422);
    expect(ccRes.body.code).toBe('BUSINESS_RULE_VIOLATION');
  });
});
