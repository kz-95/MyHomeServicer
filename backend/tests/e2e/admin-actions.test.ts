/**
 * E2E tests — admin panel actions.
 *
 * Covers: admin login, merchant ban/unban (PIN-gated), category-request
 * approval (PIN-gated), withdrawal review, and appeal review.
 *
 * Requires a live Postgres + Redis stack with demo data seeded.
 * Gate: RUN_E2E=1  →  `npm run test:e2e`
 */
import request from 'supertest';
import type { Application } from 'express';

const runE2E = process.env.RUN_E2E === '1';
const e2e = runE2E ? describe : describe.skip;

e2e('Admin panel actions (end-to-end)', () => {
  let app: Application;
  let adminToken = '';
  let merchantToken = '';
  let merchantId = '';

  const api = () => request(app);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const adminPin = '1234'; // seeded demo admin PIN

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

  // ── Setup — log in ────────────────────────────────────────────────────────

  it('admin can log in', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'admin@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    adminToken = res.body.accessToken;
    expect(adminToken).toBeTruthy();
  });

  it('a seeded merchant can log in and get their ID', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'merchant.3@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    merchantToken = res.body.accessToken;
    // Extract the merchant's ID from their profile.
    const profile = await api().get('/api/v1/merchant/me').set(bearer(merchantToken));
    expect(profile.status).toBe(200);
    merchantId = profile.body.id;
    expect(merchantId).toBeTruthy();
  });

  // ── Dashboard ─────────────────────────────────────────────────────────────

  it('returns the admin dashboard stats', async () => {
    const res = await api().get('/api/v1/admin/dashboard').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalBookings: expect.any(Number),
      totalMerchants: expect.any(Number),
    });
  });

  it('rejects dashboard access for a non-admin', async () => {
    const res = await api().get('/api/v1/admin/dashboard').set(bearer(merchantToken));
    expect(res.status).toBe(403);
  });

  it('rejects dashboard access without a token', async () => {
    const res = await api().get('/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
  });

  // ── PIN verification ──────────────────────────────────────────────────────

  it('verify-pin returns { valid: true } for the correct PIN', async () => {
    const res = await api()
      .post('/api/v1/admin/verify-pin')
      .set(bearer(adminToken))
      .set('X-Action-Pin', adminPin);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('verify-pin rejects a wrong PIN', async () => {
    const res = await api()
      .post('/api/v1/admin/verify-pin')
      .set(bearer(adminToken))
      .set('X-Action-Pin', '0000');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PIN_INVALID');
  });

  // ── Merchant management ───────────────────────────────────────────────────

  it('lists all merchants', async () => {
    const res = await api().get('/api/v1/admin/merchants').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('returns merchant detail', async () => {
    const res = await api().get(`/api/v1/admin/merchants/${merchantId}`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(merchantId);
  });

  it('bans a merchant (PIN-gated)', async () => {
    const res = await api()
      .post(`/api/v1/admin/merchants/${merchantId}/ban`)
      .set(bearer(adminToken))
      .set('X-Action-Pin', adminPin)
      .send({ reason: 'E2E test ban' });
    expect(res.status).toBe(204);
  });

  it('confirms merchant is now banned', async () => {
    const res = await api().get(`/api/v1/admin/merchants/${merchantId}`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.isBanned).toBe(true);
  });

  it('unbans the merchant (PIN-gated)', async () => {
    const res = await api()
      .post(`/api/v1/admin/merchants/${merchantId}/unban`)
      .set(bearer(adminToken))
      .set('X-Action-Pin', adminPin)
      .send({ adminNote: 'E2E test unban' });
    expect(res.status).toBe(204);
  });

  it('confirms merchant is no longer banned after unban', async () => {
    const res = await api().get(`/api/v1/admin/merchants/${merchantId}`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.isBanned).toBe(false);
  });

  it('rejects ban without PIN header', async () => {
    const res = await api()
      .post(`/api/v1/admin/merchants/${merchantId}/ban`)
      .set(bearer(adminToken))
      .send({ reason: 'Should fail' });
    expect(res.status).toBe(403);
  });

  // ── Category requests ─────────────────────────────────────────────────────

  it('lists pending category requests', async () => {
    const res = await api()
      .get('/api/v1/admin/category-requests')
      .set(bearer(adminToken))
      .query({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('approves a category request if one exists (PIN-gated)', async () => {
    // First check if there are any pending requests from the seed.
    const list = await api()
      .get('/api/v1/admin/category-requests?status=pending')
      .set(bearer(adminToken));
    expect(list.status).toBe(200);

    if (list.body.data.length === 0) {
      // Create one first via the merchant endpoint.
      await api()
        .post('/api/v1/merchant/me/category-requests')
        .set(bearer(merchantToken))
        .send({ name: 'E2E Test Category', description: 'Created by E2E test' });
    }

    // Re-fetch to get the request ID.
    const list2 = await api()
      .get('/api/v1/admin/category-requests?status=pending')
      .set(bearer(adminToken));
    expect(list2.status).toBe(200);

    if (list2.body.data.length > 0) {
      const reqId = list2.body.data[0].id;
      const res = await api()
        .patch(`/api/v1/admin/category-requests/${reqId}`)
        .set(bearer(adminToken))
        .set('X-Action-Pin', adminPin)
        .send({
          status: 'approved',
          name: 'E2E Approved Category',
          defaultPriceSuggestion: 80,
          defaultEstimatedDurationMinutes: 60,
          adminNote: 'E2E approval',
        });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
    }
  });

  // ── Withdrawals ───────────────────────────────────────────────────────────

  it('lists withdrawal requests', async () => {
    const res = await api().get('/api/v1/admin/withdrawals').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── Appeals ───────────────────────────────────────────────────────────────

  it('lists penalty appeals', async () => {
    const res = await api().get('/api/v1/admin/appeals').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  it('reads platform settings', async () => {
    const res = await api().get('/api/v1/admin/settings').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('updates a platform setting (PIN-gated)', async () => {
    const res = await api()
      .patch('/api/v1/admin/settings')
      .set(bearer(adminToken))
      .set('X-Action-Pin', adminPin)
      .send({ key: 'noshow_grace_minutes', value: { minutes: 30 } });
    expect(res.status).toBe(200);
  });

  // ── Penalty rules ─────────────────────────────────────────────────────────

  it('lists penalty rules', async () => {
    const res = await api().get('/api/v1/admin/penalty-rules').set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
