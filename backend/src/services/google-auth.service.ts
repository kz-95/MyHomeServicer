import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { Principal, issueTokens } from './auth.service';

const ADMIN_EMAILS = new Set(
  env.ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

interface GoogleProfile {
  id: string;
  email: string;
  name: string;
}

function determineRole(email: string): 'customer' | 'admin' {
  return ADMIN_EMAILS.has(email.toLowerCase()) ? 'admin' : 'customer';
}

export async function handleGoogleAuth(
  profile: GoogleProfile,
): Promise<{ principal: Principal; accessToken: string; refreshToken: string }> {
  const { id: googleId, email, name } = profile;

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }], deletedAt: null },
  });

  if (existingUser) {
    if (!existingUser.googleId) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { googleId },
      });
    }
    const role = existingUser.role === 'admin' ? 'admin' : determineRole(email);
    const principal: Principal = {
      id: existingUser.id,
      kind: 'user',
      role,
      email: existingUser.email,
      isDemo: existingUser.isDemo,
      creditBalance: Number(existingUser.creditBalance),
    };
    const tokens = await issueTokens(principal);
    return { principal, ...tokens };
  }

  const role = determineRole(email);
  const user = await prisma.user.create({
    data: {
      role,
      name,
      email,
      phone: '',
      googleId,
      passwordHash: null,
    },
  });

  const principal: Principal = {
    id: user.id,
    kind: 'user',
    role: user.role as 'customer' | 'admin',
    email: user.email,
    isDemo: false,
    creditBalance: Number(user.creditBalance),
  };
  const tokens = await issueTokens(principal);
  return { principal, ...tokens };
}

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
