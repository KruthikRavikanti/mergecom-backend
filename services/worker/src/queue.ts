import { Queue, Worker } from 'bullmq';

export const DOCUMENT_QUEUE_NAME = 'document-processing';

export interface DocumentQueueJob {
  processingJobId: string;
}

export function createDocumentQueue(redisUrl: string) {
  return new Queue<DocumentQueueJob>(DOCUMENT_QUEUE_NAME, {
    connection: { url: redisUrl },
  });
}

export function createDocumentWorker(
  redisUrl: string,
  concurrency: number,
  processor: (processingJobId: string) => Promise<void>,
) {
  return new Worker<DocumentQueueJob>(
    DOCUMENT_QUEUE_NAME,
    async (job) => processor(job.data.processingJobId),
    {
      concurrency,
      connection: { url: redisUrl },
      lockDuration: 30_000,
      maxStalledCount: 2,
      stalledInterval: 10_000,
    },
  );
}
