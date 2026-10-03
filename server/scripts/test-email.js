/**
 * Sends a test email to LOGIN_ALERT_TO using the configured provider
 * (Brevo API if BREVO_API_KEY is set, otherwise SMTP).
 *   npm run email:test
 */
import { config } from '../src/config/env.js';
import { isEmailConfigured, sendEmail } from '../src/services/emailService.js';

const to = config.loginAlerts.recipients.join(', ');
const provider = config.email.brevoApiKey ? 'Brevo' : 'SMTP';

if (!isEmailConfigured()) {
  console.error('Email is not configured. Set BREVO_API_KEY + EMAIL_FROM, or SMTP_HOST + SMTP_USER + SMTP_PASS.');
  process.exit(1);
}
if (!to) {
  console.error('LOGIN_ALERT_TO is empty. Set the address that should receive alerts.');
  process.exit(1);
}

const ok = await sendEmail({
  to,
  subject: 'Test: sign-in alerts are working',
  text: `This is a test email sent via ${provider}. Sign-in alerts will be sent here for: ${config.loginAlerts.accounts.join(', ') || '(no accounts configured)'}.`,
});

if (ok) {
  console.log(`Test email sent via ${provider} to ${to}. Check the inbox (and spam folder).`);
} else {
  console.error(`Sending via ${provider} failed — see the reason above.`);
  if (provider === 'SMTP') console.error('Gmail needs a 16-character App Password, not your normal password.');
  else console.error('Check BREVO_API_KEY, and that EMAIL_FROM is a verified sender in Brevo.');
  process.exit(1);
}
