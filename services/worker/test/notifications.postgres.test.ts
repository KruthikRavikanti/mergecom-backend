import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:net';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createNotificationMailer } from '../src/notification-mailer';
import {
  NotificationEmailProcessor,
  NotificationFanoutProcessor,
} from '../src/notification-pipeline';
import { NotificationStore } from '../src/notification-store';

const databaseUrl = process.env.TEST_WORKER_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('durable notification delivery', () => {
  let pool: Pool;
  let smtp: TestSmtpServer;
  let store: NotificationStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    store = new NotificationStore(databaseUrl!);
    smtp = await startSmtpServer();
  });

  afterAll(async () => {
    await store.close();
    await pool.end();
    await smtp.close();
  });

  it('fans out once, honors channel preferences, and completes SMTP delivery', async () => {
    const organizationId = randomUUID();
    const actorUserId = randomUUID();
    const reviewerUserId = randomUUID();
    const mutedUserId = randomUUID();
    const actorMembershipId = randomUUID();
    const reviewerMembershipId = randomUUID();
    const mutedMembershipId = randomUUID();
    const projectId = randomUUID();
    const documentId = randomUUID();
    const branchId = randomUUID();
    const artifactId = randomUUID();
    const versionId = randomUUID();
    const reviewRequestId = randomUUID();
    const eventId = randomUUID();
    const reviewerEmail = `reviewer-${reviewerUserId}@mergecom.test`;

    try {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(
          `insert into organizations (id, name, slug)
           values ($1, 'Notification Integration', $2)`,
          [organizationId, `notifications-${organizationId}`],
        );
        await client.query(
          `insert into users
            (id, display_name, primary_email, email_verified) values
            ($1, 'Review Owner', $4, true),
            ($2, 'Review Recipient', $5, true),
            ($3, 'Muted Recipient', $6, true)`,
          [
            actorUserId,
            reviewerUserId,
            mutedUserId,
            `owner-${actorUserId}@mergecom.test`,
            reviewerEmail,
            `muted-${mutedUserId}@mergecom.test`,
          ],
        );
        await client.query(
          `insert into memberships
            (id, organization_id, user_id, role, status) values
            ($1, $4, $5, 'owner', 'active'),
            ($2, $4, $6, 'reviewer', 'active'),
            ($3, $4, $7, 'reviewer', 'active')`,
          [
            actorMembershipId,
            reviewerMembershipId,
            mutedMembershipId,
            organizationId,
            actorUserId,
            reviewerUserId,
            mutedUserId,
          ],
        );
        await client.query(
          `insert into projects
            (id, organization_id, name, created_by_user_id)
           values ($1, $2, 'Notification Pipeline', $3)`,
          [projectId, organizationId, actorUserId],
        );
        await client.query(
          `insert into project_memberships
            (organization_id, project_id, organization_membership_id, role,
             added_by_user_id) values
            ($1, $2, $3, 'project_lead', $5),
            ($1, $2, $4, 'reviewer', $5),
            ($1, $2, $6, 'reviewer', $5)`,
          [
            organizationId,
            projectId,
            actorMembershipId,
            reviewerMembershipId,
            actorUserId,
            mutedMembershipId,
          ],
        );
        await client.query(
          `insert into documents
            (id, organization_id, project_id, name, kind, created_by_user_id)
           values ($1, $2, $3, 'Confidential Board Pack.docx',
                   'word_document', $4)`,
          [documentId, organizationId, projectId, actorUserId],
        );
        await client.query(
          `insert into document_branches
            (id, organization_id, document_id, name, is_default,
             created_by_user_id)
           values ($1, $2, $3, 'main', true, $4)`,
          [branchId, organizationId, documentId, actorUserId],
        );
        await client.query(
          `insert into artifacts
            (id, organization_id, object_key, sha256, byte_size,
             detected_media_type, original_filename, extension, scan_status,
             created_by_user_id)
           values ($1, $2, $3, $4, 1,
                   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                   'Confidential Board Pack.docx', '.docx', 'clean', $5)`,
          [
            artifactId,
            organizationId,
            `organizations/${organizationId}/artifacts/${artifactId}/source.docx`,
            '0'.repeat(64),
            actorUserId,
          ],
        );
        await client.query(
          `insert into document_versions
            (id, organization_id, document_id, branch_id, artifact_id,
             sequence, display_number, source, status, note, author_user_id)
           values ($1, $2, $3, $4, $5, 1, 1, 'web_upload', 'ready',
                   'Notification test', $6)`,
          [
            versionId,
            organizationId,
            documentId,
            branchId,
            artifactId,
            actorUserId,
          ],
        );
        await client.query(
          `update document_branches set head_version_id = $1 where id = $2`,
          [versionId, branchId],
        );
        await client.query(
          `insert into review_requests
            (id, organization_id, document_id, version_id,
             requested_by_user_id, message)
           values ($1, $2, $3, $4, $5, 'Please review')`,
          [reviewRequestId, organizationId, documentId, versionId, actorUserId],
        );
        await client.query(
          `insert into review_assignments
            (organization_id, review_request_id, reviewer_user_id,
             assigned_by_user_id) values
            ($1, $2, $3, $3),
            ($1, $2, $4, $3),
            ($1, $2, $5, $3)`,
          [
            organizationId,
            reviewRequestId,
            actorUserId,
            reviewerUserId,
            mutedUserId,
          ],
        );
        await client.query(
          `insert into notification_preferences
            (organization_id, user_id, in_app_review_activity,
             email_review_activity) values
            ($1, $2, true, true),
            ($1, $3, false, false)`,
          [organizationId, reviewerUserId, mutedUserId],
        );
        await client.query(
          `insert into outbox_events
            (id, organization_id, aggregate_type, aggregate_id, event_type,
             payload)
           values ($1, $2, 'review_request', $3, 'review.requested', $4)`,
          [
            eventId,
            organizationId,
            reviewRequestId,
            JSON.stringify({ actorUserId, reviewRequestId }),
          ],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }

      await store.reconcile();
      expect(await store.listDispatchable()).toContain(eventId);
      const fanout = new NotificationFanoutProcessor(store, 30_000, 5_000);
      await fanout.process(eventId);
      await fanout.process(eventId);

      const persisted = await pool.query<{
        channel: 'email' | 'in_app';
        recipient_address: string | null;
        recipient_user_id: string;
        status: string;
      }>(
        `select n.recipient_user_id, d.channel, d.status, d.recipient_address
           from user_notifications n
           join notification_deliveries d on d.notification_id = n.id
          where n.source_event_id = $1
          order by n.recipient_user_id, d.channel`,
        [eventId],
      );
      expect(persisted.rows).toHaveLength(4);
      expect(
        persisted.rows.filter((row) => row.recipient_user_id === actorUserId),
      ).toHaveLength(0);
      expect(
        persisted.rows.filter(
          (row) =>
            row.recipient_user_id === reviewerUserId &&
            row.channel === 'in_app',
        )[0],
      ).toMatchObject({ recipient_address: null, status: 'completed' });
      expect(
        persisted.rows.filter(
          (row) =>
            row.recipient_user_id === mutedUserId && row.channel === 'email',
        )[0],
      ).toMatchObject({ recipient_address: null, status: 'suppressed' });

      const event = await pool.query<{ dispatch: string; outbox: string }>(
        `select o.status as outbox, d.status as dispatch
           from outbox_events o
           join notification_dispatches d on d.outbox_event_id = o.id
          where o.id = $1`,
        [eventId],
      );
      expect(event.rows[0]).toEqual({
        dispatch: 'completed',
        outbox: 'published',
      });

      const emailIds = await store.listDispatchableEmails();
      expect(emailIds).toHaveLength(1);
      const mailer = createNotificationMailer({
        from: 'MergeCom <no-reply@mergecom.local>',
        smtpUrl: smtp.url,
        webOrigin: 'http://127.0.0.1:5173',
      });
      const email = new NotificationEmailProcessor(
        store,
        mailer,
        30_000,
        5_000,
      );
      await email.process(emailIds[0]!);
      await email.process(emailIds[0]!);

      expect(smtp.messages).toHaveLength(1);
      expect(smtp.messages[0]).toContain(`To: ${reviewerEmail}`);
      expect(smtp.messages[0]).toContain('Subject: Review requested');
      expect(smtp.messages[0]).toContain('Open in MergeCom:');
      expect(smtp.messages[0]).toContain('http://127.0.0.1:5173/app/projects/');
      expect(smtp.messages[0]).not.toContain('Confidential Board Pack');
      expect(smtp.messages[0]).not.toContain('Please review');
      const completed = await pool.query<{
        attempts: number;
        provider_message_id: string;
        status: string;
      }>(
        `select status, attempts, provider_message_id
           from notification_deliveries where id = $1`,
        [emailIds[0]],
      );
      expect(completed.rows[0]).toMatchObject({
        attempts: 1,
        status: 'completed',
      });
      expect(completed.rows[0]?.provider_message_id).toBe(
        `<notification-${emailIds[0]}@mergecom.local>`,
      );
    } finally {
      await pool.query(
        'delete from review_requests where organization_id = $1',
        [organizationId],
      );
      await pool.query('delete from outbox_events where organization_id = $1', [
        organizationId,
      ]);
      await pool.query(
        `update document_branches set head_version_id = null
          where organization_id = $1`,
        [organizationId],
      );
      await pool.query(
        'delete from document_versions where organization_id = $1',
        [organizationId],
      );
      await pool.query('delete from artifacts where organization_id = $1', [
        organizationId,
      ]);
      await pool.query('delete from projects where organization_id = $1', [
        organizationId,
      ]);
      await pool.query('delete from memberships where organization_id = $1', [
        organizationId,
      ]);
      await pool.query('delete from organizations where id = $1', [
        organizationId,
      ]);
      await pool.query('delete from users where id = any($1::uuid[])', [
        [actorUserId, reviewerUserId, mutedUserId],
      ]);
    }
  });
});

interface TestSmtpServer {
  close: () => Promise<void>;
  messages: string[];
  url: string;
}

async function startSmtpServer(): Promise<TestSmtpServer> {
  const messages: string[] = [];
  const server: Server = createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 mergecom.test ESMTP\r\n');
    let buffer = '';
    let receivingData = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      while (buffer.length > 0) {
        if (receivingData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          messages.push(buffer.slice(0, end));
          buffer = buffer.slice(end + 5);
          receivingData = false;
          socket.write('250 2.0.0 accepted\r\n');
          continue;
        }
        const end = buffer.indexOf('\r\n');
        if (end === -1) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (/^EHLO /iu.test(line)) {
          socket.write('250-mergecom.test\r\n250 PIPELINING\r\n');
        } else if (line === 'DATA') {
          receivingData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 2.0.0 bye\r\n');
        } else {
          socket.write('250 2.0.0 OK\r\n');
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The SMTP test server did not bind a TCP port.');
  }
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    messages,
    url: `smtp://127.0.0.1:${address.port}`,
  };
}
