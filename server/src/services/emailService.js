import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let transport = null;
let override = null;

/** Tests inject a fake transport; production uses SMTP from the environment. */
export function setEmailTransport(fake) {
  override = fake;
}

export const isEmailConfigured = () => Boolean(override || (config.email.host && config.email.user && config.email.pass));

function getTransport() {
  if (override) return override;
  transport ??= nodemailer.createTransport({
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
    logger.warn('Email delivery failed', { code: err.code, responseCode: err.responseCode });
    return false;
  }
}
