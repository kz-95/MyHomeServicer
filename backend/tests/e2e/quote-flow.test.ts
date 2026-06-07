/**
 * End-to-end test of the core flow:
 *   quote submit → merchant proposal → customer select → confirm → arrive → done
 *
 * Requires a live Postgres + Redis stack with demo data seeded
 * (`docker compose up -d`, `npx prisma migrate deploy`, `npm run seed`).
 * Gated behind RUN_E2E=1 so the default `npm test` (unit tests) needs no
 * infrastructure. Run locally with:  npm run test:e2e
 */
import request from 'supertest';
import type { Application } from 'express';

const runE2E = process.env.RUN_E2E === '1';
const e2e = runE2E ? describe : describe.skip;

e2e('Quote → booking → done (end-to-end)', () => {
  let app: Application;
  let customerToken = '';
  let merchantToken = '';
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

  it('logs in the seeded customer', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'customer.fresh@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    customerToken = res.body.accessToken;
    expect(customerToken).toBeTruthy();
  });

  it('lists service categories', async () => {
    const res = await api().get('/api/v1/categories');
    expect(res.status).toBe(200);
    const plumbing = res.body.data.find((c: { slug: string }) => c.slug === 'plumbing');
    expect(plumbing).toBeDefined();
    categoryId = plumbing.id;
  });

  it("reads the customer's saved address", async () => {
    const res = await api().get('/api/v1/user/me/addresses').set(bearer(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    addressId = res.body.data[0].id;
  });

  it('submits a quote that reaches at least one merchant', async () => {
    const res = await api()
      .post('/api/v1/quotes')
      .set(bearer(customerToken))
      .send({
        categoryId,
        addressId,
        contactName: 'E2E Tester',
        contactNumber: '+60 12-000 0000',
        timeSlot: 'morning',
        preferredDate: new Date(Date.now() + 86_400_000).toISOString(),
        paymentMode: 'pay_later',
        deadlineMode: 'fixed_time',
        proposalDeadline: new Date(Date.now() + 60 * 60_000).toISOString(),
        agreeTerms: true,
      });
    expect(res.status).toBe(201);
    quoteId = res.body.id;
    expect(res.body.merchantsNotified).toBeGreaterThan(0);
  });

  it('logs in a merchant that received the broadcast', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'merchant.2@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    merchantToken = res.body.accessToken;
  });

  it('the merchant opens and proposes on the quote', async () => {
    const open = await api()
      .post(`/api/v1/merchant/quotes/${quoteId}/open`)
      .set(bearer(merchantToken));
    expect(open.status).toBe(200);                        // Phase 6 T6: was 204
    expect(open.body).toHaveProperty('proposalPrefill'); // null or { defaultTotal, basePrice, breakdown[] }

    const res = await api()
      .post(`/api/v1/merchant/quotes/${quoteId}/propose`)
      .set(bearer(merchantToken))
      .send({ proposedPrice: 120, etaMinutes: 60, message: 'E2E proposal' });
    expect(res.status).toBe(201);
    proposalId = res.body.id;
  });

  it('the customer sees the proposal and selects it', async () => {
    const list = await api()
      .get(`/api/v1/quotes/${quoteId}/proposals`)
      .set(bearer(customerToken));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);

    const sel = await api()
      .post(`/api/v1/quotes/${quoteId}/select`)
      .set(bearer(customerToken))
      .send({ proposalId });
    expect(sel.status).toBe(201);
    bookingId = sel.body.bookingId;
    expect(bookingId).toBeTruthy();
  });

  it('the merchant runs the job lifecycle: confirm → arrive → done', async () => {
    const confirm = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/confirm`)
      .set(bearer(merchantToken))
      .send({ confirm: true });
    expect(confirm.status).toBe(200);

    const arrive = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/arrive`)
      .set(bearer(merchantToken))
      .send({ photoUrl: 'https://picsum.photos/seed/e2e-arrive/400' });
    expect(arrive.status).toBe(200);

    const done = await api()
      .post(`/api/v1/merchant/jobs/${bookingId}/done`)
      .set(bearer(merchantToken))
      .send({ photoUrl: 'https://picsum.photos/seed/e2e-done/400' });
    expect(done.status).toBe(200);
  });

  it('the customer sees the booking as completed', async () => {
    const res = await api().get(`/api/v1/bookings/${bookingId}`).set(bearer(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });
});
