/**
 * Sends a test email to LOGIN_ALERT_TO using the SMTP settings in .env.
 *   npm run email:test
 */
import nodemailer from 'nodemailer';
import { config } from '../src/config/env.js';

const { host, port, secure, user, pass, from } = config.email;
const to = config.loginAlerts.recipients.join(', ');

if (!host || !user || !pass) {
  console.error('SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env.');
  process.exit(1);
}
if (!to) {
  console.error('LOGIN_ALERT_TO is empty. Set the address that should receive alerts.');
  process.exit(1);
}

try {
  const transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  await transport.verify();
  await transport.sendMail({
    from,
    to,
    subject: 'Test: sign-in alerts are working',
    text: `This is a test email. Sign-in alerts will be sent here for: ${config.loginAlerts.accounts.join(', ') || '(no accounts configured)'}.`,
  });
  console.log(`Test email sent to ${to}. Check the inbox (and spam folder).`);
} catch (err) {
  console.error(`Sending failed: ${err.message}`);
  if (err.responseCode === 535 || /Username and Password not accepted/i.test(err.message)) {
    console.error('Gmail rejected the login. Use a 16-character App Password, not your normal Gmail password.');
  }
  process.exit(1);
}
