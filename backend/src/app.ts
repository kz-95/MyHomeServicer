import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import passport from 'passport';
import { env } from './config/env';
import { morganStream } from './lib/logger';
import { globalLimiter } from './middleware/rate-limit';
import { authenticate } from './middleware/auth';
import { notFoundHandler, errorHandler } from './middleware/error';
import { apiRouter } from './routes';
import { UPLOADS_DIR } from './lib/local-files';
import { isS3Configured } from './lib/s3';
import { configurePassport } from './services/passport';

/**
 * Builds the Express application with the full middleware stack in order:
 * helmet → cors → rate-limit → json parser → request log → dev-bypass auth
 * → routes → 404 → error handler.
 */
export function createApp(): Application {
  const app = express();

  // Configure Passport with Google OAuth strategy.
  configurePassport();
  app.use(passport.initialize());

  // Security headers (must be first).
  app.use(helmet());

  // CORS — allow APP_URL plus any extra origins from CORS_EXTRA_ORIGINS
  // (comma-separated, used for LAN / tunnel dev access).  Never `*`.
  const allowedOrigins = new Set<string>(
    [env.APP_URL, ...env.CORS_EXTRA_ORIGINS.split(',').map((o) => o.trim())].filter(Boolean),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin / server-to-server requests (no Origin header) and
        // any explicitly listed origin.
        if (!origin || allowedOrigins.has(origin)) return cb(null, true);
        cb(Object.assign(new Error(`CORS: origin not allowed — ${origin}`), { status: 403 }));
      },
      credentials: true,
    }),
  );

  // Global rate limit; per-route limiters are layered on top.
  app.use(globalLimiter);

  // Stripe webhook raw body — must be BEFORE express.json() so the webhook
  // receives the raw buffer for HMAC-SHA256 signature verification.
  app.use('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }));

  // Body parsing.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging — auth bodies are never logged (morgan logs metadata only,
  // and the winston redactor scrubs any token that slips through).
  app.use(
    morgan('combined', {
      stream: morganStream,
      skip: (req) => req.path.startsWith('/api/v1/auth'),
    }),
  );

  // Resolve the authenticated principal (JWT, with dev-bypass fallback).
  app.use(authenticate);

  // Serve locally-uploaded files when S3 is not configured.
  if (!isS3Configured()) {
    app.use('/api/files/local', express.static(UPLOADS_DIR));
  }

  // API routes.
  app.use('/api/v1', apiRouter);

  // 404 + error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
