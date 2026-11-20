/**
 * Gửi email qua SMTP. Chỉ bật khi có SMTP_URL; nodemailer được nạp lười
 * để server không tốn gì khi tính năng này tắt.
 */
export function createMailer(config) {
  if (!config.smtpUrl) {
    return {
      enabled: false,
      async send() {
        throw new Error('SMTP chưa được cấu hình');
      },
    };
  }

  let transport;
  return {
    enabled: true,
    async send({ to, subject, text }) {
      if (!transport) {
        const { createTransport } = await import('nodemailer');
        transport = createTransport(config.smtpUrl);
      }
      await transport.sendMail({ from: config.mailFrom, to, subject, text });
    },
  };
}
