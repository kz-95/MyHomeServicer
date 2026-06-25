/**
 * E2E tests - authentication flow.
 *
 * Covers: register → login → refresh → logout, demo-account login,
 * and account lockout after 5 consecutive bad-password attempts.
 *
 * Requires a live Postgres + Redis stack with demo data seeded.
 * Gate: RUN_E2E=1  →  `npm run test:e2e`
 */
import request from 'supertest';
import type { Application } from 'express';

const runE2E = process.env.RUN_E2E === '1';
const e2e = runE2E ? describe : describe.skip;

e2e('Auth flow (end-to-end)', () => {
  let app: Application;

  const api = () => request(app);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  // Unique email per run so repeated runs don't collide on the unique index.
  const testEmail = `e2e-auth-${Date.now()}@test.local`;
  const testPassword = 'Test@2026';

  let accessToken = '';
  let refreshToken = '';

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

  // ── Register ──────────────────────────────────────────────────────────────

  it('registers a new customer account', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'E2E Auth User', email: testEmail, phone: '+60 11-1234 5678', password: testPassword });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('rejects a duplicate email on register', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Dup', email: testEmail, phone: '+60 11-0000 0000', password: testPassword });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('rejects a weak password (no digit)', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Weak', email: `weak-${Date.now()}@test.local`, phone: '+60 11-0000 0000', password: 'abcdefgh' });
    expect(res.status).toBe(400);
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  it('logs in with correct credentials', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(200);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  });

  it('rejects login with a wrong password', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'WrongPassword99' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects login for a non-existent email', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@nowhere.test', password: testPassword });
    expect(res.status).toBe(401);
  });

  // ── Access token works ────────────────────────────────────────────────────

  it('authenticated endpoint succeeds with the issued access token', async () => {
    const res = await api().get('/api/v1/user/me').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
  });

  it('returns 401 without a token', async () => {
    const res = await api().get('/api/v1/user/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a malformed Bearer token', async () => {
    const res = await api().get('/api/v1/user/me').set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  // ── Refresh ───────────────────────────────────────────────────────────────

  it('issues a new token pair on refresh', async () => {
    const res = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // Update tokens for subsequent tests.
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('rejects reuse of the old refresh token after rotation', async () => {
    // refreshToken was rotated in the previous test - the old value should be rejected.
    const oldRefreshToken = refreshToken; // capture before overwriting below (already new)
    // Issue another refresh to rotate again.
    const r1 = await api().post('/api/v1/auth/refresh').send({ refreshToken });
    expect(r1.status).toBe(200);
    const evenNewerToken = r1.body.refreshToken;

    // Try to reuse the token that was just rotated out.
    const r2 = await api().post('/api/v1/auth/refresh').send({ refreshToken: oldRefreshToken });
    expect(r2.status).toBe(401);

    refreshToken = evenNewerToken;
    accessToken = r1.body.accessToken;
  });

  it('rejects a garbage refresh token', async () => {
    const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: 'garbage.token' });
    expect(res.status).toBe(401);
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  it('logout revokes the refresh token', async () => {
    const logoutRes = await api()
      .post('/api/v1/auth/logout')
      .send({ refreshToken });
    expect(logoutRes.status).toBe(204);

    // The revoked token must now be rejected.
    const refreshRes = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  // ── Demo accounts ─────────────────────────────────────────────────────────

  it('logs in with a seeded demo customer account', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'customer.fresh@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('logs in with a seeded demo merchant account', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'merchant.1@demo.local', password: 'Demo@2026' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  // ── Account lockout after 5 bad attempts ─────────────────────────────────

  it('locks an account after 5 consecutive bad-password attempts', async () => {
    // Use a fresh account so we don't collide with other tests.
    const lockEmail = `lockout-test-${Date.now()}@test.local`;
    const lockPassword = 'LockMe99!';

    // Register the target account.
    const reg = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Lockout Target', email: lockEmail, phone: '+60 11-9999 9999', password: lockPassword });
    expect(reg.status).toBe(201);

    // Fire 5 bad-password attempts.
    for (let i = 0; i < 5; i++) {
      const r = await api()
        .post('/api/v1/auth/login')
        .send({ email: lockEmail, password: 'WrongPass99' });
      // First 4 → 401 UNAUTHORIZED; 5th → should also be 401 (wrong pw) but triggers lock.
      expect([401, 403]).toContain(r.status);
    }

    // The 6th attempt (even with the correct password) must now be rejected with ACCOUNT_LOCKED.
    const lockedRes = await api()
      .post('/api/v1/auth/login')
      .send({ email: lockEmail, password: lockPassword });
    expect(lockedRes.status).toBe(403);
    expect(lockedRes.body.code).toBe('ACCOUNT_LOCKED');
  });
});
