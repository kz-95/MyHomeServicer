import { Queue, JobsOptions } from 'bullmq';
import { Prisma } from '@prisma/client';
import { redis } from './redis';
import { prisma } from './prisma';
import { logger } from './logger';

/**
 * Central BullMQ queue registry. Every background job named in tech-stack.md
 * is declared here. The API drops jobs in; the worker process consumes them.
 */
export const JOB_NAMES = {
  QUOTE_EXPIRY: 'quote.expiry',
  QUOTE_NO_RESPONSE: 'quote.no_response',
  NOSHOW_DETECT: 'noshow.detect',
  PENALTY_DEDUCT: 'penalty.deduct',
  NOTIFICATION_PUSH: 'notification.push',
  NOSHOW_WEEKLY_RESET: 'noshow.weekly_reset',
  ESCROW_RELEASE: 'escrow.release',
  PROMO_CREDIT_PAYBACK: 'promo.credit_payback',
  INVOICE_GENERATE: 'invoice.generate',
  WITHDRAWAL_NOTIFY: 'withdrawal.notify',
  SERVICER_ONLINE_SYNC: 'servicer.online_sync',
  DISPATCH_ROTATION: 'dispatch.rotation',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const QUEUE_NAME = 'homeservices';

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

/** Single queue, multiple named job types. */
export const jobQueue = new Queue(QUEUE_NAME, {
  connection: redis as any,
  defaultJobOptions,
});

/**
 * Enqueue a job and mirror it into the JOB_QUEUE table for admin visibility
 * (schema-notes.md Block 7). Redis holds the live queue; Postgres the audit row.
 */
export async function enqueue(
  name: JobName,
  payload: Record<string, unknown>,
  opts: JobsOptions = {},
): Promise<void> {
  // BullMQ rejects ':' in a custom job id (it is the internal key separator),
  // throwing "Custom Id cannot contain :". Normalise legacy 'prefix:id' ids to
  // 'prefix-id' so idempotent scheduling keeps working across BullMQ versions.
  const safeOpts: JobsOptions =
    typeof opts.jobId === 'string' && opts.jobId.includes(':')
      ? { ...opts, jobId: opts.jobId.replace(/:/g, '-') }
      : opts;
  try {
    await jobQueue.add(name, payload, safeOpts);
    await prisma.jobQueue.create({
      data: {
        jobName: name,
        jobKey: (safeOpts.jobId as string) ?? null,
        payload: payload as Prisma.InputJsonValue,
        status: 'queued',
        runAt: safeOpts.delay ? new Date(Date.now() + safeOpts.delay) : new Date(),
      },
    });
    logger.debug('Job enqueued', { name, delay: safeOpts.delay });
  } catch (err) {
    logger.error('Failed to enqueue job', { name, error: (err as Error).message });
    throw err;
  }
}

export async function closeQueue(): Promise<void> {
  await jobQueue.close();
}
