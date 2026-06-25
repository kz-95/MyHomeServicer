import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { initSocket } from './socket';
import { disconnectPrisma } from './lib/prisma';
import { closeRedis } from './lib/redis';
import { closeQueue } from './lib/queue';

/**
 * API entry point. Boots the Express app, attaches Socket.io, and registers
 * graceful-shutdown handlers. Background jobs run in a separate process
 * (`npm run worker` → src/worker.ts).
 */
async function main(): Promise<void> {
  const app = createApp();
  const server = createServer(app);
  initSocket(server);

  server.listen(env.PORT, env.HOST, () => {
    const addr = env.HOST === '0.0.0.0' ? 'localhost' : env.HOST;
    logger.info(`API listening on http://${addr}:${env.PORT} (${env.NODE_ENV}) - bound to ${env.HOST}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close();
    await Promise.allSettled([closeQueue(), closeRedis(), disconnectPrisma()]);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
