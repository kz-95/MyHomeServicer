import { Router } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { requireAuth, requireServicer } from '../middleware/auth';
import {
  listPricingModules,
  createPricingModule,
  updatePricingModule,
  deletePricingModule,
} from '../services/pricing-module.service';

export const pricingModuleRouter = Router();
pricingModuleRouter.use(requireAuth, requireServicer);

/** GET /servicer/pricing-modules?active=true */
pricingModuleRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.active === 'true';
    res.json({ data: await listPricingModules(req.user!.id, activeOnly) });
  }),
);

const moduleCreateValidators = [
  body('label').isString().trim().notEmpty().isLength({ max: 200 }),
  body('defaultPrice').isFloat({ min: 0 }),
  body('taxable').optional().isBoolean(),
  body('serviceChargeable').optional().isBoolean(),
  body('categoryId').optional({ values: 'null' }).isString().trim().notEmpty(),
  body('active').optional().isBoolean(),
];

const modulePatchValidators = [
  body('label').optional().isString().trim().notEmpty().isLength({ max: 200 }),
  body('defaultPrice').optional().isFloat({ min: 0 }),
  body('taxable').optional().isBoolean(),
  body('serviceChargeable').optional().isBoolean(),
  body('categoryId').optional({ values: 'null' }).isString().trim().notEmpty(),
  body('active').optional().isBoolean(),
];

/** POST /servicer/pricing-modules */
pricingModuleRouter.post(
  '/',
  validate(moduleCreateValidators),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createPricingModule(req.user!.id, req.body));
  }),
);

/** PATCH /servicer/pricing-modules/:id */
pricingModuleRouter.patch(
  '/:id',
  validate(modulePatchValidators),
  asyncHandler(async (req, res) => {
    res.json(await updatePricingModule(req.user!.id, req.params.id, req.body));
  }),
);

/** DELETE /servicer/pricing-modules/:id */
pricingModuleRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deletePricingModule(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);
