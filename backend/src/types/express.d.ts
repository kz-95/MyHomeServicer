import { Role } from '@prisma/client';

/**
 * The authenticated principal attached to `req.user` by the auth middleware
 * (or by real JWT verification on auth day).
 *
 * NOTE: passport (added for Google OAuth) ships `@types/passport`, which declares
 * `Request.user?: Express.User`. We therefore extend `Express.User` rather than
 * redeclaring `Request.user` — otherwise passport's declaration wins (silently,
 * under `skipLibCheck`) and `req.user` is typed as the empty `Express.User`.
 */
export interface AuthPrincipal {
  id: string;
  kind: 'user' | 'servicer';
  role: Role | 'servicer';
  email: string;
  isDemo: boolean;
  setupRequired?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends AuthPrincipal {}
    interface Request {
      /** Verified action-PIN flag, set by the requirePin middleware. */
      pinVerified?: boolean;
      /** Google OAuth result, set by passport.authenticate('google') on success. */
      authResult?: { principal: import('../services/auth.service').Principal; accessToken: string; refreshToken: string };
      /** Idempotency key extracted from the Idempotency-Key header. */
      idempotencyKey?: string;
    }
  }
}

export {};
