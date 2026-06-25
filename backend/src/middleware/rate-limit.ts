import rateLimit, { Options } from 'express-rate-limit';
import { Request } from 'express';
import { isProd } from '../config/env';

/**
 * Per-endpoint rate limiters. In production the limits mirror security-notes.md
 * §6 and the api-doc.md rate-limit table exactly. In development they are
 * skipped - repeated logins while testing/demoing would otherwise trip the
 * 10-per-15-min auth limit and return 429s.
 */
function makeLimiter(opts: Partial<Options>, keyByUser = false) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !isProd,
    keyGenerator: keyByUser
      ? (req: Request) => req.user?.id ?? req.ip ?? 'anon'
      : undefined,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down and try again later.',
        },
      });
    },
    ...opts,
  });
}

/** 100 requests / min / IP - applied globally as the default. */
export const globalLimiter = makeLimiter({ windowMs: 60_000, limit: 100 });

/** 10 / 15min / IP. */
export const loginLimiter = makeLimiter({ windowMs: 15 * 60_000, limit: 10 });

/** 5 / hour / IP. */
export const registerLimiter = makeLimiter({ windowMs: 60 * 60_000, limit: 5 });

/** 3 / 10min / user. */
export const otpLimiter = makeLimiter({ windowMs: 10 * 60_000, limit: 3 }, true);

/** 5 / 15min / admin. */
export const pinLimiter = makeLimiter({ windowMs: 15 * 60_000, limit: 5 }, true);

/** 20 / hour / user. */
export const quoteLimiter = makeLimiter({ windowMs: 60 * 60_000, limit: 20 }, true);

/** 10 proposals / hour / servicer. */
export const proposalLimiter = makeLimiter({ windowMs: 60 * 60_000, limit: 10 }, true);

/** 20 / 10min / user - AI chat short-window cap. */
export const chatLimiter = makeLimiter({ windowMs: 10 * 60_000, limit: 20 }, true);

/** 100 / day / user - AI chat daily cap. */
export const chatDailyLimiter = makeLimiter({ windowMs: 24 * 60 * 60_000, limit: 100 }, true);
