import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * S3-compatible client (AWS S3 or Cloudflare R2). Files are uploaded directly
 * from the browser via pre-signed URLs — they never stream through the API.
 */
const s3Configured = Boolean(env.S3_ACCESS_KEY && env.S3_SECRET_KEY && env.S3_BUCKET);

export const s3 = s3Configured
  ? new S3Client({
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      ...(env.S3_BASE_URL ? { endpoint: env.S3_BASE_URL, forcePathStyle: true } : {}),
    })
  : null;

export function isS3Configured(): boolean {
  return s3Configured;
}

/** Generate a pre-signed PUT URL for direct browser upload (5 min expiry). */
export async function presignUpload(key: string, mimeType: string): Promise<string> {
  if (!s3) {
    logger.warn('S3 not configured — returning local upload URL');
    return `/api/v1/files/local-upload/${key}`;
  }
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: mimeType,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}

/** Generate a pre-signed GET URL for reading a private object. */
export async function presignDownload(key: string): Promise<string> {
  if (!s3) return `/api/v1/files/local/${key}`;
  const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

/** Upload a buffer directly (used by the invoice.generate job for PDFs). */
export async function uploadBuffer(key: string, body: Buffer, mimeType: string): Promise<string> {
  if (!s3) {
    logger.warn('S3 not configured — saving locally', { key });
    const { saveLocalFile } = await import('./local-files');
    return saveLocalFile(key, body);
  }
  await s3.send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: mimeType }),
  );
  return env.S3_BASE_URL ? `${env.S3_BASE_URL}/${key}` : key;
}

export function publicUrl(key: string): string {
  if (env.S3_BASE_URL) return `${env.S3_BASE_URL}/${key}`;
  if (s3Configured) return key;
  return `${env.APP_URL}/api/files/local/${key}`;
}
