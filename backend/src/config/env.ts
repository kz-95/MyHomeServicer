import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

/**
 * Environment schema. Validated on boot — the process exits immediately
 * (fail-fast) if any required variable is missing or malformed.
 */
const envSchema = z.object({
  // Coerce empty string → undefined so a Railway var set to "" still falls back
  // to the default instead of failing the enum (crash: "received ''").
  NODE_ENV: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  PORT: z.coerce.number().int().positive().default(3000),
  // Bind address for the HTTP server. '0.0.0.0' exposes on all interfaces
  // (required for LAN / Docker access); '127.0.0.1' limits to localhost only.
  HOST: z.string().default('0.0.0.0'),
  // Primary frontend origin used for CORS and notification deep-links.
  APP_URL: z.string().url().default('http://localhost:4200'),
  // Optional extra CORS origins (comma-separated) — use for LAN / tunnel URLs.
  // e.g. CORS_EXTRA_ORIGINS=http://192.168.1.42:4200,https://abc.trycloudflare.com
  CORS_EXTRA_ORIGINS: z.string().default(''),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  REFRESH_SECRET: z.string().min(16, 'REFRESH_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_BASE_URL: z.string().default(''),

  AICHAT_LLM_API_KEY: z.string().default(''),
  AICHAT_LLM_FALLBACK_API_KEY: z.string().default(''),
  GOOGLE_MAPS_API_KEY: z.string().default(''),

  GOOGLE_GMAIL_CLIENT_ID: z.string().default(''),
  GOOGLE_GMAIL_CLIENT_SECRET: z.string().default(''),
  GOOGLE_GMAIL_REFRESH_TOKEN: z.string().default(''),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/api/v1/auth/google/callback'),
  ADMIN_EMAILS: z.string().default(''),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
