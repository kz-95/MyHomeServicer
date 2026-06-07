import { Job } from 'bullmq';
import { registerJob } from './index';
import { JOB_NAMES } from '../lib/queue';
import { logger } from '../lib/logger';

/**
 * Registers dispatch rotation job handlers.
 */
export function registerDispatchJobs(): void {
  registerJob(JOB_NAMES.DISPATCH_ROTATION, async (job: Job) => {
    const { broadcastId, quoteRequestId } = job.data as {
      broadcastId: string;
      quoteRequestId: string;
    };
    logger.info('Dispatch rotation timeout', { broadcastId, quoteRequestId });

    try {
      const { handleDispatchTimeout } = await import('../services/dispatch.service');
      await handleDispatchTimeout({ broadcastId, quoteRequestId });
    } catch (err) {
      logger.error('Dispatch rotation handler failed', {
        broadcastId,
        error: (err as Error).message,
      });
      throw err;
    }
  });
}
