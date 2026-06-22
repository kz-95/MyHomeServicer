import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { registerLimiter } from '../middleware/rate-limit';
import { notFound } from '../lib/errors';
import { registerServicer } from '../services/auth.service';

/** Public servicer endpoints — profile, services, and registration. */
export const servicersRouter = Router();

/** POST /servicers/register — register a new servicer account. */
servicersRouter.post(
  '/register',
  registerLimiter,
  validate([
    body('name').isString().trim().notEmpty(),
    body('email').isEmail(),
    body('phone').isString().trim().notEmpty(),
    body('password').isString().isLength({ min: 8 }),
    body('businessName').isString().trim().notEmpty(),
    body('categoryId').isUUID().withMessage('A platform category must be selected'),
  ]),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await registerServicer(req.body);
    res.status(201).json({
      servicer: { id: user.id, email: user.email, role: user.role },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }),
);

/** GET /servicers/:id — public servicer profile. */
servicersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const m = await prisma.servicer.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        contacts: {
          where: { visibleToCustomer: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!m) throw notFound('Servicer not found');
    res.json({
      id: m.id,
      businessName: m.businessName,
      bio: m.bio,
      logoUrl: m.logoUrl,
      rating: m.rating,
      serviceAreas: m.serviceAreas,
      isCompany: m.isCompany,
      contacts: m.contacts.map((c) => ({
        id: c.id,
        contactPerson: c.contactPerson,
        number: c.number,
        email: c.email,
        isPrimary: c.isPrimary,
      })),
    });
  }),
);

/** GET /servicers/:id/services — the servicer's active services. */
servicersRouter.get(
  '/:id/services',
  asyncHandler(async (req, res) => {
    const services = await prisma.servicerService.findMany({
      where: { servicerId: req.params.id, deletedAt: null },
      include: { category: { select: { name: true, slug: true } } },
    });
    res.json({
      data: services.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        sku: s.servicerSku,
        basePrice: s.basePrice,
        priceType: s.priceType,
        estimatedDurationMinutes: s.estimatedDurationMinutes,
        category: s.category,
      })),
    });
  }),
);
