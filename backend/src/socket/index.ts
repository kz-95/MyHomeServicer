import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedisAdapterPair } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { env, isProd } from '../config/env';
import { logger } from '../lib/logger';
import { verifyAccessToken } from '../services/auth.service';

let io: IOServer | null = null;

/**
 * Socket.io server. Uses the Redis adapter so broadcasts reach servicers
 * connected to any API instance. Every connection is authenticated on the
 * handshake; users auto-join their private room.
 *
 * V1 dev-bypass: the handshake `auth.token` carries a demo account email,
 * mirroring the HTTP `x-dev-user` header. On auth day this becomes a JWT.
 */
export function initSocket(server: HttpServer): IOServer {
  // Mirror the HTTP CORS origin set: APP_URL + any CORS_EXTRA_ORIGINS (LAN/tunnel).
  const corsOrigins = [env.APP_URL, ...env.CORS_EXTRA_ORIGINS.split(',').map((o) => o.trim())].filter(
    Boolean,
  );
  io = new IOServer(server, {
    cors: { origin: corsOrigins, credentials: true },
  });

  const { pubClient, subClient } = createRedisAdapterPair();
  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Unauthorized'));
      return;
    }
    // Real auth: verify a JWT access token.
    const principal = verifyAccessToken(token);
    if (principal) {
      socket.data.principal = { id: principal.id, kind: principal.kind };
      next();
      return;
    }
    // Dev-bypass fallback - email-as-token, never honoured in production.
    if (isProd) {
      next(new Error('Unauthorized'));
      return;
    }
    try {
      const servicer = await prisma.servicer.findFirst({
        where: { email: token, deletedAt: null },
      });
      if (servicer) {
        socket.data.principal = { id: servicer.id, kind: 'servicer' };
        next();
        return;
      }
      const user = await prisma.user.findFirst({ where: { email: token, deletedAt: null } });
      if (user) {
        socket.data.principal = { id: user.id, kind: 'user' };
        next();
        return;
      }
      next(new Error('Unauthorized'));
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const principal = socket.data.principal as { id: string; kind: string };
    const room = `${principal.kind === 'servicer' ? 'servicer' : 'user'}:${principal.id}`;
    socket.join(room);
    logger.debug('Socket connected', { room });

    // Servicer presence: mark online on connect.
    if (principal.kind === 'servicer') {
      prisma.servicer.update({
        where: { id: principal.id },
        data: { isOnline: true },
      }).catch((err) => logger.error('Failed to set servicer online', { error: err.message }));
    }

    socket.on('disconnect', async () => {
      logger.debug('Socket disconnected', { room });
      // Servicer presence: mark offline on disconnect.
      if (principal.kind === 'servicer') {
        prisma.servicer.update({
          where: { id: principal.id },
          data: { isOnline: false },
        }).catch((err) => logger.error('Failed to set servicer offline', { error: err.message }));
      }
    });
  });

  logger.info('Socket.io initialised');
  return io;
}

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.io not initialised');
  return io;
}

/** Emit to a single customer's private room. */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

/** Emit to a single servicer's private room. */
export function emitToServicer(servicerId: string, event: string, payload: unknown): void {
  io?.to(`servicer:${servicerId}`).emit(event, payload);
}

/** Emit a quote broadcast to a specific set of servicer rooms - never global. */
export function emitToServicers(servicerIds: string[], event: string, payload: unknown): void {
  if (!io || servicerIds.length === 0) return;
  const rooms = servicerIds.map((id) => `servicer:${id}`);
  io.to(rooms).emit(event, payload);
}
