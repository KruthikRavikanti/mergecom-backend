import { Queue } from 'bullmq';

export const DOCUMENT_QUEUE_NAME = 'document-processing';

export function createDocumentQueue(redisUrl: string) {
  return new Queue(DOCUMENT_QUEUE_NAME, { connection: { url: redisUrl } });
}
