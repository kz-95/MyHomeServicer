import { Worker, Job } from 'bullmq';
import { redis } from './lib/redis';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { QUEUE_NAME, JOB_NAMES, jobQueue } from './lib/queue';
import { getHandler, logRegisteredJobs } from './jobs';
import { register as registerQuoteJobs } from './jobs/quote.jobs';
import { register as registerBookingJobs } from './jobs/booking.jobs';
import { register as registerAdminJobs } from './jobs/admin.jobs';
import { register as registerServicerJobs } from './jobs/servicer.jobs';
import { registerDispatchJobs } from './jobs/dispatch.jobs';

/**
 * BullMQ worker process. Runs separately from the API so a long-running job
 * never blocks an HTTP request. Each job is dispatched to its registered
 * handler; the JOB_QUEUE table is updated to mirror live state.
 */
/** Schedule cron-style repeatable jobs (idempotent - BullMQ dedupes by key). */
async function scheduleRepeatables(): Promise<void> {
  // noshow.weekly_reset - every Monday at 00:00.
  await jobQueue.add(
    JOB_NAMES.NOSHOW_WEEKLY_RESET,
    {},
    { repeat: { pattern: '0 0 * * 1' }, jobId: 'repeat-noshow_weekly_reset' },
  );
  // servicer.online_sync - every 5 minutes.
  await jobQueue.add(
    JOB_NAMES.SERVICER_ONLINE_SYNC,
    {},
    { repeat: { pattern: '*/5 * * * *' }, jobId: 'repeat-servicer_online_sync' },
  );
  logger.info('Repeatable jobs scheduled');
}

async function main(): Promise<void> {
  // Register every phase's job handlers (static imports - fail loud on error).
  registerQuoteJobs();
  registerBookingJobs();
  registerAdminJobs();
  registerServicerJobs();
  registerDispatchJobs();
  logRegisteredJobs();

  await scheduleRepeatables();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      logger.info('Job started', { name: job.name, id: job.id });
      await markJob(job, 'active');
      const handler = getHandler(job.name);
      await handler(job);
    },
    { connection: redis as any, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    logger.info('Job completed', { name: job.name, id: job.id });
    void markJob(job, 'completed');
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { name: job?.name, id: job?.id, error: err.message });
    if (job) void markJob(job, 'failed', err.message);
  });

  logger.info('Worker process started');

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

/** Mirror job state into the JOB_QUEUE audit table. */
async function markJob(job: Job, status: 'active' | 'completed' | 'failed', error?: string) {
  try {
    await prisma.jobQueue.updateMany({
      where: { jobName: job.name, status: { in: ['queued', 'active'] } },
      data: {
        status,
        attempts: job.attemptsMade,
        ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {}),
        ...(error ? { error } : {}),
      },
    });
  } catch (err) {
    logger.error('Failed to mirror job state', { error: (err as Error).message });
  }
}

main().catch((err) => {
  logger.error('Worker fatal error', { error: (err as Error).message });
  process.exit(1);
});
