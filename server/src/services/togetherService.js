import mongoose from 'mongoose';
import { Conversation, User } from '../models/index.js';
import { config } from '../config/env.js';
import { badRequest, notFound, AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { emitToConversation, emitToUser, onScreenPushEndpoints } from '../sockets/realtime.js';
import { isPushEnabled, sendToUser } from './pushService.js';

// ---- "Thinking of you" tap --------------------------------------------------------------
const NUDGE_COOLDOWN_MS = 5000;
const lastNudge = new Map(); // userId -> time

/** A heart buzz to the other person: live if Duo is open, a notification if not. */
export async function sendNudge(session) {
  const me = String(session.user._id);
  const now = Date.now();
  if (now - (lastNudge.get(me) ?? 0) < NUDGE_COOLDOWN_MS) throw new AppError(429, 'TOO_FAST', 'Give it a few seconds ❤️');
  lastNudge.set(me, now);
  const peerId = String(session.peerId);
  emitToUser(peerId, 'nudge', { from: me, at: new Date(now).toISOString() });
  if (!isPushEnabled()) return;
  try {
    const skipEndpoints = await onScreenPushEndpoints(peerId);
    const recipient = await User.findById(peerId).select('settings').lean();
    const hidden = recipient?.settings?.notificationPreview === 'hidden';
    await sendToUser(
      peerId,
      { type: 'nudge', tag: 'duo-nudge', url: '/', title: hidden ? 'Duo' : session.user.name, body: hidden ? 'Someone is thinking of you ❤️' : 'is thinking of you ❤️' },
      { urgency: 'high', topic: 'nudge', ttl: 60 * 60, skipEndpoints },
    );
  } catch {
    logger.warn('Nudge notification failed');
  }
}

export function resetNudges() {
  lastNudge.clear();
}

// ---- Days together & countdowns ------------------------------------------------------------
// Dates are plain calendar days ("2025-02-14"), so time zones never shift them.
export const EVENT_KINDS = ['birthday', 'anniversary', 'meetup', 'other'];
const MAX_EVENTS = 50;
const EMPTY = { since: null, events: [] };

export function serializeTogether(together) {
  if (!together) return EMPTY;
  return {
    since: together.since ?? null,
    events: (together.events ?? []).map((e) => ({ id: String(e._id), title: e.title, date: e.date, kind: e.kind, yearly: Boolean(e.yearly) })),
  };
}

const current = async (session) => (await Conversation.findById(session.conversation._id).select('together').lean())?.together ?? null;
const publish = (session, together) => emitToConversation(session.conversation._id, 'together:updated', together);

export async function getTogether(session) {
  return serializeTogether(await current(session));
}

async function save(session, update) {
  await Conversation.updateOne({ _id: session.conversation._id }, update);
  const together = await getTogether(session);
  publish(session, together);
  return together;
}

export const setSince = (session, since) => save(session, { $set: { 'together.since': since } });

export async function addEvent(session, event) {
  const now = await current(session);
  if ((now?.events?.length ?? 0) >= MAX_EVENTS) throw badRequest(`You can have up to ${MAX_EVENTS} dates.`, 'TOO_MANY_EVENTS');
  return save(session, { $push: { 'together.events': { _id: new mongoose.Types.ObjectId(), ...event } } });
}

export async function updateEvent(session, eventId, changes) {
  const set = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`together.events.$.${k}`, v]));
  const res = await Conversation.updateOne({ _id: session.conversation._id, 'together.events._id': new mongoose.Types.ObjectId(eventId) }, { $set: set });
  if (!res.matchedCount) throw notFound('That date was removed.', 'EVENT_NOT_FOUND');
  const together = await getTogether(session);
  publish(session, together);
  return together;
}

export async function removeEvent(session, eventId) {
  return save(session, { $pull: { 'together.events': { _id: new mongoose.Types.ObjectId(eventId) } } });
}

// ---- Reminders ---------------------------------------------------------------------------------
const parse = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

/** Today's calendar day in the reminder time zone, e.g. "2026-10-11". */
export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const hourIn = (timeZone, now = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));

/** The next day (≥ today) an event falls on; yearly events roll over (29 Feb → 28 Feb). */
export function nextOccurrence(event, today) {
  if (!event.yearly) return event.date;
  const [, m, d] = event.date.split('-').map(Number);
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = m === 2 && d === 29 && !leap ? 28 : d;
    const candidate = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (candidate >= today) return candidate;
  }
  return null;
}

const MILESTONES = new Set([100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000]);

/** What to celebrate or remind about today: [{ title, body }]. Pure, for testing. */
export function remindersFor(together, today) {
  const out = [];
  for (const event of together?.events ?? []) {
    const next = nextOccurrence(event, today);
    if (!next) continue;
    const days = Math.round((parse(next) - parse(today)) / DAY);
    const icon = { birthday: '🎂', anniversary: '💞', meetup: '✈️', other: '📅' }[event.kind] ?? '📅';
    if (days === 0) out.push({ title: `${icon} Today: ${event.title}`, body: event.kind === 'meetup' ? 'The day is finally here!' : 'Make it a special one ❤️' });
    if (days === 1) out.push({ title: `${icon} Tomorrow: ${event.title}`, body: 'Just one more day!' });
  }
  if (together?.since && together.since <= today) {
    const days = Math.round((parse(today) - parse(together.since)) / DAY);
    const [sy, sm, sd] = together.since.split('-');
    const years = Number(today.slice(0, 4)) - Number(sy);
    if (years > 0 && today.slice(5) === `${sm}-${sd}`) out.push({ title: `💞 ${years} year${years === 1 ? '' : 's'} together today!`, body: 'Happy anniversary ❤️' });
    else if (MILESTONES.has(days)) out.push({ title: `🎉 ${days} days together today!`, body: 'Here’s to many more ❤️' });
  }
  return out;
}

const REMINDER_HOUR = 9;

/** Hourly (from the janitor): send today's reminders once, after 9 AM local time. */
export async function sendDueReminders(now = new Date()) {
  const timeZone = config.reminderTimeZone;
  if (hourIn(timeZone, now) < REMINDER_HOUR) return 0;
  const today = todayIn(timeZone, now);
  const conversation = await Conversation.findOne({ 'together.lastReminderDay': { $ne: today } }).select('participants together').lean();
  if (!conversation) return 0;
  // Claim the day first so a restart can't send twice.
  const claimed = await Conversation.updateOne({ _id: conversation._id, 'together.lastReminderDay': { $ne: today } }, { $set: { 'together.lastReminderDay': today } });
  if (!claimed.modifiedCount) return 0;
  const reminders = remindersFor(conversation.together, today);
  for (const r of reminders) {
    emitToConversation(conversation._id, 'together:reminder', r);
    if (isPushEnabled()) {
      for (const userId of conversation.participants) {
        await sendToUser(userId, { type: 'reminder', tag: `duo-reminder-${today}`, url: '/together', title: r.title, body: r.body }, { ttl: 12 * 60 * 60 }).catch(() => {});
      }
    }
  }
  return reminders.length;
}

export { iso };
