import { Queue, Worker } from 'bullmq';

export const NOTIFICATION_QUEUE_NAME = 'notification-delivery';

export type NotificationQueueJob = {
  jobId: string;
  kind: 'email' | 'fanout';
};

export function createNotificationQueue(redisUrl: string) {
  return new Queue<NotificationQueueJob>(NOTIFICATION_QUEUE_NAME, {
    connection: { url: redisUrl },
  });
}

export function createNotificationWorker(
  redisUrl: string,
  concurrency: number,
  processor: (job: NotificationQueueJob) => Promise<void>,
) {
  return new Worker<NotificationQueueJob>(
    NOTIFICATION_QUEUE_NAME,
    async (job) => processor(job.data),
    {
      concurrency,
      connection: { url: redisUrl },
      lockDuration: 30_000,
      maxStalledCount: 2,
      stalledInterval: 10_000,
    },
  );
}
