import { Queue, Worker } from 'bullmq';

export const DOCUMENT_QUEUE_NAME = 'document-processing';

export type DocumentQueueJob =
  | { jobId: string; kind: 'comparison' | 'inspection' }
  | { processingJobId: string };

export function createDocumentQueue(redisUrl: string) {
  return new Queue<DocumentQueueJob>(DOCUMENT_QUEUE_NAME, {
    connection: { url: redisUrl },
  });
}

export function createDocumentWorker(
  redisUrl: string,
  concurrency: number,
  processor: (job: DocumentQueueJob) => Promise<void>,
) {
  return new Worker<DocumentQueueJob>(
    DOCUMENT_QUEUE_NAME,
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
