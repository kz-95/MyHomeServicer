import { Router } from 'express';
import { body } from 'express-validator';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { questionSchemaSchema, checkQuestionSchemaImmutability } from '../lib/json-schemas';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { requirePin } from '../middleware/pin';
import { pinLimiter } from '../middleware/rate-limit';
import { idempotency } from '../middleware/idempotency';
import { validate } from '../middleware/validate';
import { parsePageParams, buildPagination } from '../lib/http';
import { notFound, badRequest } from '../lib/errors';
import { recordAudit } from '../services/ledger.service';
import {
  getDashboard,
  getDashboardRevenue,
  listMerchants,
  getMerchantDetail,
  setMerchantBan,
  listUsers,
  getUserDetail,
  updateUserInfo,
  getUserActivity,
  listWithdrawals,
  reviewWithdrawal,
  markWithdrawalPaid,
  listAppeals,
  reviewAppeal,
  listCategoryRequests,
  reviewCategoryRequest,
  listDepositTopups,
  creditDepositTopup,
  listSettings,
  updateSetting,
  updateAdminEmail,
  updateAdminPassword,
  updateAdminPin,
  updateAdminBackupEmail,
  getAdminBackupEmail,
} from '../services/admin.service';
import { listIdentityChangeRequests, updateIdentityChangeRequest } from '../services/identity-change.service';

/** Admin panel router (`/admin/*`). Settings-mutating routes also require PIN. */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const ip = (req: { ip?: string }) => req.ip;

/** In-memory short-lived PIN token store (would use Redis in production). */
const pinTokenStore = new Map<string, { userId: string; expiresAt: number }>();

// ── Dashboard ────────────────────────────────────────────────────────────────
adminRouter.get('/dashboard', asyncHandler(async (_req, res) => res.json(await getDashboard())));
adminRouter.get(
  '/dashboard/revenue',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    res.json({ data: await getDashboardRevenue(days) });
  }),
);

// ── Action PIN pre-validation ────────────────────────────────────────────────
// Rate limited to 5 attempts / 15 min per admin (security-notes.md §6).
adminRouter.post(
  '/verify-pin',
  pinLimiter,
  requirePin,
  asyncHandler(async (_req, res) => res.json({ valid: true })),
);

// ── Servicer management ──────────────────────────────────────────────────────
adminRouter.get(
  '/merchants',
  asyncHandler(async (req, res) => {
    res.json({ data: await listMerchants(req.query.kycStatus as string | undefined) });
  }),
);
adminRouter.get(
  '/merchants/:id',
  asyncHandler(async (req, res) => res.json(await getMerchantDetail(req.params.id))),
);
adminRouter.post(
  '/merchants/:id/ban',
  requirePin,
  validate([body('reason').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    await setMerchantBan(req.user!.id, req.params.id, true, req.body.reason, ip(req));
    res.status(204).send();
  }),
);
adminRouter.post(
  '/merchants/:id/unban',
  requirePin,
  validate([body('adminNote').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    await setMerchantBan(req.user!.id, req.params.id, false, req.body.adminNote, ip(req));
    res.status(204).send();
  }),
);

// ── User management ──────────────────────────────────────────────────────────
// The whole user-management area is PIN-gated — it exposes personal data and
// allows account edits, so every request must carry a valid X-Action-Pin.
adminRouter.get(
  '/users',
  requirePin,
  asyncHandler(async (req, res) => {
    const page = parsePageParams(req);
    const { data, total } = await listUsers({
      search: req.query.search as string | undefined,
      role: req.query.role as string | undefined,
      skip: page.skip,
      limit: page.limit,
    });
    res.json({ data, pagination: buildPagination(page.page, page.limit, total) });
  }),
);
adminRouter.get(
  '/users/:id',
  requirePin,
  asyncHandler(async (req, res) => res.json(await getUserDetail(req.params.id))),
);

/** GET /admin/users/:id/activity — info-update history + account activity. */
adminRouter.get(
  '/users/:id/activity',
  requirePin,
  asyncHandler(async (req, res) => res.json(await getUserActivity(req.params.id))),
);

/** PATCH /admin/users/:id — edit a user's info; a reason is mandatory. */
adminRouter.patch(
  '/users/:id',
  requirePin,
  validate([
    body('reason').isString().trim().isLength({ min: 3 }).withMessage('A reason is required'),
    body('name').optional({ values: 'null' }).isString().trim().notEmpty(),
    body('email').optional({ values: 'null' }).isEmail(),
    body('phone').optional({ values: 'null' }).isString().trim().notEmpty(),
    body('role').optional({ values: 'null' }).isIn(['customer', 'admin']),
    body('businessName').optional({ values: 'null' }).isString().trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { reason, name, email, phone, role, businessName } = req.body;
    const updated = await updateUserInfo(
      req.user!.id,
      req.params.id,
      { name, email, phone, role, businessName },
      reason,
      ip(req),
    );
    res.json(updated);
  }),
);

// ── Reports ──────────────────────────────────────────────────────────────────
adminRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const data = await prisma.report.findMany({
      where: {
        ...(status ? { status: status as 'open' | 'resolved' } : {}),
        ...(search ? { subject: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data });
  }),
);
adminRouter.patch(
  '/reports/:id',
  requirePin,
  validate([body('status').isIn(['open', 'resolved'])]),
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) throw notFound('Report not found');
    const updated = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        status: req.body.status,
        adminNote: req.body.adminNote ?? null,
        resolvedAt: req.body.status === 'resolved' ? new Date() : null,
      },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'report.update',
      entityType: 'Report',
      entityId: req.params.id,
      newValue: { status: req.body.status },
      ipAddress: ip(req),
    });
    res.json(updated);
  }),
);

// ── Penalty appeals ──────────────────────────────────────────────────────────
adminRouter.get(
  '/appeals',
  asyncHandler(async (req, res) => {
    res.json({ data: await listAppeals(req.query.status as string | undefined) });
  }),
);
adminRouter.patch(
  '/appeals/:id',
  requirePin,
  validate([body('status').isIn(['approved', 'rejected'])]),
  asyncHandler(async (req, res) => {
    res.json(
      await reviewAppeal(req.user!.id, req.params.id, req.body.status, req.body.adminNote ?? '', ip(req)),
    );
  }),
);

// ── Category requests ────────────────────────────────────────────────────────
adminRouter.get(
  '/category-requests',
  asyncHandler(async (req, res) => {
    res.json({ data: await listCategoryRequests(req.query.status as string | undefined) });
  }),
);
adminRouter.patch(
  '/category-requests/:id',
  requirePin,
  validate([
    body('status').isIn(['approved', 'rejected']),
    // On approval the admin must supply the full category definition.
    body('name')
      .if(body('status').equals('approved'))
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Category name is required to approve'),
    body('defaultPriceSuggestion')
      .if(body('status').equals('approved'))
      .isFloat({ min: 0 })
      .withMessage('Default price suggestion is required to approve'),
    body('defaultEstimatedDurationMinutes')
      .if(body('status').equals('approved'))
      .isInt({ min: 1 })
      .withMessage('Default duration (minutes) is required to approve'),
    body('adminNote')
      .if(body('status').equals('approved'))
      .isString()
      .trim()
      .notEmpty()
      .withMessage('An admin note is required to approve'),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await reviewCategoryRequest(req.user!.id, req.params.id, req.body, ip(req)));
  }),
);

// ── Categories ────────────────────────────────────────────────────────────────

/** PATCH /admin/categories/:id — update category fields. PIN-gated. */
adminRouter.patch(
  '/categories/:id',
  requirePin,
  validate([
    body('name').optional().isString().trim().notEmpty(),
    body('icon').optional({ values: 'null' }).isString(),
    body('imageUrl').optional({ values: 'null' }).isString(),
    body('allowedTimeSlots').optional().isArray(),
    body('allowedTimeSlots.*').optional().isString(),
    body('defaultPriceSuggestion').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('defaultEstimatedDurationMinutes').optional({ values: 'null' }).isInt({ min: 1 }),
    body('questionSchema').optional().isArray(),
    body('published').optional().isBoolean(),
    body('bannerUrl').optional({ values: 'null' }).isString(),
    body('cardColor').optional({ values: 'null' }).isString(),
    body('description').optional({ values: 'null' }).isString(),
  ]),
  asyncHandler(async (req, res) => {
    const cat = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!cat) throw notFound('Category not found');

    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.icon !== undefined) data.icon = req.body.icon ?? null;
    if (req.body.imageUrl !== undefined) data.imageUrl = req.body.imageUrl ?? null;
    if (req.body.allowedTimeSlots !== undefined) data.allowedTimeSlots = req.body.allowedTimeSlots;
    if (req.body.defaultPriceSuggestion !== undefined)
      data.defaultPriceSuggestion = req.body.defaultPriceSuggestion != null
        ? new Prisma.Decimal(req.body.defaultPriceSuggestion) : null;
    if (req.body.defaultEstimatedDurationMinutes !== undefined)
      data.defaultEstimatedDurationMinutes = req.body.defaultEstimatedDurationMinutes ?? null;
    if (req.body.published !== undefined) data.published = req.body.published;
    if (req.body.bannerUrl !== undefined) data.bannerUrl = req.body.bannerUrl ?? null;
    if (req.body.cardColor !== undefined) data.cardColor = req.body.cardColor ?? null;
    if (req.body.description !== undefined) data.description = req.body.description ?? null;

    if (req.body.questionSchema !== undefined) {
      const parsed = questionSchemaSchema.safeParse(req.body.questionSchema);
      if (!parsed.success) throw badRequest('Invalid questionSchema: ' + parsed.error.message);

      if (cat.questionSchema != null) {
        const existingParsed = questionSchemaSchema.safeParse(cat.questionSchema);
        if (!existingParsed.success) {
          throw badRequest('Stored questionSchema is corrupt — cannot safely apply changes.');
        }
        const err = checkQuestionSchemaImmutability(existingParsed.data, parsed.data);
        if (err) throw badRequest(err);
      }
      data.questionSchema = parsed.data;
    }

    const updated = await prisma.category.update({ where: { id: req.params.id }, data });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'category.update',
      entityType: 'Category',
      entityId: req.params.id,
      oldValue: {
        name: cat.name, icon: cat.icon, imageUrl: cat.imageUrl,
        allowedTimeSlots: cat.allowedTimeSlots,
        defaultPriceSuggestion: cat.defaultPriceSuggestion,
        questionSchema: cat.questionSchema,
        published: cat.published,
        bannerUrl: cat.bannerUrl, cardColor: cat.cardColor, description: cat.description,
      },
      newValue: {
        name: updated.name, icon: updated.icon, imageUrl: updated.imageUrl,
        allowedTimeSlots: updated.allowedTimeSlots,
        defaultPriceSuggestion: updated.defaultPriceSuggestion,
        questionSchema: updated.questionSchema,
        published: updated.published,
        bannerUrl: updated.bannerUrl, cardColor: updated.cardColor, description: updated.description,
      },
      ipAddress: ip(req),
    });
    res.json(updated);
  }),
);

function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

/** POST /admin/categories — create a new category. PIN-gated. */
adminRouter.post(
  '/categories',
  requirePin,
  validate([
    body('name').isString().trim().notEmpty().withMessage('name is required'),
    body('slug').optional().isString().trim(),
    body('icon').optional().isString(),
    body('imageUrl').optional().isString(),
    body('parentCategoryId').optional({ values: 'null' }).isUUID(),
    body('defaultPriceSuggestion').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('defaultEstimatedDurationMinutes').optional({ values: 'null' }).isInt({ min: 1 }),
    body('published').optional().isBoolean(),
    body('bannerUrl').optional({ values: 'null' }).isString(),
    body('cardColor').optional({ values: 'null' }).isString(),
    body('description').optional({ values: 'null' }).isString(),
  ]),
  asyncHandler(async (req, res) => {
    const slug = req.body.slug ? req.body.slug.toLowerCase().trim() : toSlug(req.body.name);
    if (!slug) throw badRequest('Could not derive a valid slug from the name.');

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) throw badRequest(`Slug "${slug}" is already taken.`);

    const created = await prisma.category.create({
      data: {
        name: req.body.name,
        slug,
        icon: req.body.icon ?? null,
        imageUrl: req.body.imageUrl ?? null,
        parentCategoryId: req.body.parentCategoryId ?? null,
        defaultPriceSuggestion: req.body.defaultPriceSuggestion != null
          ? new Prisma.Decimal(req.body.defaultPriceSuggestion) : null,
        defaultEstimatedDurationMinutes: req.body.defaultEstimatedDurationMinutes ?? null,
        published: req.body.published ?? false,
        bannerUrl: req.body.bannerUrl ?? null,
        cardColor: req.body.cardColor ?? null,
        description: req.body.description ?? null,
        questionSchema: [],
        allowedTimeSlots: ['morning', 'noon', 'afternoon', 'evening', 'night'],
      },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'category.create',
      entityType: 'Category',
      entityId: created.id,
      oldValue: null,
      newValue: { name: created.name, slug: created.slug },
      ipAddress: ip(req),
    });
    res.status(201).json(created);
  }),
);

/** DELETE /admin/categories/:id — soft-delete. Blocked when active listings or open
 *  quote requests exist. PIN-gated. */
adminRouter.delete(
  '/categories/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const cat = await prisma.category.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!cat) throw notFound('Category not found');
    if (cat.deletedAt) throw badRequest('Category is already deleted.');

    const activeService = await prisma.merchantService.findFirst({
      where: { categoryId: req.params.id, deletedAt: null },
      select: { id: true },
    });
    if (activeService) {
      throw badRequest('Cannot delete: active service listings exist for this category. Remove them first.');
    }

    const openQuote = await prisma.quoteRequest.findFirst({
      where: { categoryId: req.params.id, status: { in: ['open', 'matched', 'reposted'] } },
      select: { id: true },
    });
    if (openQuote) {
      throw badRequest('Cannot delete: open quote requests exist for this category.');
    }

    const deleted = await prisma.category.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'category.delete',
      entityType: 'Category',
      entityId: req.params.id,
      oldValue: { name: cat.name },
      newValue: { deletedAt: deleted.deletedAt },
      ipAddress: ip(req),
    });
    res.json({ ok: true });
  }),
);

/** GET /admin/categories/:id/question-impact?key=<questionKey>
 *  Returns { key, count } — number of MerchantService rows whose modifiers JSONB
 *  contains the given question key. Used by the editor to warn before deactivating
 *  a question or flipping its priced flag. */
adminRouter.get(
  '/categories/:id/question-impact',
  asyncHandler(async (req, res) => {
    const { key } = req.query;
    if (!key || typeof key !== 'string') throw badRequest('key query param is required');

    const cat = await prisma.category.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!cat) throw notFound('Category not found');

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM merchant_services
      WHERE category_id = ${req.params.id}::uuid
        AND deleted_at IS NULL
        AND modifiers ? ${key}
    `;
    res.json({ key, count: Number(rows[0].count) });
  }),
);

/** POST /admin/categories/bulk-publish — bulk publish/unpublish categories. PIN-gated, audited. */
adminRouter.post(
  '/categories/bulk-publish',
  requirePin,
  validate([
    body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
    body('ids.*').isUUID().withMessage('each id must be a valid UUID'),
    body('published').isBoolean().withMessage('published must be a boolean'),
  ]),
  asyncHandler(async (req, res) => {
    const { ids, published } = req.body;

    const existing = await prisma.category.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing.length !== ids.length) {
      const found = new Set(existing.map((c) => c.id));
      const missing = ids.filter((id: string) => !found.has(id));
      throw badRequest(`Categories not found or deleted: ${missing.join(', ')}`);
    }

    await prisma.category.updateMany({
      where: { id: { in: ids } },
      data: { published },
    });

    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: published ? 'category.bulk_publish' : 'category.bulk_unpublish',
      entityType: 'Category',
      entityId: ids.join(','),
      oldValue: null,
      newValue: { ids, published },
      ipAddress: ip(req),
    });

    res.json({ updated: ids.length });
  }),
);

/** GET /admin/categories — all non-deleted categories with active listing count
 *  and average price stats. Admin only.
 *  `averagePrice` is rounded 2dp. For parent (top-level) categories, average = aggregate
 *  of children; `priceStatListingCount` reflects the same scope. */
adminRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { services: { where: { deletedAt: null } } },
        },
      },
    });

    const priceRows = await prisma.$queryRaw<
      Array<{ category_id: string; avg_price: string | null; listing_count: bigint }>
    >`
      SELECT category_id, ROUND(AVG(base_price)::numeric, 2) AS avg_price, COUNT(*)::bigint AS listing_count
      FROM merchant_services
      WHERE deleted_at IS NULL
      GROUP BY category_id
    `;

    const priceMap = new Map<string, { avgPrice: number | null; count: number }>();
    for (const r of priceRows) {
      priceMap.set(r.category_id, {
        avgPrice: r.avg_price ? Number(r.avg_price) : null,
        count: Number(r.listing_count),
      });
    }

    const childMap = new Map<string, string[]>();
    for (const c of categories) {
      if (c.parentCategoryId) {
        const kids = childMap.get(c.parentCategoryId) ?? [];
        kids.push(c.id);
        childMap.set(c.parentCategoryId, kids);
      }
    }

    function aggregateForParent(parentId: string): { avgPrice: number | null; count: number } {
      const childIds = childMap.get(parentId) ?? [];
      let total = 0;
      let totalCount = 0;
      for (const childId of childIds) {
        const s = priceMap.get(childId);
        if (s && s.avgPrice != null && s.count > 0) {
          total += s.avgPrice * s.count;
          totalCount += s.count;
        }
      }
      return {
        avgPrice: totalCount > 0 ? Math.round((total / totalCount) * 100) / 100 : null,
        count: totalCount,
      };
    }

    res.json({
      data: categories.map((c) => {
        let averagePrice: number | null = null;
        let priceStatListingCount = 0;

        if (!c.parentCategoryId) {
          const agg = aggregateForParent(c.id);
          averagePrice = agg.avgPrice;
          priceStatListingCount = agg.count;
        } else {
          const s = priceMap.get(c.id);
          averagePrice = s?.avgPrice ?? null;
          priceStatListingCount = s?.count ?? 0;
        }

        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          imageUrl: c.imageUrl,
          parentCategoryId: c.parentCategoryId,
          defaultPriceSuggestion: c.defaultPriceSuggestion,
          defaultEstimatedDurationMinutes: c.defaultEstimatedDurationMinutes,
          questionSchema: c.questionSchema ?? null,
          allowedTimeSlots: c.allowedTimeSlots,
          published: c.published,
          bannerUrl: c.bannerUrl,
          cardColor: c.cardColor,
          description: c.description,
          activeListingCount: c._count.services,
          averagePrice,
          priceStatListingCount,
          deletedAt: c.deletedAt,
        };
      }),
    });
  }),
);

// ── Withdrawals ──────────────────────────────────────────────────────────────
adminRouter.get(
  '/withdrawals',
  asyncHandler(async (req, res) => {
    res.json({ data: await listWithdrawals(req.query.status as string | undefined) });
  }),
);
adminRouter.patch(
  '/withdrawals/:id',
  requirePin,
  validate([body('status').isIn(['approved', 'rejected'])]),
  asyncHandler(async (req, res) => {
    res.json(
      await reviewWithdrawal(req.user!.id, req.params.id, req.body.status, req.body.adminNote ?? '', ip(req)),
    );
  }),
);
adminRouter.post(
  '/withdrawals/:id/mark-paid',
  requirePin,
  idempotency,
  asyncHandler(async (req, res) => {
    res.json(await markWithdrawalPaid(req.user!.id, req.params.id, ip(req)));
  }),
);

// ── Deposit top-ups ──────────────────────────────────────────────────────────
adminRouter.get(
  '/deposit-topups',
  asyncHandler(async (req, res) => {
    res.json({ data: await listDepositTopups(req.query.status as string | undefined) });
  }),
);
adminRouter.post(
  '/deposit-topups/:id/credit',
  requirePin,
  idempotency,
  validate([body('adminNote').optional().isString().trim().isLength({ max: 500 })]),
  asyncHandler(async (req, res) => {
    await creditDepositTopup(req.user!.id, req.params.id, req.body.adminNote ?? '', ip(req));
    res.status(204).send();
  }),
);

// ── Settings ─────────────────────────────────────────────────────────────────
adminRouter.get('/settings', asyncHandler(async (_req, res) => res.json({ data: await listSettings() })));
adminRouter.patch(
  '/settings',
  requirePin,
  validate([body('key').isString().notEmpty(), body('value').exists()]),
  asyncHandler(async (req, res) => {
    res.json(await updateSetting(req.user!.id, req.body.key, req.body.value, ip(req)));
  }),
);

// ── Admin Self-Service (PIN-gated) ──────────────────────────────────────────
adminRouter.patch(
  '/me/email',
  requirePin,
  validate([body('email').isEmail()]),
  asyncHandler(async (req, res) => {
    const result = await updateAdminEmail(req.user!.id, req.body.email);
    await recordAudit({ actorUserId: req.user!.id, actorType: 'admin', action: 'admin.email.changed', newValue: { oldPrefix: result.oldEmail.substring(0, 3) } });
    res.json({ message: 'Email updated.' });
  }),
);

adminRouter.patch(
  '/me/password',
  requirePin,
  validate([
    body('oldPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 8 }).matches(/[0-9]/),
  ]),
  asyncHandler(async (req, res) => {
    await updateAdminPassword(req.user!.id, req.body.oldPassword, req.body.newPassword);
    await recordAudit({ actorUserId: req.user!.id, actorType: 'admin', action: 'admin.password.changed', newValue: {} });
    res.json({ message: 'Password updated.' });
  }),
);

adminRouter.patch(
  '/me/pin',
  requirePin,
  validate([
    body('oldPin').isString().isLength({ min: 6, max: 6 }),
    body('newPin').isString().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/),
  ]),
  asyncHandler(async (req, res) => {
    await updateAdminPin(req.user!.id, req.body.oldPin, req.body.newPin);
    await recordAudit({ actorUserId: req.user!.id, actorType: 'admin', action: 'admin.pin.changed', newValue: {} });
    res.json({ message: 'PIN updated.' });
  }),
);

adminRouter.patch(
  '/me/backup-email',
  requirePin,
  validate([body('email').isEmail()]),
  asyncHandler(async (req, res) => {
    await updateAdminBackupEmail(req.user!.id, req.body.email);
    await recordAudit({ actorUserId: req.user!.id, actorType: 'admin', action: 'admin.backup-email.set', newValue: { masked: `${req.body.email.substring(0, 2)}***` } });
    res.json({ message: 'Backup email updated.' });
  }),
);

adminRouter.get(
  '/me/backup-email',
  requirePin,
  asyncHandler(async (req, res) => {
    const result = await getAdminBackupEmail(req.user!.id);
    res.json(result);
  }),
);

// ── Penalty rules ────────────────────────────────────────────────────────────
adminRouter.get(
  '/penalty-rules',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.penaltyRule.findMany({ orderBy: { type: 'asc' } }) });
  }),
);
adminRouter.patch(
  '/penalty-rules/:id',
  requirePin,
  validate([
    body('amount').optional().isFloat({ min: 0 }),
    body('calcMode').optional().isIn(['fixed', 'percentage']),
    body('isActive').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const rule = await prisma.penaltyRule.findUnique({ where: { id: req.params.id } });
    if (!rule) throw notFound('Penalty rule not found');
    const updated = await prisma.penaltyRule.update({
      where: { id: req.params.id },
      data: {
        amount: req.body.amount ?? rule.amount,
        calcMode: req.body.calcMode ?? rule.calcMode,
        isActive: req.body.isActive ?? rule.isActive,
      },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'penalty_rule.update',
      entityType: 'PenaltyRule',
      entityId: req.params.id,
      oldValue: { amount: rule.amount },
      newValue: { amount: updated.amount },
      ipAddress: ip(req),
    });
    res.json(updated);
  }),
);

// ── Feature flags ────────────────────────────────────────────────────────────
adminRouter.get(
  '/feature-flags',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }) });
  }),
);
adminRouter.patch(
  '/feature-flags/:id',
  requirePin,
  validate([body('isEnabled').isBoolean()]),
  asyncHandler(async (req, res) => {
    const flag = await prisma.featureFlag.findUnique({ where: { id: req.params.id } });
    if (!flag) throw notFound('Feature flag not found');
    const updated = await prisma.featureFlag.update({
      where: { id: req.params.id },
      data: { isEnabled: req.body.isEnabled },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'feature_flag.update',
      entityType: 'FeatureFlag',
      entityId: req.params.id,
      oldValue: { isEnabled: flag.isEnabled },
      newValue: { isEnabled: updated.isEnabled },
      ipAddress: ip(req),
    });
    res.json(updated);
  }),
);

// ── Promotions (platform) ────────────────────────────────────────────────────
adminRouter.get(
  '/promotions',
  asyncHandler(async (req, res) => {
    const search = req.query.search as string | undefined;
    const filterActive = req.query.active as string | undefined;

    const where: Record<string, unknown> = {};
    if (search) where.label = { contains: search, mode: 'insensitive' };
    if (filterActive === 'true') where.active = true;
    else if (filterActive === 'false') where.active = false;

    const data = await prisma.promotion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data });
  }),
);
adminRouter.post(
  '/promotions',
  requirePin,
  validate([
    body('label').isString().trim().notEmpty(),
    body('triggerType').isString().trim().notEmpty(),
    body('valueType').isIn(['percent', 'fixed']),
    body('value').isFloat({ gt: 0 }),
    body('maxUses').optional({ nullable: true }).isInt({ min: 1 }),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('description').optional().isString(),
    body('targetRole').optional().isIn(['customer', 'servicer', 'all']),
    body('conditions').optional().isObject(),
    body('maxPerUser').optional({ nullable: true }).isInt({ min: 1 }),
    body('startDate').optional({ nullable: true }).isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const promo = await prisma.promotion.create({
      data: {
        label: req.body.label,
        triggerType: req.body.triggerType,
        valueType: req.body.valueType,
        value: req.body.value,
        maxUses: req.body.maxUses ?? null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        description: req.body.description ?? null,
        targetRole: req.body.targetRole ?? 'all',
        conditions: req.body.conditions ?? {},
        maxPerUser: req.body.maxPerUser ?? null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
      },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'promotion.create',
      entityType: 'Promotion',
      entityId: promo.id,
      newValue: promo,
      ipAddress: ip(req),
    });
    res.status(201).json(promo);
  }),
);
adminRouter.patch(
  '/promotions/:id',
  requirePin,
  validate([
    body('label').optional().isString().notEmpty(),
    body('active').optional().isBoolean(),
    body('value').optional().isFloat({ gt: 0 }),
    body('valueType').optional().isIn(['percent', 'fixed']),
    body('maxUses').optional({ nullable: true }).isInt({ min: 1 }),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('triggerType').optional({ nullable: true }).isString(),
    body('description').optional().isString(),
    body('targetRole').optional().isIn(['customer', 'servicer', 'all']),
    body('conditions').optional().isObject(),
    body('maxPerUser').optional({ nullable: true }).isInt({ min: 1 }),
    body('startDate').optional({ nullable: true }).isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const existing = await prisma.promotion.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Promotion not found');
    const updated = await prisma.promotion.update({
      where: { id: req.params.id },
      data: {
        label: req.body.label !== undefined ? req.body.label : existing.label,
        active: req.body.active ?? existing.active,
        value: req.body.value !== undefined ? req.body.value : existing.value,
        valueType: req.body.valueType !== undefined ? req.body.valueType : existing.valueType,
        maxUses: req.body.maxUses !== undefined ? req.body.maxUses : existing.maxUses,
        endDate: req.body.endDate !== undefined ? (req.body.endDate ? new Date(req.body.endDate) : null) : existing.endDate,
        triggerType: req.body.triggerType !== undefined ? req.body.triggerType : existing.triggerType,
        description: req.body.description !== undefined ? req.body.description : existing.description,
        targetRole: req.body.targetRole ?? existing.targetRole,
        conditions: req.body.conditions ?? existing.conditions,
        maxPerUser: req.body.maxPerUser !== undefined ? req.body.maxPerUser : existing.maxPerUser,
        startDate: req.body.startDate !== undefined ? (req.body.startDate ? new Date(req.body.startDate) : null) : existing.startDate,
      },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'promotion.update',
      entityType: 'Promotion',
      entityId: updated.id,
      oldValue: existing,
      newValue: updated,
      ipAddress: ip(req),
    });
    res.json(updated);
  }),
);
adminRouter.delete(
  '/promotions/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.promotion.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Promotion not found');
    await prisma.promotion.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'promotion.deactivate',
      entityType: 'Promotion',
      entityId: existing.id,
      oldValue: { active: existing.active },
      newValue: { active: false },
      ipAddress: ip(req),
    });
    res.json({ message: 'Promotion deactivated.' });
  }),
);

// ── Marketing budget ─────────────────────────────────────────────────────────
adminRouter.get(
  '/marketing-budget',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.platformMarketingBudget.findFirst({ orderBy: { createdAt: 'desc' } }));
  }),
);
adminRouter.post(
  '/marketing-budget',
  requirePin,
  validate([
    body('totalBudget').isFloat({ gt: 0 }),
    body('periodStart').isISO8601(),
    body('periodEnd').isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const budget = await prisma.platformMarketingBudget.create({
      data: {
        totalBudget: req.body.totalBudget,
        periodStart: new Date(req.body.periodStart),
        periodEnd: new Date(req.body.periodEnd),
      },
    });
    res.status(201).json(budget);
  }),
);

// ── Audit log (read-only) ────────────────────────────────────────────────────
adminRouter.get(
  '/audit-log',
  asyncHandler(async (req, res) => {
    const page = parsePageParams(req);
    const where = {
      ...(req.query.action ? { action: req.query.action as string } : {}),
      ...(req.query.actorId ? { actorUserId: req.query.actorId as string } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip: page.skip, take: page.limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ data, pagination: buildPagination(page.page, page.limit, total) });
  }),
);

// ── FAQ ──────────────────────────────────────────────────────────────────────
adminRouter.get(
  '/faq',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.faq.findMany({ orderBy: { sortOrder: 'asc' } }) });
  }),
);
adminRouter.post(
  '/faq',
  requirePin,
  validate([
    body('question').isString().trim().notEmpty().isLength({ max: 500 }),
    body('answer').isString().trim().notEmpty().isLength({ max: 5000 }),
    body('category').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('tier').optional().isIn(['guest', 'customer', 'servicer', 'admin']),
    body('sortOrder').optional().isInt({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    const maxOrder = req.body.sortOrder;
    const sortOrder = maxOrder != null
      ? maxOrder
      : ((await prisma.faq.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;
    const faq = await prisma.faq.create({
      data: {
        question: req.body.question,
        answer: req.body.answer,
        category: req.body.category ?? null,
        tier: req.body.tier ?? 'guest',
        sortOrder,
      },
    });
    res.status(201).json(faq);
  }),
);
adminRouter.patch(
  '/faq/:id',
  requirePin,
  validate([
    body('question').optional().isString().notEmpty(),
    body('answer').optional().isString().notEmpty(),
    body('category').optional({ nullable: true }).isString(),
    body('tier').optional().isIn(['guest', 'customer', 'servicer', 'admin']),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('isPublished').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const faq = await prisma.faq.findUnique({ where: { id: req.params.id } });
    if (!faq) throw notFound('FAQ not found');
    res.json(
      await prisma.faq.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.question !== undefined && { question: req.body.question }),
          ...(req.body.answer !== undefined && { answer: req.body.answer }),
          ...(req.body.category !== undefined && { category: req.body.category }),
          ...(req.body.tier !== undefined && { tier: req.body.tier }),
          ...(req.body.sortOrder !== undefined && { sortOrder: req.body.sortOrder }),
          ...(req.body.isPublished !== undefined && { isPublished: req.body.isPublished }),
        },
      }),
    );
  }),
);
adminRouter.delete(
  '/faq/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const faq = await prisma.faq.findUnique({ where: { id: req.params.id } });
    if (!faq) throw notFound('FAQ not found');
    await prisma.faq.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

// ── Identity change requests ────────────────────────────────────────────────
adminRouter.get(
  '/identity-change-requests',
  asyncHandler(async (req, res) => {
    res.json({ data: await listIdentityChangeRequests(req.query.status as string) });
  }),
);
adminRouter.patch(
  '/identity-change-requests/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const result = await updateIdentityChangeRequest(
      req.params.id,
      req.body.status as 'approved' | 'rejected',
      req.user!.id,
    );
    res.json(result);
  }),
);

// ── FAQ CSV import / export ─────────────────────────────────────────────────
adminRouter.get(
  '/faq/csv',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.faq.findMany({ orderBy: { sortOrder: 'asc' } });
    const header = 'question,answer,category,tier,sortOrder,isPublished';
    const lines = rows.map((r) =>
      [csvCell(r.question), csvCell(r.answer), csvCell(r.category ?? ''), csvCell(r.tier), r.sortOrder, r.isPublished].join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="faq-export.csv"');
    res.send([header, ...lines].join('\n'));
  }),
);
adminRouter.post(
  '/faq/csv',
  requirePin,
  validate([body('csv').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    const lines = req.body.csv.trim().split('\n');
    if (lines.length < 2) throw badRequest('CSV must have a header row and at least one data row');

    const header = parseCsvLine(lines[0]);
    const qi = header.indexOf('question');
    const ai = header.indexOf('answer');
    const ci = header.indexOf('category');
    const ti = header.indexOf('tier');
    const si = header.indexOf('sortOrder');
    const pi = header.indexOf('isPublished');
    if (qi === -1 || ai === -1) throw badRequest('CSV must have question and answer columns');

    let updated = 0;
    let skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const question = cols[qi]?.trim();
      const answer = cols[ai]?.trim();
      if (!question || !answer) continue;

      const existing = await prisma.faq.findFirst({ where: { question } });
      if (!existing) {
        skipped++;
        continue;
      }

      const data: Record<string, unknown> = { answer };
      if (ci !== -1) data.category = cols[ci]?.trim() || null;
      if (ti !== -1) data.tier = cols[ti]?.trim() || 'guest';
      if (si !== -1) data.sortOrder = parseInt(cols[si], 10) || 0;
      if (pi !== -1) data.isPublished = cols[pi]?.trim().toLowerCase() !== 'false';

      await prisma.faq.update({ where: { id: existing.id }, data });
      updated++;
    }

    res.json({ updated, skipped });
  }),
);

// ── Chat ban management ─────────────────────────────────────────────────────
adminRouter.get(
  '/chat-bans',
  asyncHandler(async (_req, res) => {
    const data = await prisma.user.findMany({
      where: { chatBanned: true },
      select: {
        id: true,
        name: true,
        email: true,
        chatStrikeCount: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ data });
  }),
);
adminRouter.post(
  '/chat-bans/:userId/unban',
  requirePin,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) throw notFound('User not found');
    if (!user.chatBanned) throw badRequest('User is not banned');

    await prisma.user.update({
      where: { id: user.id },
      data: { chatBanned: false, chatStrikeCount: 0 },
    });

    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'chat.unban',
      entityType: 'User',
      entityId: user.id,
      oldValue: { chatBanned: true },
      newValue: { chatBanned: false },
      ipAddress: ip(req),
    });

    res.json({ message: `Unbanned ${user.name}` });
  }),
);

// ── AI Chat Settings ─────────────────────────────────────────────────────────
adminRouter.get(
  '/chat/settings',
  asyncHandler(async (_req, res) => {
    const keys = [
      'chat_assistant_enabled', 'chat_quote_enabled', 'chat_profile_enabled',
      'chat_guest_enabled', 'chat_history_limit', 'chat_guest_auto_open',
      'chat_guest_auto_open_delay', 'chat_assistant_prompt', 'chat_assistant_tone',
      'chat_greetings', 'chat_service_keywords', 'chat_banned_words',
    ];
    const rows = await prisma.platformSettings.findMany({
      where: { key: { in: keys } },
    });
    const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({ data: byKey });
  }),
);

adminRouter.post(
  '/chat/verify-pin',
  pinLimiter,
  validate([body('pin').isString().isLength({ min: 4, max: 10 })]),
  asyncHandler(async (req, res) => {
    const admin = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!admin?.actionPinHash) {
      throw badRequest('No action PIN configured');
    }
    const bcrypt = await import('bcryptjs');
    const ok = await bcrypt.compare(req.body.pin, admin.actionPinHash);
    if (!ok) throw badRequest('Incorrect PIN');

    // Short-lived PIN token (5 min)
    const crypto = await import('crypto');
    const pinToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 5 * 60_000;

    // Store in memory (would use Redis in production)
    pinTokenStore.set(pinToken, { userId: req.user!.id, expiresAt });

    res.json({ pinToken, expiresAt: new Date(expiresAt).toISOString() });
  }),
);

// ── Postcodes ────────────────────────────────────────────────────────────────

/** GET /admin/postcodes?q= — list all postcodes, searchable by postcode or district. */
adminRouter.get(
  '/postcodes',
  asyncHandler(async (req, res) => {
    const q = req.query.q as string | undefined;
    const data = await prisma.postcode.findMany({
      where: q
        ? {
            OR: [
              { postcode: { contains: q, mode: 'insensitive' } },
              { district: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { postcode: 'asc' },
    });
    res.json({ data });
  }),
);

/** POST /admin/postcodes — create a postcode mapping. PIN-gated. */
adminRouter.post(
  '/postcodes',
  requirePin,
  validate([
    body('postcode').isString().trim().notEmpty(),
    body('district').isString().trim().notEmpty(),
    body('state').isString().trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const existing = await prisma.postcode.findUnique({ where: { postcode: req.body.postcode } });
    if (existing) {
      const updated = await prisma.postcode.update({
        where: { postcode: req.body.postcode },
        data: { district: req.body.district, state: req.body.state, active: true },
      });
      res.json(updated);
      return;
    }
    const created = await prisma.postcode.create({
      data: {
        postcode: req.body.postcode,
        district: req.body.district,
        state: req.body.state,
      },
    });
    res.status(201).json(created);
  }),
);

/** PATCH /admin/postcodes/:id — update a postcode mapping. PIN-gated. */
adminRouter.patch(
  '/postcodes/:id',
  requirePin,
  validate([
    body('postcode').optional().isString().trim().notEmpty(),
    body('district').optional().isString().trim().notEmpty(),
    body('state').optional().isString().trim().notEmpty(),
    body('active').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const existing = await prisma.postcode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Postcode not found');
    const updated = await prisma.postcode.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.postcode !== undefined && { postcode: req.body.postcode }),
        ...(req.body.district !== undefined && { district: req.body.district }),
        ...(req.body.state !== undefined && { state: req.body.state }),
        ...(req.body.active !== undefined && { active: req.body.active }),
      },
    });
    res.json(updated);
  }),
);

/** DELETE /admin/postcodes/:id — soft-delete (sets active=false). PIN-gated. */
adminRouter.delete(
  '/postcodes/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.postcode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Postcode not found');
    await prisma.postcode.update({ where: { id: req.params.id }, data: { active: false } });
    res.status(204).send();
  }),
);

// ── Banned emails ──────────────────────────────────────────────────────────

/** GET /admin/banned-emails — paginated list, searchable by email substring. */
adminRouter.get(
  '/banned-emails',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePageParams(req);
    const search = req.query.search as string | undefined;

    const where = search
      ? { email: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      prisma.bannedEmail.findMany({
        where,
        skip,
        take: limit,
        orderBy: { bannedAt: 'desc' },
      }),
      prisma.bannedEmail.count({ where }),
    ]);

    res.json({ data, total, page });
  }),
);

/** POST /admin/banned-emails — manually ban an email (PIN-gated). */
adminRouter.post(
  '/banned-emails',
  requirePin,
  validate([
    body('email').isEmail(),
    body('reason').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const banned = await prisma.bannedEmail.upsert({
      where: { email: req.body.email },
      update: {
        reason: req.body.reason ?? null,
        bannedBy: req.user!.id,
        bannedAt: new Date(),
      },
      create: {
        email: req.body.email,
        reason: req.body.reason ?? null,
        bannedBy: req.user!.id,
      },
    });

    res.status(201).json({ message: 'Email banned.', id: banned.id });
  }),
);

/** DELETE /admin/banned-emails/:id — unban an email (PIN-gated). */
adminRouter.delete(
  '/banned-emails/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const banned = await prisma.bannedEmail.findUnique({ where: { id: req.params.id } });
    if (!banned) throw notFound('Banned email not found');

    await prisma.bannedEmail.delete({ where: { id: req.params.id } });

    res.json({ message: 'Email unbanned.' });
  }),
);


function csvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}
