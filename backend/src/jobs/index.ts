import { Job } from 'bullmq';
import { JOB_NAMES, JobName } from '../lib/queue';
import { logger } from '../lib/logger';

/**
 * Job handler registry. Each BullMQ job name maps to one handler. Handlers
 * are registered here as build phases land their background jobs. Until a
 * real handler is registered the job is acknowledged with a warning so the
 * queue never wedges.
 */
export type JobHandler = (job: Job) => Promise<void>;

const handlers = new Map<JobName, JobHandler>();

export function registerJob(name: JobName, handler: JobHandler): void {
  handlers.set(name, handler);
}

export function getHandler(name: string): JobHandler {
  const handler = handlers.get(name as JobName);
  if (handler) return handler;
  return async (job: Job) => {
    logger.warn('No handler registered for job — acknowledged as no-op', {
      name: job.name,
      id: job.id,
    });
  };
}

/**
 * Registers every job handler. Called once by the worker on boot. The
 * phase-specific job modules are imported statically (in worker.ts) so a
 * broken handler module fails loudly at startup instead of silently.
 */
export function logRegisteredJobs(): void {
  const registered = [...handlers.keys()];
  const missing = Object.values(JOB_NAMES).filter((n) => !handlers.has(n));
  logger.info('Job handlers registered', { registered });
  if (missing.length) {
    logger.warn('Job names with no registered handler', { missing });
  }
}
