import nodemailer from 'nodemailer';

import type { ApiConfig } from '../config';

export interface InvitationMailer {
  send(input: {
    acceptanceUrl: string;
    email: string;
    expiresAt: Date;
    organizationName: string;
  }): Promise<void>;
}

export function createInvitationMailer(
  config: ApiConfig,
): InvitationMailer | null {
  if (!config.invitationMail) return null;
  const transport = nodemailer.createTransport(config.invitationMail.smtpUrl);
  return {
    async send(input) {
      await transport.sendMail({
        from: config.invitationMail?.from,
        subject: `Invitation to ${input.organizationName} in MergeCom`,
        text: [
          `You were invited to ${input.organizationName} in MergeCom.`,
          '',
          `Accept the invitation: ${input.acceptanceUrl}`,
          '',
          `This one-time invitation expires ${input.expiresAt.toISOString()}.`,
        ].join('\n'),
        to: input.email,
      });
    },
  };
}
