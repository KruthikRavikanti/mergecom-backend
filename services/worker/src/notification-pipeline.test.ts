import { describe, expect, it, vi } from 'vitest';

import {
  NotificationEmailProcessor,
  NotificationFanoutProcessor,
} from './notification-pipeline';
import {
  PermanentNotificationError,
  type ClaimedEmailDelivery,
  type ClaimedNotificationJob,
} from './notification-store';

const fanoutJob: ClaimedNotificationJob = {
  attempts: 1,
  id: '10000000-0000-4000-8000-000000000001',
  maxAttempts: 5,
};

const emailDelivery: ClaimedEmailDelivery = {
  attempts: 1,
  body: 'A document version is waiting for your review.',
  href: '/app/projects/project/documents/document/history/reviews/review',
  id: '20000000-0000-4000-8000-000000000001',
  maxAttempts: 5,
  recipient: 'reviewer@mergecom.test',
  title: 'Review requested',
};

function store(overrides: Record<string, unknown> = {}) {
  return {
    claimDispatch: vi.fn().mockResolvedValue(fanoutJob),
    claimEmail: vi.fn().mockResolvedValue(emailDelivery),
    completeEmail: vi.fn().mockResolvedValue(undefined),
    fanOut: vi.fn().mockResolvedValue(undefined),
    heartbeatDispatch: vi.fn().mockResolvedValue(true),
    heartbeatEmail: vi.fn().mockResolvedValue(true),
    listDispatchable: vi.fn().mockResolvedValue([]),
    listDispatchableEmails: vi.fn().mockResolvedValue([]),
    reconcile: vi.fn().mockResolvedValue(undefined),
    recordDispatchFailure: vi.fn().mockResolvedValue(false),
    recordEmailFailure: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('notification fan-out processor', () => {
  it('fans out one claimed source event', async () => {
    const persistence = store();
    await new NotificationFanoutProcessor(persistence, 30_000, 60_000).process(
      fanoutJob.id,
    );

    expect(persistence.fanOut).toHaveBeenCalledWith(
      fanoutJob,
      expect.any(String),
    );
    expect(persistence.recordDispatchFailure).not.toHaveBeenCalled();
  });

  it('treats an absent claim as a duplicate no-op', async () => {
    const persistence = store({
      claimDispatch: vi.fn().mockResolvedValue(null),
    });
    await new NotificationFanoutProcessor(persistence, 30_000, 60_000).process(
      fanoutJob.id,
    );

    expect(persistence.fanOut).not.toHaveBeenCalled();
  });

  it('dead-letters unsupported source data without a BullMQ retry', async () => {
    const persistence = store({
      fanOut: vi
        .fn()
        .mockRejectedValue(
          new PermanentNotificationError(
            'notification_source_missing',
            'source unavailable',
          ),
        ),
    });
    await new NotificationFanoutProcessor(persistence, 30_000, 60_000).process(
      fanoutJob.id,
    );

    expect(persistence.recordDispatchFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCode: 'notification_source_missing',
        retryable: false,
      }),
    );
  });
});

describe('notification email processor', () => {
  it('persists the provider message ID after SMTP accepts the email', async () => {
    const persistence = store();
    const mailer = { send: vi.fn().mockResolvedValue('<accepted@example>') };
    await new NotificationEmailProcessor(
      persistence,
      mailer,
      30_000,
      60_000,
    ).process(emailDelivery.id);

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: emailDelivery.id,
        recipient: emailDelivery.recipient,
      }),
    );
    expect(persistence.completeEmail).toHaveBeenCalledWith(
      emailDelivery.id,
      expect.any(String),
      '<accepted@example>',
    );
  });

  it('records retryable SMTP failure and lets BullMQ retry', async () => {
    const smtpError = new Error('SMTP unavailable');
    const persistence = store({
      recordEmailFailure: vi.fn().mockResolvedValue(true),
    });
    const processor = new NotificationEmailProcessor(
      persistence,
      { send: vi.fn().mockRejectedValue(smtpError) },
      30_000,
      60_000,
    );

    await expect(processor.process(emailDelivery.id)).rejects.toThrow(
      'SMTP unavailable',
    );
    expect(persistence.recordEmailFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'smtp_delivery_failed' }),
    );
  });
});
