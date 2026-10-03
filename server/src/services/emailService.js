import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let transport = null;
let override = null;

/** Tests inject a fake transport; production uses Brevo (HTTPS) or SMTP. */
export function setEmailTransport(fake) {
  override = fake;
}

const useBrevo = () => Boolean(config.email.brevoApiKey);

export const isEmailConfigured = () =>
  Boolean(override || (useBrevo() ? config.email.from : config.email.host && config.email.user && config.email.pass));

/**
 * Brevo's transactional email API over HTTPS — works on hosts that block
 * outgoing SMTP ports (common on free tiers). The sender address must be
 * verified in Brevo.
 */
function brevoTransport() {
  return {
    async sendMail({ from, to, subject, text, html }) {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': config.email.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: from, name: config.email.fromName },
          to: String(to).split(',').map((email) => ({ email: email.trim() })).filter((r) => r.email),
          subject,
          textContent: text,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw Object.assign(new Error(detail.message || `Brevo responded ${res.status}`), { responseCode: res.status, code: detail.code });
      }
    },
  };
}

function getTransport() {
  if (override) return override;
  transport ??= useBrevo()
    ? brevoTransport()
    : nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: { user: config.email.user, pass: config.email.pass },
      });
  return transport;
}

/** Best-effort send: never throws, and never logs the message body. */
export async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) return false;
  try {
    await getTransport().sendMail({ from: config.email.from, to, subject, text, html });
    return true;
  } catch (err) {
    logger.warn('Email delivery failed', { provider: useBrevo() ? 'brevo' : 'smtp', code: err.code, responseCode: err.responseCode, reason: err.message });
    return false;
  }
}
