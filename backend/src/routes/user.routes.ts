import { Router } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { TIME_SLOTS } from '../lib/time-slots';
import { requireAuth, requireCustomer, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { idempotency } from '../middleware/idempotency';
import { conflict, notFound, badRequest } from '../lib/errors';
import { setActionPin } from '../services/auth.service';
import { geocodeAddress } from '../lib/geocoding';
import { isProd } from '../config/env';
import { isStripeConfigured, createTopUpSession } from '../lib/stripe';
import { adjustCredit } from '../services/credit.service';
import { deactivateUser } from '../services/deactivate.service';

/** Customer profile, addresses, notifications and device endpoints. */
export const userRouter = Router();

/**
 * POST /user/me/pin — set/change the admin action PIN. Declared before the
 * customer-only guard so it can apply its own admin guard.
 */
userRouter.post(
  '/me/pin',
  requireAuth,
  requireAdmin,
  validate([body('pin').isString().matches(/^\d{4,8}$/)]),
  asyncHandler(async (req, res) => {
    await setActionPin(req.user!.id, req.body.pin);
    res.status(204).send();
  }),
);

userRouter.use(requireAuth, requireCustomer);

// ── Profile ──────────────────────────────────────────────────────────────────

/** GET /user/me — own profile (full detail, ownership proven). */
userRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound('User not found');
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      contactName: user.contactName,
      contactNumber: user.contactNumber,
      preferredTimeSlot: user.preferredTimeSlot,
    });
  }),
);

/** PATCH /user/me — update profile fields (all optional). */
userRouter.patch(
  '/me',
  validate([
    body('name').optional({ values: 'null' }).isString().trim().notEmpty(),
    body('phone').optional({ values: 'null' }).isString().trim(),
    body('contactName').optional({ values: 'null' }).isString().trim(),
    body('contactNumber').optional({ values: 'null' }).isString().trim(),
    body('preferredTimeSlot')
      .optional({ values: 'null' })
      .isIn([...TIME_SLOTS]),
    body('avatarUrl').optional({ values: 'null' }).isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { name, phone, contactName, contactNumber, preferredTimeSlot, avatarUrl } =
      req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name, phone, contactName, contactNumber, preferredTimeSlot, avatarUrl },
    });
    res.json({ id: user.id, name: user.name, phone: user.phone, avatarUrl: user.avatarUrl });
  }),
);

// ── Credit wallet ────────────────────────────────────────────────────────────

/** GET /user/me/credit — prepaid credit balance. */
userRouter.get(
  '/me/credit',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound('User not found');
    res.json({ balance: Number(user.creditBalance) });
  }),
);

/** POST /user/me/topup — wallet top-up.
 *
 * When Stripe is configured (STRIPE_SECRET_KEY set) this returns a Checkout
 * URL to the Stripe-hosted payment page. Otherwise it falls back to an
 * instant +RM100 credit (demo mode only — blocked in production). */
userRouter.post(
  '/me/topup',
  requireAuth,
  requireCustomer,
  idempotency,
  validate([body('amount').isFloat({ min: 10 }).withMessage('amount must be at least RM 10'), body('voucherCode').optional().isString().trim()]),
  asyncHandler(async (req, res) => {
    const amount = Number(req.body.amount);
    const voucherCode: string | undefined = req.body.voucherCode;
    const userId = req.user!.id;

    let discountType: string | undefined;
    let discountValue = 0;
    if (voucherCode) {
      const redemption = await prisma.redemption.findFirst({
        where: { voucherCode, userId, status: 'active' },
        include: { reward: true },
      });
      if (redemption) {
        discountType = redemption.reward.discountType;
        discountValue = Number(redemption.reward.discountValue);
      }
    }

    const isBonus = discountType === 'topup_bonus';
    const isFixed = discountType === 'topup_fixed';

    if (isStripeConfigured()) {
      const appUrl = req.get('origin') ?? process.env.APP_URL ?? 'http://localhost:4200';
      const successUrl = `${appUrl}/customer/account?topup=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${appUrl}/customer/account?topup=cancelled`;

      // topup_fixed: charge = amount - discount, credit = amount
      // topup_bonus: charge = amount, credit = amount + discount
      const chargeAmount = isFixed ? Math.max(0, amount - discountValue) : amount;
      const creditAmount = isBonus ? amount + discountValue : amount;

      const { url, sessionId } = await createTopUpSession(userId, chargeAmount, successUrl, cancelUrl);

      await prisma.transaction.create({
        data: {
          type: 'deposit_topup',
          status: 'pending',
          amount: creditAmount,
          userId,
          reference: `Stripe Checkout Session ${sessionId}`,
          metadata: {
            stripeSessionId: sessionId,
            stage: 'checkout_created',
            chargedAmount: chargeAmount,
            ...(voucherCode ? { voucherCode, discountType, discountValue } : {}),
          },
        },
      });

      if (voucherCode) {
        await prisma.redemption.update({
          where: { voucherCode },
          data: { status: 'used', usedAt: new Date() },
        });
      }

      res.json({
        url,
        sessionId,
        method: 'stripe_checkout',
        ...(voucherCode
          ? { discountType, discountValue, originalAmount: amount, finalCharge: chargeAmount }
          : {}),
      });
      return;
    }

    // Fallback: instant credit (demo/dev only).
    if (isProd) {
      throw badRequest('Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env');
    }

    const creditAmount = isBonus ? amount + discountValue : amount;
    const balance = await adjustCredit('user', userId, creditAmount);

    if (voucherCode) {
      await prisma.redemption.update({
        where: { voucherCode },
        data: { status: 'used', usedAt: new Date() },
      });
    }

    res.json({
      balance,
      method: 'demo_instant',
      ...(voucherCode
        ? { discountType, discountValue, originalAmount: amount, finalCharge: isFixed ? Math.max(0, amount - discountValue) : amount }
        : {}),
    });
  }),
);

// ── Addresses ────────────────────────────────────────────────────────────────

/** GET /user/me/addresses */
userRouter.get(
  '/me/addresses',
  asyncHandler(async (req, res) => {
    const data = await prisma.userAddress.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({
      data: data.map((a) => ({
        id: a.id,
        label: a.label,
        address: a.address,
        propertyType: a.propertyType,
        postcode: a.postcode,
        district: a.district,
        state: a.state,
        isDefault: a.isDefault,
      })),
    });
  }),
);

/** POST /user/me/addresses */
userRouter.post(
  '/me/addresses',
  validate([
    body('label').isString().trim().notEmpty(),
    body('address').isString().trim().notEmpty(),
    body('propertyType').optional().isString(),
    body('isDefault').optional().isBoolean(),
    body('postcode').optional().isString(),
    body('district').optional().isString(),
    body('state').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { label, address, propertyType, isDefault, postcode, district, state } = req.body;
    const geo = await geocodeAddress(address);
    if (isDefault) {
      await prisma.userAddress.updateMany({
        where: { userId: req.user!.id },
        data: { isDefault: false },
      });
    }
    const created = await prisma.userAddress.create({
      data: {
        userId: req.user!.id,
        label,
        address,
        propertyType: propertyType ?? null,
        lat: req.body.lat ?? geo?.lat ?? null,
        lng: req.body.lng ?? geo?.lng ?? null,
        postcode: postcode ?? null,
        district: district ?? null,
        state: state ?? null,
        isDefault: Boolean(isDefault),
      },
    });
    res.status(201).json(created);
  }),
);

/** PATCH /user/me/addresses/:id */
userRouter.patch(
  '/me/addresses/:id',
  validate([
    body('label').optional().isString().trim().notEmpty(),
    body('address').optional().isString().trim().notEmpty(),
    body('propertyType').optional({ nullable: true }).isString(),
    body('isDefault').optional().isBoolean(),
    body('postcode').optional().isString(),
    body('district').optional().isString(),
    body('state').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const existing = await prisma.userAddress.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound('Address not found');
    const { label, address, propertyType, isDefault, postcode, district, state } = req.body;
    let lat: number | null | undefined;
    let lng: number | null | undefined;
    if (address !== undefined && address !== existing.address) {
      const geo = await geocodeAddress(address);
      lat = geo?.lat ?? null;
      lng = geo?.lng ?? null;
    }
    if (isDefault) {
      await prisma.userAddress.updateMany({
        where: { userId: req.user!.id },
        data: { isDefault: false },
      });
    }
    const updated = await prisma.userAddress.update({
      where: { id: req.params.id },
      data: {
        label, address, propertyType, isDefault,
        postcode: postcode ?? null,
        district: district ?? null,
        state: state ?? null,
        ...(lat !== undefined ? { lat, lng } : {}),
      },
    });
    res.json(updated);
  }),
);

/** DELETE /user/me/addresses/:id */
userRouter.delete(
  '/me/addresses/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.userAddress.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound('Address not found');
    await prisma.userAddress.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

// ── Quote presets ────────────────────────────────────────────────────────────

const QUOTE_PRESET_LIMIT = 10;
const SLOTS = [...TIME_SLOTS];
const presetValidators = [
  body('contactName').isString().trim().notEmpty(),
  body('contactNumber').isString().trim().notEmpty(),
  body('addressId').isUUID().withMessage('A saved address is required'),
  body('label').optional({ values: 'null' }).isString().trim(),
  body('instruction').optional({ values: 'null' }).isString().trim(),
  body('preferredTimeSlot').optional({ values: 'null' }).isIn(SLOTS),
  body('isDefault').optional().isBoolean(),
];

/** Confirm the address belongs to the calling customer. */
async function assertOwnAddress(userId: string, addressId: string): Promise<void> {
  const addr = await prisma.userAddress.findFirst({ where: { id: addressId, userId } });
  if (!addr) throw notFound('Address not found');
}

/** GET /user/me/quote-presets — the customer's saved quote presets. */
userRouter.get(
  '/me/quote-presets',
  asyncHandler(async (req, res) => {
    const data = await prisma.quotePreset.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { address: { select: { id: true, label: true, address: true } } },
    });
    res.json({ data });
  }),
);

/** POST /user/me/quote-presets — add a quote preset (max 10). */
userRouter.post(
  '/me/quote-presets',
  validate(presetValidators),
  asyncHandler(async (req, res) => {
    const count = await prisma.quotePreset.count({ where: { userId: req.user!.id } });
    if (count >= QUOTE_PRESET_LIMIT) {
      throw conflict(`You can save at most ${QUOTE_PRESET_LIMIT} quote presets`);
    }
    await assertOwnAddress(req.user!.id, req.body.addressId);
    const { label, contactName, contactNumber, addressId, instruction } = req.body;
    const { preferredTimeSlot, isDefault } = req.body;
    if (isDefault) {
      await prisma.quotePreset.updateMany({
        where: { userId: req.user!.id },
        data: { isDefault: false },
      });
    }
    const created = await prisma.quotePreset.create({
      data: {
        userId: req.user!.id,
        label: label ?? null,
        contactName,
        contactNumber,
        addressId,
        instruction: instruction ?? null,
        preferredTimeSlot: preferredTimeSlot ?? null,
        isDefault: Boolean(isDefault),
      },
    });
    res.status(201).json(created);
  }),
);

/** PATCH /user/me/quote-presets/:id */
const patchPresetValidators = [
  body('contactName').optional().isString().trim().notEmpty(),
  body('contactNumber').optional().isString().trim().notEmpty(),
  body('addressId').optional().isUUID().withMessage('A saved address is required'),
  body('label').optional({ values: 'null' }).isString().trim(),
  body('instruction').optional({ values: 'null' }).isString().trim(),
  body('preferredTimeSlot').optional({ values: 'null' }).isIn(SLOTS),
  body('isDefault').optional().isBoolean(),
];

userRouter.patch(
  '/me/quote-presets/:id',
  validate(patchPresetValidators),
  asyncHandler(async (req, res) => {
    const existing = await prisma.quotePreset.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound('Quote preset not found');
    if (req.body.addressId) {
      await assertOwnAddress(req.user!.id, req.body.addressId);
    }
    const { label, contactName, contactNumber, addressId, instruction } = req.body;
    const { preferredTimeSlot, isDefault } = req.body;
    if (isDefault) {
      await prisma.quotePreset.updateMany({
        where: { userId: req.user!.id },
        data: { isDefault: false },
      });
    }
    const updateData: Record<string, string | boolean | null> = {};
    if (contactName !== undefined) updateData.contactName = contactName;
    if (contactNumber !== undefined) updateData.contactNumber = contactNumber;
    if (addressId !== undefined) updateData.addressId = addressId;
    if (label !== undefined) updateData.label = label ?? null;
    if (instruction !== undefined) updateData.instruction = instruction ?? null;
    if (preferredTimeSlot !== undefined) updateData.preferredTimeSlot = preferredTimeSlot ?? null;
    if (isDefault !== undefined) updateData.isDefault = Boolean(isDefault);
    const updated = await prisma.quotePreset.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json(updated);
  }),
);

/** DELETE /user/me/quote-presets/:id */
userRouter.delete(
  '/me/quote-presets/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.quotePreset.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound('Quote preset not found');
    await prisma.quotePreset.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

// ── Order history ────────────────────────────────────────────────────────────

/** GET /user/me/history — completed + cancelled bookings for the Order History page. */
userRouter.get(
  '/me/history',
  asyncHandler(async (req, res) => {
    const { formatOrderId } = await import('../lib/order-id');
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id, status: { in: ['completed', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        merchant: { select: { id: true, businessName: true } },
        quoteRequest: { select: { category: { select: { name: true, icon: true } } } },
      },
    });
    res.json({
      data: bookings.map((b) => ({
        type: b.status,
        bookingId: b.id,
        orderId: b.orderNumber ? formatOrderId(b.orderNumber, b.createdAt) : undefined,
        merchantId: b.merchantId,
        merchantName: b.merchant.businessName,
        categoryName: b.quoteRequest.category.name,
        categoryIcon: b.quoteRequest.category.icon,
        completedAt: b.doneAt ?? b.updatedAt,
        totalPrice: b.price,
      })),
    });
  }),
);

// ── Transactions / payment history ───────────────────────────────────────────

/** GET /user/me/transactions — paginated, filterable, sortable transaction log. */
userRouter.get(
  '/me/transactions',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
    const typeFilter = typeof req.query.type === 'string' ? req.query.type : undefined;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const sortField = req.query.sort === 'amount' ? 'amount' : 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 'asc' : 'desc';

    const where: Record<string, unknown> = { userId };
    if (typeFilter) where.type = typeFilter;
    if (statusFilter) where.status = statusFilter;
    if (search) where.reference = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.transaction.findMany({
        where: where as any,
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where: where as any }),
    ]);

    res.json({
      data: data.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        amount: Number(t.amount),
        currency: t.currency,
        reference: t.reference,
        createdAt: t.createdAt,
        metadata: t.metadata,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }),
);

// ── Notifications ────────────────────────────────────────────────────────────

/** GET /user/me/notifications */
userRouter.get(
  '/me/notifications',
  asyncHandler(async (req, res) => {
    const data = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ data });
  }),
);

/** PATCH /user/me/notifications/read-all */
userRouter.patch(
  '/me/notifications/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.status(204).send();
  }),
);

/** PATCH /user/me/notifications/:id/read */
userRouter.patch(
  '/me/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!n) throw notFound('Notification not found');
    await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.status(204).send();
  }),
);

/** POST /user/me/device — register a push notification device. */
userRouter.post(
  '/me/device',
  validate([
    body('deviceToken').isString().trim().notEmpty(),
    body('platform').isIn(['ios', 'android', 'web']),
  ]),
  asyncHandler(async (req, res) => {
    const { deviceToken, platform } = req.body;
    const existing = await prisma.userDevice.findFirst({
      where: { userId: req.user!.id, deviceToken },
    });
    const device = existing
      ? await prisma.userDevice.update({
          where: { id: existing.id },
          data: { isActive: true, platform },
        })
      : await prisma.userDevice.create({
          data: { userId: req.user!.id, deviceToken, platform },
        });
    res.status(201).json({ id: device.id });
  }),
);

// ── Deactivate account ───────────────────────────────────────────────────────

/** POST /user/me/deactivate — permanently deactivate account. */
userRouter.post(
  '/me/deactivate',
  requireAuth,
  requireCustomer,
  validate([
    body('reason').isString().notEmpty().isLength({ max: 500 }),
    body('password').isString().isLength({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    const { reason, password } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound('User not found');
    if (!user.passwordHash) throw badRequest('Cannot deactivate a Google-only account from here.');

    const pwOk = await bcrypt.compare(password, user.passwordHash);
    if (!pwOk) throw badRequest('Incorrect password.');

    await deactivateUser(user, reason);
    res.json({ message: 'Account deactivated.' });
  }),
);
