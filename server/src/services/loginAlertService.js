import { config } from '../config/env.js';
import { User } from '../models/index.js';
import { isEmailConfigured, sendEmail } from './emailService.js';
import { logger } from '../utils/logger.js';

const APP_NAME = process.env.VITE_APP_NAME || 'Duo';
const lastOnlineAlert = new Map(); // userId -> timestamp, throttles "online" alerts

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function describeDevice(userAgent = '') {
  const ua = userAgent || '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Unknown browser';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'unknown device';
  return `${browser} on ${os}`;
}

const isWatched = (user) => config.loginAlerts.recipients.length > 0 && config.loginAlerts.accounts.includes(user.email);

function formatTime(date) {
  const { timeZone } = config.loginAlerts;
  const when = new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(date);
  // dateStyle can't be combined with timeZoneName, so add the zone separately.
  const zone = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value;
  return zone ? `${when} ${zone}` : when;
}

/** Exported for tests: builds the alert email without sending it. */
export function buildAlertEmail({ name, event, at, device, ip }) {
  const headline = event === 'signin' ? `${name} signed in to ${APP_NAME}` : `${name} opened ${APP_NAME}`;
  const rows = [
    ['When', formatTime(at)],
    ['Device', device],
    ...(ip ? [['IP address', ip]] : []),
  ];
  const text = `${headline}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nThis is an automatic sign-in alert from ${APP_NAME}.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto;padding:24px;color:#241d19">
  <h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(headline)}</h2>
  <table style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#84766b">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>
  <p style="margin-top:20px;font-size:12px;color:#84766b">This is an automatic sign-in alert from ${escapeHtml(APP_NAME)}.</p>
</div>`;
  return { subject: headline, text, html };
}

// async so any failure becomes a rejected promise, never a throw into the caller.
async function send(user, event, { userAgent, ip }) {
  const email = buildAlertEmail({ name: user.name, event, at: new Date(), device: describeDevice(userAgent), ip });
  return sendEmail({ to: config.loginAlerts.recipients.join(', '), ...email });
}

/** After a successful password sign-in. Fire-and-forget. */
export function alertOnSignIn(user, context) {
  if (!config.loginAlerts.onSignIn || !isWatched(user) || !isEmailConfigured()) return;
  // The socket connection right after sign-in shouldn't send a second email.
  lastOnlineAlert.set(String(user._id), Date.now());
  send(user, 'signin', context).catch(() => logger.warn('Sign-in alert failed'));
}

/**
 * When a watched user comes online after being away for a while (their stored
 * `lastSeen` is from their last disconnect). Throttled per user.
 */
export async function alertOnCameOnline(userId, context) {
  if (!config.loginAlerts.onOnline || !isEmailConfigured()) return;
  const user = await User.findById(userId).select('name email lastSeen').lean();
  if (!user || !isWatched(user)) return;
  const gap = config.loginAlerts.onlineGapMs;
  const now = Date.now();
  const awayLongEnough = !user.lastSeen || now - new Date(user.lastSeen).getTime() >= gap;
  const notRecentlyAlerted = now - (lastOnlineAlert.get(String(userId)) ?? 0) >= gap;
  if (!awayLongEnough || !notRecentlyAlerted) return;
  lastOnlineAlert.set(String(userId), now);
  await send(user, 'online', context);
}

export function resetLoginAlertState() {
  lastOnlineAlert.clear();
}
