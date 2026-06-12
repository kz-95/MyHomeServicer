import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { presignUpload, publicUrl, isS3Configured } from '../lib/s3';
import { logger } from '../lib/logger';

type Purpose =
  | 'arrive_photo'
  | 'done_photo'
  | 'merchant_logo'
  | 'kyc_document'
  | 'banner_image'
  | 'listing_photo';

const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PURPOSES: Purpose[] = [
  'arrive_photo',
  'done_photo',
  'merchant_logo',
  'kyc_document',
  'banner_image',
  'listing_photo',
];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_KYC_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates an upload request and issues a pre-signed S3 PUT URL. Files are
 * uploaded directly from the browser; only this lightweight JSON call and the
 * confirm call ever touch the API (tech-stack.md §File storage).
 */
export async function createPresignedUpload(input: {
  purpose: string;
  mimeType: string;
  sizeBytes: number;
  uploaderUserId?: string;
  uploaderMerchantId?: string;
}) {
  if (!PURPOSES.includes(input.purpose as Purpose)) {
    throw badRequest(`purpose must be one of: ${PURPOSES.join(', ')}`);
  }
  const isKyc = input.purpose === 'kyc_document';
  const allowed = isKyc ? new Set([...PHOTO_MIME, 'application/pdf']) : PHOTO_MIME;
  if (!allowed.has(input.mimeType)) {
    throw badRequest(`Unsupported file type for ${input.purpose}: ${input.mimeType}`);
  }
  // Never accept executable formats regardless of declared type.
  if (/\.(js|exe|sh|php|bat|cmd)$/i.test(input.mimeType)) {
    throw badRequest('Executable file types are not permitted');
  }
  const maxBytes = isKyc ? MAX_KYC_BYTES : MAX_PHOTO_BYTES;
  if (input.sizeBytes <= 0 || input.sizeBytes > maxBytes) {
    throw badRequest(`File size must be between 1 byte and ${maxBytes / 1024 / 1024} MB`);
  }

  const ext = input.mimeType.split('/')[1] ?? 'bin';
  const s3Key = `${input.purpose}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;

  const file = await prisma.file.create({
    data: {
      ownerType: input.purpose,
      uploaderUserId: input.uploaderUserId ?? null,
      uploaderMerchantId: input.uploaderMerchantId ?? null,
      purpose: input.purpose,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      s3Key,
      status: 'pending',
    },
  });

  const uploadUrl = isS3Configured()
    ? await presignUpload(s3Key, input.mimeType)
    : `/api/v1/files/local-upload/${file.id}`;
  return { uploadUrl, fileId: file.id, expiresIn: 300 };
}

/**
 * Confirms a completed upload. For photos, EXIF metadata is stripped with
 * `sharp` (security-notes.md §8) — best-effort when S3 is configured.
 */
export async function confirmUpload(fileId: string, ownerId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) throw notFound('File not found');
  if (file.uploaderUserId !== ownerId && file.uploaderMerchantId !== ownerId) {
    throw notFound('File not found');
  }

  if (PHOTO_MIME.has(file.mimeType) && isS3Configured()) {
    try {
      await stripExif(file.s3Key, file.mimeType);
    } catch (err) {
      logger.warn('EXIF strip failed — continuing', { fileId, error: (err as Error).message });
    }
  }

  const url = publicUrl(file.s3Key);
  await prisma.file.update({ where: { id: fileId }, data: { status: 'confirmed', url } });
  return { fileUrl: url };
}

/** Download → strip EXIF → re-upload. Isolated so a missing dep degrades gracefully. */
async function stripExif(s3Key: string, mimeType: string): Promise<void> {
  const { s3 } = await import('../lib/s3');
  const sharp = (await import('sharp')).default;
  const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { env } = await import('../config/env');
  if (!s3) return;

  const obj = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: s3Key }));
  const bytes = await obj.Body?.transformToByteArray();
  if (!bytes) return;

  // Re-encoding through sharp drops all EXIF/GPS metadata.
  const cleaned = await sharp(Buffer.from(bytes)).rotate().toBuffer();
  await s3.send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: s3Key, Body: cleaned, ContentType: mimeType }),
  );
}
