import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

/**
 * Environment schema. Validated on boot - the process exits immediately
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
  // Optional extra CORS origins (comma-separated) - use for LAN / tunnel URLs.
  // e.g. CORS_EXTRA_ORIGINS=http://192.168.1.42:4200,https://abc.trycloudflare.com
  CORS_EXTRA_ORIGINS: z.string().default(''),

  // Opt-in: permit the demo `/dev/*` routes + demo-account login on a deployed
  // (NODE_ENV=production) backend. Default OFF so real production stays
  // hard-blocked; set true ONLY on a dedicated demo deployment.
  // String env → bool: only "true"/"1"/"yes"/"on" (case-insensitive) enable it.
  // Avoids z.coerce.boolean()'s trap where the string "false" is truthy → true.
  DEMO_LOGIN_ENABLED: z.preprocess(
    (v) => (typeof v === 'string' ? ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase()) : v),
    z.boolean().default(false),
  ),

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

  G_LLM_API_Token: z.string().default(''),
  DS_LLM_API_Token: z.string().default(''),
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

  // Secret phrase that toggles all demo/QA UI when typed anywhere on the page.
  // Seeded into platform_settings.demo_unlock_phrase and served via
  // /config/public; admins can override live in the DB without a redeploy.
  DEMO_UNLOCK_PHRASE: z.string().default('unlockdemobar'),

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
/**
 * True when the demo surface (`/dev/*` seed/login/reseed routes + demo-account
 * login) is permitted: always in non-prod, and in prod only when
 * DEMO_LOGIN_ENABLED is explicitly set. Use this instead of `isProd` to gate
 * demo features so a dedicated demo deployment can opt in without leaving
 * production mode. Real prod (flag unset) stays hard-blocked.
 */
export const allowDemo = !isProd || env.DEMO_LOGIN_ENABLED;
