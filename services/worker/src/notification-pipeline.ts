import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import type { Queue, Worker } from 'bullmq';

import type { WorkerConfig } from './config';
import type { NotificationMailer } from './notification-mailer';
import {
  createNotificationQueue,
  createNotificationWorker,
  type NotificationQueueJob,
} from './notification-queue';
import {
  NotificationStore,
  PermanentNotificationError,
  type ClaimedEmailDelivery,
  type ClaimedNotificationJob,
} from './notification-store';

interface NotificationStoreLike {
  claimDispatch(
    id: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedNotificationJob | null>;
  claimEmail(
    id: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedEmailDelivery | null>;
  completeEmail(
    id: string,
    leaseOwner: string,
    providerMessageId: string,
  ): Promise<void>;
  fanOut(job: ClaimedNotificationJob, leaseOwner: string): Promise<void>;
  heartbeatDispatch(
    id: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean>;
  heartbeatEmail(
    id: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean>;
  listDispatchable(limit?: number): Promise<string[]>;
  listDispatchableEmails(limit?: number): Promise<string[]>;
  reconcile(): Promise<void>;
  recordDispatchFailure(input: {
    error: string;
    failureCode: string;
    job: ClaimedNotificationJob;
    leaseOwner: string;
    retryAt: Date;
    retryable: boolean;
  }): Promise<boolean>;
  recordEmailFailure(input: {
    delivery: ClaimedEmailDelivery;
    error: string;
    failureCode: string;
    leaseOwner: string;
    retryAt: Date;
  }): Promise<boolean>;
}

export class NotificationFanoutProcessor {
  private readonly leaseOwner = `${hostname()}:${process.pid}:fanout:${randomUUID()}`;

  public constructor(
    private readonly store: NotificationStoreLike,
    private readonly leaseMilliseconds: number,
    private readonly heartbeatMilliseconds: number,
  ) {}

  public async process(id: string): Promise<void> {
    const job = await this.store.claimDispatch(
      id,
      this.leaseOwner,
      this.leaseMilliseconds,
    );
    if (!job) return;
    const heartbeat = setInterval(() => {
      void this.store
        .heartbeatDispatch(id, this.leaseOwner, this.leaseMilliseconds)
        .catch(() => false);
    }, this.heartbeatMilliseconds);
    heartbeat.unref();
    try {
      await this.store.fanOut(job, this.leaseOwner);
    } catch (error) {
      const permanent = error instanceof PermanentNotificationError;
      const retryDelay = Math.min(60_000, 1_000 * 2 ** (job.attempts - 1));
      const retry = await this.store.recordDispatchFailure({
        error: errorMessage(error),
        failureCode: permanent ? error.code : 'notification_fanout_failed',
        job,
        leaseOwner: this.leaseOwner,
        retryAt: new Date(Date.now() + retryDelay),
        retryable: !permanent,
      });
      if (retry) throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

export class NotificationEmailProcessor {
  private readonly leaseOwner = `${hostname()}:${process.pid}:email:${randomUUID()}`;

  public constructor(
    private readonly store: NotificationStoreLike,
    private readonly mailer: NotificationMailer,
    private readonly leaseMilliseconds: number,
    private readonly heartbeatMilliseconds: number,
  ) {}

  public async process(id: string): Promise<void> {
    const delivery = await this.store.claimEmail(
      id,
      this.leaseOwner,
      this.leaseMilliseconds,
    );
    if (!delivery) return;
    const heartbeat = setInterval(() => {
      void this.store
        .heartbeatEmail(id, this.leaseOwner, this.leaseMilliseconds)
        .catch(() => false);
    }, this.heartbeatMilliseconds);
    heartbeat.unref();
    try {
      const providerMessageId = await this.mailer.send({
        body: delivery.body,
        deliveryId: delivery.id,
        href: delivery.href,
        recipient: delivery.recipient,
        title: delivery.title,
      });
      await this.store.completeEmail(
        delivery.id,
        this.leaseOwner,
        providerMessageId,
      );
    } catch (error) {
      const retryDelay = Math.min(
        5 * 60_000,
        5_000 * 2 ** (delivery.attempts - 1),
      );
      const retry = await this.store.recordEmailFailure({
        delivery,
        error: errorMessage(error),
        failureCode: 'smtp_delivery_failed',
        leaseOwner: this.leaseOwner,
        retryAt: new Date(Date.now() + retryDelay),
      });
      if (retry) throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

export class NotificationPipeline {
  private readonly emailProcessor: NotificationEmailProcessor;
  private readonly fanoutProcessor: NotificationFanoutProcessor;
  private readonly queue: Queue<NotificationQueueJob>;
  private readonly worker: Worker<NotificationQueueJob>;
  private dispatchTimer: NodeJS.Timeout | null = null;
  private dispatching = false;

  public constructor(
    private readonly config: WorkerConfig,
    private readonly store: NotificationStore,
    mailer: NotificationMailer,
  ) {
    this.emailProcessor = new NotificationEmailProcessor(
      store,
      mailer,
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
    );
    this.fanoutProcessor = new NotificationFanoutProcessor(
      store,
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
    );
    this.queue = createNotificationQueue(config.redisUrl);
    this.worker = createNotificationWorker(
      config.redisUrl,
      config.notificationConcurrency,
      (job) =>
        job.kind === 'fanout'
          ? this.fanoutProcessor.process(job.jobId)
          : this.emailProcessor.process(job.jobId),
    );
    this.worker.on('error', (error) => {
      process.stderr.write(`Notification worker error: ${error.message}\n`);
    });
  }

  public async start(): Promise<void> {
    await Promise.all([
      this.queue.waitUntilReady(),
      this.worker.waitUntilReady(),
    ]);
    await this.dispatch();
    this.dispatchTimer = setInterval(() => {
      void this.dispatch().catch((error: unknown) => {
        process.stderr.write(
          `Notification dispatch error: ${errorMessage(error)}\n`,
        );
      });
    }, this.config.dispatchIntervalMilliseconds);
    this.dispatchTimer.unref();
  }

  public async dispatch(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      await this.store.reconcile();
      for (const id of await this.store.listDispatchable()) {
        await this.enqueue(`fanout-${id}`, { jobId: id, kind: 'fanout' });
      }
      for (const id of await this.store.listDispatchableEmails()) {
        await this.enqueue(`email-${id}`, { jobId: id, kind: 'email' });
      }
    } finally {
      this.dispatching = false;
    }
  }

  public async close(): Promise<void> {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    await Promise.all([this.worker.close(), this.queue.close()]);
  }

  private async enqueue(id: string, data: NotificationQueueJob) {
    const existing = await this.queue.getJob(id);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') await existing.remove();
    }
    await this.queue.add(data.kind, data, {
      attempts: 5,
      backoff: { delay: 1_000, type: 'exponential' },
      jobId: id,
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400, count: 1_000 },
    });
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}
