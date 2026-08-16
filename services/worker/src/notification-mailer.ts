import nodemailer from 'nodemailer';

export interface NotificationEmail {
  body: string;
  deliveryId: string;
  href: string;
  recipient: string;
  title: string;
}

export interface NotificationMailer {
  send(input: NotificationEmail): Promise<string>;
}

export function createNotificationMailer(input: {
  from: string;
  smtpUrl: string;
  webOrigin: string;
}): NotificationMailer {
  const transport = nodemailer.createTransport(input.smtpUrl);
  return {
    async send(email) {
      const result = await transport.sendMail({
        from: input.from,
        messageId: `<notification-${email.deliveryId}@mergecom.local>`,
        subject: email.title,
        text: [
          email.body,
          '',
          `Open in MergeCom: ${new URL(email.href, input.webOrigin).href}`,
        ].join('\n'),
        to: email.recipient,
      });
      return result.messageId;
    },
  };
}
