import { Router } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createPresignedUpload, confirmUpload } from '../services/file.service';
import { saveLocalFile } from '../lib/local-files';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';

/** Direct-to-S3 upload endpoints — files never stream through the API. */
export const filesRouter = Router();
filesRouter.use(requireAuth);

/** POST /files/presign — get a pre-signed upload URL. */
filesRouter.post(
  '/presign',
  validate([
    body('purpose').isString().notEmpty(),
    body('mimeType').isString().notEmpty(),
    body('sizeBytes').isInt({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    const result = await createPresignedUpload({
      purpose: req.body.purpose,
      mimeType: req.body.mimeType,
      sizeBytes: req.body.sizeBytes,
      uploaderUserId: req.user!.kind === 'user' ? req.user!.id : undefined,
      uploaderMerchantId: req.user!.kind === 'servicer' ? req.user!.id : undefined,
    });
    res.status(201).json(result);
  }),
);

/** PUT /files/local-upload/:fileId — local dev fallback when S3 is not configured. */
filesRouter.put(
  '/local-upload/:fileId',
  asyncHandler(async (req, res) => {
    const file = await prisma.file.findUnique({ where: { id: req.params.fileId } });
    if (!file) throw notFound('File not found');

    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(new Uint8Array(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    }
    const body = Buffer.concat(chunks);

    await saveLocalFile(file.s3Key, body);
    res.status(200).json({ ok: true });
  }),
);

/** POST /files/:id/confirm — confirm a completed upload. */
filesRouter.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    res.json(await confirmUpload(req.params.id, req.user!.id));
  }),
);
