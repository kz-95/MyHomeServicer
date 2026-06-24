import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, requireCustomer, requireAdmin } from '../middleware/auth';
import { requirePin } from '../middleware/pin';
import { validate } from '../middleware/validate';
import { parsePageParams, buildPagination, sendList } from '../lib/http';
import { notFound, badRequest } from '../lib/errors';
import { redeemPoints, getUserPoints, invalidateTierCache } from '../services/points.service';

/**
 * Customer-facing rewards router — mounted at /rewards.
 * Contains both public-catalog and customer-specific endpoints.
 */
export const rewardsRouter = Router();

// ── Customer rewards endpoints (all require auth ) ──

/** GET /rewards — active reward catalog. */
rewardsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const rewards = await prisma.reward.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ data: rewards });
  }),
);

/** GET /rewards/active-vouchers?topupAmount=X — valid vouchers for top-up. */
rewardsRouter.get(
  '/active-vouchers',
  requireAuth,
  asyncHandler(async (req, res) => {
    const topupAmount = Number(req.query.topupAmount);
    if (!Number.isFinite(topupAmount) || topupAmount <= 0) {
      res.json({ data: [] });
      return;
    }

    const redemptions = await prisma.redemption.findMany({
      where: { userId: req.user!.id, status: 'active' },
      include: { reward: true },
    });

    const valid = redemptions
      .filter((r) => {
        if (r.reward.discountType !== 'topup_fixed') return false;
        const minTopup = r.reward.minTopup ? Number(r.reward.minTopup) : 0;
        return topupAmount >= minTopup;
      })
      .map((r) => ({
        voucherCode: r.voucherCode,
        rewardName: r.reward.name,
        discount: Number(r.reward.discountValue),
        finalAmount: Math.max(0, topupAmount - Number(r.reward.discountValue)),
        expiresAt: r.expiresAt,
      }));

    res.json({ data: valid });
  }),
);

/** POST /rewards/voucher/validate — validate a voucher code for top-up. */
rewardsRouter.post(
  '/voucher/validate',
  requireAuth,
  validate([
    body('code').isString().trim().notEmpty(),
    body('topupAmount').isFloat({ min: 10 }),
  ]),
  asyncHandler(async (req, res) => {
    const code = (req.body.code as string).trim();
    const topupAmount = Number(req.body.topupAmount);

    const redemption = await prisma.redemption.findUnique({
      where: { voucherCode: code },
      include: { reward: true },
    });

    if (!redemption || redemption.userId !== req.user!.id) {
      res.json({ valid: false, error: 'Voucher not found' });
      return;
    }

    if (redemption.status !== 'active') {
      res.json({ valid: false, error: 'Voucher is already used or expired' });
      return;
    }

    if (redemption.expiresAt && redemption.expiresAt < new Date()) {
      res.json({ valid: false, error: 'Voucher has expired' });
      return;
    }

    const discountType = redemption.reward.discountType as string;
    const discountValue = Number(redemption.reward.discountValue);
    const minTopup = redemption.reward.minTopup ? Number(redemption.reward.minTopup) : 0;

    if (topupAmount < minTopup) {
      res.json({ valid: false, error: `Minimum top-up amount is RM ${minTopup} for this voucher` });
      return;
    }

    if (discountType === 'topup_fixed') {
      const finalCharge = Math.max(0, topupAmount - discountValue);
      res.json({
        valid: true,
        discountType: 'topup_fixed',
        discountValue,
        originalAmount: topupAmount,
        finalCharge,
        finalCredit: topupAmount,
        label: `−RM ${discountValue} off`,
      });
    } else if (discountType === 'topup_bonus') {
      res.json({
        valid: true,
        discountType: 'topup_bonus',
        discountValue,
        originalAmount: topupAmount,
        finalCharge: topupAmount,
        finalCredit: topupAmount + discountValue,
        label: `+RM ${discountValue} bonus credits`,
      });
    } else {
      res.json({ valid: false, error: 'Unsupported voucher type' });
    }
  }),
);

/** POST /rewards/vouchers/search — search user's own vouchers by code (partial match).
 *  Returns redemptions matching the query string against voucherCode. */
rewardsRouter.post(
  '/vouchers/search',
  requireAuth,
  validate([body('query').isString().trim()]),
  asyncHandler(async (req, res) => {
    const query = (req.body.query as string).trim().toLowerCase();
    const redemptions = await prisma.redemption.findMany({
      where: {
        userId: req.user!.id,
        voucherCode: { contains: query, mode: 'insensitive' },
      },
      include: { reward: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ data: redemptions });
  }),
);

/** POST /rewards/voucher/:code/applicability — check if a voucher is applicable
 *  given optional quote context: budget, categoryId.
 *  Returns { applicable, reason? } so the frontend can grey out inapplicable vouchers. */
rewardsRouter.post(
  '/voucher/:code/applicability',
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = req.params.code.trim();
    const contextBudget = req.body.budget !== undefined ? Number(req.body.budget) : null;
    // Accept categoryId for future category-scoped voucher checks
    void ((req.body.categoryId as string | undefined)?.trim() ?? null);

    const redemption = await prisma.redemption.findUnique({
      where: { voucherCode: code },
      include: { reward: true },
    });

    if (!redemption || redemption.userId !== req.user!.id) {
      res.json({ applicable: false, reason: 'Voucher not found' });
      return;
    }

    if (redemption.status !== 'active') {
      res.json({ applicable: false, reason: `Voucher is ${redemption.status}` });
      return;
    }

    if (redemption.expiresAt && redemption.expiresAt < new Date()) {
      res.json({ applicable: false, reason: 'Voucher has expired' });
      return;
    }

    const discountType = redemption.reward.discountType;

    // For topup_fixed / topup_bonus: check minTopup against context budget
    if (discountType === 'topup_fixed' || discountType === 'topup_bonus') {
      const minTopup = redemption.reward.minTopup ? Number(redemption.reward.minTopup) : 0;
      if (contextBudget !== null && contextBudget < minTopup) {
        res.json({
          applicable: false,
          reason: `Minimum RM ${minTopup} top-up required`,
        });
        return;
      }
    }

    res.json({ applicable: true });
  }),
);

/** POST /rewards/voucher/:code/apply — apply a voucher (mark used). */
rewardsRouter.post(
  '/voucher/:code/apply',
  requireAuth,
  asyncHandler(async (req, res) => {
    const redemption = await prisma.redemption.findUnique({
      where: { voucherCode: req.params.code },
      include: { reward: true },
    });
    if (!redemption) throw notFound('Voucher not found');
    if (redemption.userId !== req.user!.id) throw badRequest('This voucher does not belong to you');
    if (redemption.status !== 'active') throw badRequest('Voucher is already used or expired');

    const updated = await prisma.redemption.update({
      where: { id: redemption.id },
      data: { status: 'used', usedAt: new Date() },
    });

    res.json({
      voucherCode: updated.voucherCode,
      discountAmount: Number(redemption.reward.discountValue),
      rewardName: redemption.reward.name,
      status: 'used',
    });
  }),
);

/**
 * Customer personal rewards router — mounted at /user.
 * Handles /me/points, /me/points/history, /me/rewards, /me/rewards/:rewardId/redeem, /me/rewards/prompt.
 */
export const customerRewardsRouter = Router();
customerRewardsRouter.use(requireAuth, requireCustomer);

/** GET /user/me/points — points balance + tier info. */
customerRewardsRouter.get(
  '/me/points',
  asyncHandler(async (req, res) => {
    // Track last visit to rewards section
    await prisma.customerPoints.upsert({
      where: { userId: req.user!.id },
      update: { lastRewardsVisit: new Date() },
      create: { userId: req.user!.id, lastRewardsVisit: new Date() },
    }).catch(() => {});

    const data = await getUserPoints(req.user!.id);
    res.json(data);
  }),
);

/** GET /user/me/points/history — paginated transaction log. */
customerRewardsRouter.get(
  '/me/points/history',
  asyncHandler(async (req, res) => {
    const pp = parsePageParams(req);
    const where = { userId: req.user!.id };
    const [data, total] = await Promise.all([
      prisma.pointsTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pp.skip,
        take: pp.limit,
      }),
      prisma.pointsTransaction.count({ where }),
    ]);
    sendList(res, data, buildPagination(pp.page, pp.limit, total));
  }),
);

/** GET /user/me/rewards — user's redemptions. */
customerRewardsRouter.get(
  '/me/rewards',
  asyncHandler(async (req, res) => {
    const redemptions = await prisma.redemption.findMany({
      where: { userId: req.user!.id },
      include: { reward: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: redemptions });
  }),
);

/** POST /user/me/rewards/:rewardId/redeem — redeem points for a voucher. */
customerRewardsRouter.post(
  '/me/rewards/:rewardId/redeem',
  asyncHandler(async (req, res) => {
    const result = await redeemPoints(req.user!.id, req.params.rewardId);
    res.status(201).json(result);
  }),
);

/** GET /user/me/rewards/prompt — check re-engagement banner. */
customerRewardsRouter.get(
  '/me/rewards/prompt',
  asyncHandler(async (req, res) => {
    const points = await prisma.customerPoints.findUnique({ where: { userId: req.user!.id } });
    if (!points || points.balance <= 0) {
      res.json({ show: false, points: 0, lastVisitDays: 0 });
      return;
    }
    const lastVisit = points.lastRewardsVisit;
    if (!lastVisit) {
      res.json({ show: true, points: points.balance, lastVisitDays: 999 });
      return;
    }
    const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / 86_400_000);
    res.json({ show: daysSince >= 3, points: points.balance, lastVisitDays: daysSince });
  }),
);

/**
 * Admin rewards router — mounted at /admin.
 * All mutation routes are PIN-gated.
 */
export const adminRewardsRouter = Router();
adminRewardsRouter.use(requireAuth, requireAdmin);

/** GET /admin/rewards — list all rewards (incl. inactive). */
adminRewardsRouter.get(
  '/rewards',
  asyncHandler(async (_req, res) => {
    const rewards = await prisma.reward.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ data: rewards });
  }),
);

/** POST /admin/rewards — create reward (PIN-gated). */
adminRewardsRouter.post(
  '/rewards',
  requirePin,
  validate([
    body('name').isString().trim().notEmpty(),
    body('description').optional({ values: 'null' }).isString(),
    body('pointCost').isInt({ min: 1 }),
    body('discountType').isIn(['topup_fixed', 'booking_percent', 'waiver', 'topup_bonus']),
    body('discountValue').isFloat({ min: 0.01 }),
    body('maxDiscount').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('minTopup').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('sortOrder').optional().isInt({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    const reward = await prisma.reward.create({
      data: {
        name: req.body.name,
        description: req.body.description ?? null,
        pointCost: req.body.pointCost,
        discountType: req.body.discountType,
        discountValue: req.body.discountValue,
        maxDiscount: req.body.maxDiscount ?? null,
        minTopup: req.body.minTopup ?? null,
        sortOrder: req.body.sortOrder ?? 0,
      },
    });
    res.status(201).json(reward);
  }),
);

/** PATCH /admin/rewards/:id — update reward (PIN-gated). */
adminRewardsRouter.patch(
  '/rewards/:id',
  requirePin,
  validate([
    body('name').optional().isString().trim().notEmpty(),
    body('description').optional({ values: 'null' }).isString(),
    body('pointCost').optional().isInt({ min: 1 }),
    body('discountType').optional().isIn(['topup_fixed', 'booking_percent', 'waiver', 'topup_bonus']),
    body('discountValue').optional().isFloat({ min: 0.01 }),
    body('maxDiscount').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('minTopup').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('active').optional().isBoolean(),
    body('sortOrder').optional().isInt({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    const existing = await prisma.reward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Reward not found');

    const upd: Record<string, unknown> = {};
    for (const k of ['name', 'description', 'pointCost', 'discountType', 'discountValue', 'maxDiscount', 'minTopup', 'active', 'sortOrder'] as const) {
      if (req.body[k] !== undefined) upd[k] = req.body[k];
    }

    const reward = await prisma.reward.update({ where: { id: req.params.id }, data: upd });
    res.json(reward);
  }),
);

/** DELETE /admin/rewards/:id — soft-delete reward (PIN-gated). */
adminRewardsRouter.delete(
  '/rewards/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.reward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Reward not found');
    await prisma.reward.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Reward deactivated' });
  }),
);

/** GET /admin/rewards/redemptions — all redemptions log. */
adminRewardsRouter.get(
  '/rewards/redemptions',
  asyncHandler(async (req, res) => {
    const pp = parsePageParams(req, 'createdAt');
    const where: Record<string, unknown> = {};
    if (req.query.status) where.status = req.query.status;
    const [data, total] = await Promise.all([
      prisma.redemption.findMany({
        where,
        include: { reward: { select: { name: true } }, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pp.skip,
        take: pp.limit,
      }),
      prisma.redemption.count({ where }),
    ]);
    sendList(res, data, buildPagination(pp.page, pp.limit, total));
  }),
);

/** POST /admin/rewards/redemptions/:id/void — void a redemption (PIN-gated). */
adminRewardsRouter.post(
  '/rewards/redemptions/:id/void',
  requirePin,
  asyncHandler(async (req, res) => {
    const red = await prisma.redemption.findUnique({ where: { id: req.params.id } });
    if (!red) throw notFound('Redemption not found');
    const updated = await prisma.redemption.update({
      where: { id: req.params.id },
      data: { status: 'expired' },
    });
    res.json(updated);
  }),
);

// ── Loyalty Tier admin endpoints ──

/** GET /admin/rewards/tiers — list all tiers. */
adminRewardsRouter.get(
  '/rewards/tiers',
  asyncHandler(async (_req, res) => {
    const tiers = await prisma.loyaltyTier.findMany({ orderBy: { minPoints: 'asc' } });
    res.json({ data: tiers });
  }),
);

/** POST /admin/rewards/tiers — create tier (PIN-gated). */
adminRewardsRouter.post(
  '/rewards/tiers',
  requirePin,
  validate([
    body('name').isString().trim().notEmpty(),
    body('minPoints').isInt({ min: 0 }),
    body('bonusPercent').optional().isInt({ min: 0 }),
    body('badgeColor').optional({ values: 'null' }).isString(),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('active').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const tier = await prisma.loyaltyTier.create({
      data: {
        name: req.body.name,
        minPoints: req.body.minPoints,
        bonusPercent: req.body.bonusPercent ?? 0,
        badgeColor: req.body.badgeColor ?? null,
        sortOrder: req.body.sortOrder ?? 0,
        active: req.body.active ?? true,
      },
    });
    invalidateTierCache();
    res.status(201).json(tier);
  }),
);

/** PATCH /admin/rewards/tiers/:id — update tier (PIN-gated). */
adminRewardsRouter.patch(
  '/rewards/tiers/:id',
  requirePin,
  validate([
    body('name').optional().isString().trim().notEmpty(),
    body('minPoints').optional().isInt({ min: 0 }),
    body('bonusPercent').optional().isInt({ min: 0 }),
    body('badgeColor').optional({ values: 'null' }).isString(),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('active').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const existing = await prisma.loyaltyTier.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Tier not found');

    const upd: Record<string, unknown> = {};
    for (const k of ['name', 'minPoints', 'bonusPercent', 'badgeColor', 'sortOrder', 'active'] as const) {
      if (req.body[k] !== undefined) upd[k] = req.body[k];
    }

    const tier = await prisma.loyaltyTier.update({ where: { id: req.params.id }, data: upd });
    invalidateTierCache();
    res.json(tier);
  }),
);

/** DELETE /admin/rewards/tiers/:id — delete tier (PIN-gated). */
adminRewardsRouter.delete(
  '/rewards/tiers/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.loyaltyTier.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Tier not found');
    await prisma.loyaltyTier.delete({ where: { id: req.params.id } });
    invalidateTierCache();
    res.json({ message: 'Tier deleted' });
  }),
);

/**
 * GET /admin/rewards/calculator — server-side reward value analysis.
 *
 * Reads points_per_rm and redemption_rate from platform_settings and computes
 * the effective return rate + a table of discount values vs customer spend.
 * All financial math lives here, NOT on the frontend.
 */
adminRewardsRouter.get(
  '/rewards/calculator',
  asyncHandler(async (_req, res) => {
    const settings = await prisma.platformSettings.findMany({
      where: { key: { in: ['points_per_rm', 'redemption_rate'] } },
    });
    const byKey = new Map(settings.map((s) => [s.key, s.value]));

    const pointsPerRm = typeof byKey.get('points_per_rm') === 'number'
      ? (byKey.get('points_per_rm') as number)
      : 1;
    const redemptionRate = typeof byKey.get('redemption_rate') === 'number'
      ? (byKey.get('redemption_rate') as number)
      : 100;

    const effectiveRate = Math.round((pointsPerRm / redemptionRate) * 100 * 100) / 100;
    const pointValue = parseFloat((1 / redemptionRate).toFixed(4));

    const rows = [10, 20, 50, 100, 200].map((d) => {
      const points = d * redemptionRate;
      const spend = points / pointsPerRm;
      const costPct = d <= spend ? Math.round((d / spend) * 100) : null;
      return {
        discount: d,
        pointsNeeded: points,
        customerSpend: Math.round(spend * 100) / 100,
        costToPlatform: costPct !== null ? `${costPct}% of spend` : '⚠️ Exceeds spend',
      };
    });

    res.json({
      effectiveReturnRate: effectiveRate,
      pointValue,
      rows,
    });
  }),
);
