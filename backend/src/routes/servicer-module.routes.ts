import { Router } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { requireAuth, requireServicer } from '../middleware/auth';
import {
  listServicerModules,
  createServicerModule,
  updateServicerModule,
  deleteServicerModule,
} from '../services/servicer-module.service';

export const servicerModuleRouter = Router();
servicerModuleRouter.use(requireAuth, requireServicer);

/** GET /servicer/modules?active=true */
servicerModuleRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.active === 'true';
    res.json({ data: await listServicerModules(req.user!.id, activeOnly) });
  }),
);

const moduleCreateValidators = [
  body('name').isString().trim().notEmpty().isLength({ max: 200 }),
  body('price').isFloat({ min: 0 }),
  body('sku').optional({ values: 'null' }).isString().trim(),
  body('active').optional().isBoolean(),
];

const modulePatchValidators = [
  body('name').optional().isString().trim().notEmpty().isLength({ max: 200 }),
  body('price').optional().isFloat({ min: 0 }),
  body('sku').optional({ values: 'null' }).isString().trim(),
  body('active').optional().isBoolean(),
];

/** POST /servicer/modules */
servicerModuleRouter.post(
  '/',
  validate(moduleCreateValidators),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await createServicerModule(req.user!.id, {
        name: req.body.name,
        price: req.body.price,
        sku: req.body.sku ?? null,
        active: req.body.active,
      }),
    );
  }),
);

/** PATCH /servicer/modules/:id */
servicerModuleRouter.patch(
  '/:id',
  validate(modulePatchValidators),
  asyncHandler(async (req, res) => {
    res.json(
      await updateServicerModule(req.user!.id, req.params.id, {
        name: req.body.name,
        price: req.body.price,
        sku: req.body.sku,
        active: req.body.active,
      }),
    );
  }),
);

/** DELETE /servicer/modules/:id — soft-disable. */
servicerModuleRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteServicerModule(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);
