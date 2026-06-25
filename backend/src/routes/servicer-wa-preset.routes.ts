import { Router } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { requireAuth, requireServicer } from '../middleware/auth';
import {
  listServicerWaPresets,
  createServicerWaPreset,
  updateServicerWaPreset,
  deleteServicerWaPreset,
} from '../services/servicer-wa-preset.service';

export const servicerWaPresetRouter = Router();
servicerWaPresetRouter.use(requireAuth, requireServicer);

/** GET /servicer/wa-presets?active=true */
servicerWaPresetRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.active === 'true';
    res.json({ data: await listServicerWaPresets(req.user!.id, activeOnly) });
  }),
);

const presetCreateValidators = [
  body('label').isString().trim().notEmpty().isLength({ max: 80 }),
  body('body').isString().notEmpty().isLength({ max: 2000 }),
  body('active').optional().isBoolean(),
];

const presetPatchValidators = [
  body('label').optional().isString().trim().notEmpty().isLength({ max: 80 }),
  body('body').optional().isString().notEmpty().isLength({ max: 2000 }),
  body('active').optional().isBoolean(),
];

/** POST /servicer/wa-presets */
servicerWaPresetRouter.post(
  '/',
  validate(presetCreateValidators),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await createServicerWaPreset(req.user!.id, {
        label: req.body.label,
        body: req.body.body,
        active: req.body.active,
      }),
    );
  }),
);

/** PATCH /servicer/wa-presets/:id */
servicerWaPresetRouter.patch(
  '/:id',
  validate(presetPatchValidators),
  asyncHandler(async (req, res) => {
    res.json(
      await updateServicerWaPreset(req.user!.id, req.params.id, {
        label: req.body.label,
        body: req.body.body,
        active: req.body.active,
      }),
    );
  }),
);

/** DELETE /servicer/wa-presets/:id - soft-disable. */
servicerWaPresetRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteServicerWaPreset(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);
