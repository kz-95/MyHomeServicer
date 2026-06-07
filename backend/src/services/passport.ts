import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../config/env';
import { handleGoogleAuth, isGoogleConfigured } from './google-auth.service';

export function configurePassport(): void {
  if (!isGoogleConfigured()) return;

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email =
            profile.emails?.[0]?.value ?? `${profile.id}@google-oauth.local`;
          const name = profile.displayName ?? email.split('@')[0];
          const result = await handleGoogleAuth({
            id: profile.id,
            email,
            name,
          });
          // With a custom authenticate() callback (session: false) this object is
          // passed straight through to that callback — it's the auth result, not a
          // req.user principal — so the Express.User typing doesn't apply here.
          done(null, result as unknown as Express.User);
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    ),
  );
}
