import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Conversation, PushSubscription } from '../src/models/index.js';
import { setPushSender } from '../src/services/pushService.js';
import { nextOccurrence, remindersFor, resetNudges, sendDueReminders } from '../src/services/togetherService.js';
import { USERS, connectSocket, delay, loginAs, startTestServer, waitFor } from './helpers.js';

const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
let ctx;
let alex;
let sam;
const open = [];
const connect = async (agent) => {
  const s = await connectSocket(ctx.url, agent.cookie);
  open.push(s);
  return s;
};
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterEach(async () => {
  open.splice(0).forEach((s) => s.close());
  setPushSender(null);
  resetNudges();
  await delay(30);
});
afterAll(() => ctx.close());

describe('"Thinking of you" tap', () => {
  it('reaches the other person live and by push, with a short cooldown', async () => {
    const pushes = [];
    setPushSender(async (sub, body) => {
      pushes.push(JSON.parse(body));
      return { statusCode: 201 };
    });
    await PushSubscription.deleteMany({});
    await PushSubscription.create({ userId: sam.user.id, endpoint: 'https://fcm.googleapis.com/fcm/send/sam-phone', keys });
    const s = await connect(sam);
    const live = waitFor(s, 'nudge');
    expect((await alex.post('/api/nudge')).status).toBe(204);
    expect((await live).from).toBe(alex.user.id);
    await delay(100);
    expect(pushes[0]).toMatchObject({ type: 'nudge', title: alex.user.name, body: 'is thinking of you ❤️' });
    expect((await alex.post('/api/nudge')).body.error.code).toBe('TOO_FAST');
  });
});

describe('days together & countdowns', () => {
  it('either person sets the start date and dates; the other sees changes live', async () => {
    expect((await sam.get('/api/together')).body.together).toEqual({ since: null, events: [] });
    const s = await connect(sam);
    const live = waitFor(s, 'together:updated');
    expect((await alex.put('/api/together/since').send({ since: '2025-02-14' })).body.together.since).toBe('2025-02-14');
    expect((await live).since).toBe('2025-02-14');

    const added = await sam.post('/api/together/events').send({ title: "Anishka's birthday", date: '2001-08-05', kind: 'birthday', yearly: true });
    expect(added.status).toBe(201);
    const event = added.body.together.events[0];
    expect(event).toMatchObject({ title: "Anishka's birthday", date: '2001-08-05', kind: 'birthday', yearly: true });
    const edited = await alex.patch(`/api/together/events/${event.id}`).send({ title: 'Birthday 🎂' });
    expect(edited.body.together.events[0].title).toBe('Birthday 🎂');
    expect((await alex.delete(`/api/together/events/${event.id}`)).body.together.events).toEqual([]);
  });

  it('rejects impossible dates and empty titles', async () => {
    expect((await alex.put('/api/together/since').send({ since: '2025-02-30' })).status).toBe(400);
    expect((await alex.post('/api/together/events').send({ title: '', date: '2026-01-01' })).status).toBe(400);
    expect((await alex.post('/api/together/events').send({ title: 'x', date: '01/01/2026' })).status).toBe(400);
  });

  it('works out the next occurrence and what to remind about', () => {
    expect(nextOccurrence({ date: '2001-08-05', yearly: true }, '2026-10-11')).toBe('2027-08-05');
    expect(nextOccurrence({ date: '2001-12-25', yearly: true }, '2026-10-11')).toBe('2026-12-25');
    expect(nextOccurrence({ date: '2000-02-29', yearly: true }, '2027-01-01')).toBe('2027-02-28'); // not a leap year
    expect(nextOccurrence({ date: '2026-11-01', yearly: false }, '2026-10-11')).toBe('2026-11-01');

    const together = {
      since: '2025-07-03',
      events: [
        { title: 'Birthday', date: '2001-10-12', kind: 'birthday', yearly: true },
        { title: 'Goa trip', date: '2026-10-11', kind: 'meetup', yearly: false },
      ],
    };
    const titles = remindersFor(together, '2026-10-11').map((r) => r.title);
    expect(titles).toContain('🎂 Tomorrow: Birthday');
    expect(titles).toContain('✈️ Today: Goa trip');
    expect(titles.some((t) => t.includes('days together'))).toBe(false);
    expect(remindersFor({ since: '2026-07-03' }, '2026-10-11').map((r) => r.title)).toEqual(['🎉 100 days together today!']);
    expect(remindersFor({ since: '2024-10-11' }, '2026-10-11').map((r) => r.title)).toEqual(['💞 2 years together today!']);
  });

  it('sends the day’s reminders once, only after 9 AM', async () => {
    const pushes = [];
    setPushSender(async (sub, body) => {
      pushes.push(JSON.parse(body));
      return { statusCode: 201 };
    });
    await PushSubscription.deleteMany({});
    await PushSubscription.create({ userId: alex.user.id, endpoint: 'https://fcm.googleapis.com/fcm/send/alex-phone', keys });
    await Conversation.updateOne({}, { $set: { together: { since: null, events: [{ title: 'Date night', date: '2026-10-12', kind: 'other', yearly: false }], lastReminderDay: null } } });

    const early = new Date('2026-10-11T02:00:00Z'); // 07:30 in India
    expect(await sendDueReminders(early)).toBe(0);
    const later = new Date('2026-10-11T05:00:00Z'); // 10:30 in India
    expect(await sendDueReminders(later)).toBe(1);
    expect(pushes.map((p) => p.title)).toEqual(['📅 Tomorrow: Date night']);
    expect(await sendDueReminders(new Date('2026-10-11T10:00:00Z'))).toBe(0); // already sent today
  });
});

describe('shared lists', () => {
  it('create, add, tick (who ticked), edit, remove — live for both', async () => {
    const s = await connect(sam);
    const created = await alex.post('/api/lists').send({ name: 'Movies to watch', emoji: '🎬' });
    expect(created.status).toBe(201);
    const { list } = created.body;
    expect(list).toMatchObject({ name: 'Movies to watch', emoji: '🎬', items: [] });

    const live = waitFor(s, 'list:updated');
    const added = (await sam.post(`/api/lists/${list.id}/items`).send({ text: '  Interstellar  ' })).body.list;
    expect(added.items[0]).toMatchObject({ text: 'Interstellar', done: false, addedBy: sam.user.id });
    expect((await live).items).toHaveLength(1);

    const item = added.items[0];
    const ticked = (await alex.patch(`/api/lists/${list.id}/items/${item.id}`).send({ done: true })).body.list.items[0];
    expect(ticked).toMatchObject({ done: true, doneBy: alex.user.id });
    expect(ticked.doneAt).toBeTruthy();
    const unticked = (await sam.patch(`/api/lists/${list.id}/items/${item.id}`).send({ done: false })).body.list.items[0];
    expect(unticked).toMatchObject({ done: false, doneBy: null });
    expect((await sam.patch(`/api/lists/${list.id}`).send({ name: 'Films 🍿' })).body.list.name).toBe('Films 🍿');
    expect((await alex.delete(`/api/lists/${list.id}/items/${item.id}`)).body.list.items).toEqual([]);

    const removed = waitFor(s, 'list:removed');
    expect((await alex.delete(`/api/lists/${list.id}`)).status).toBe(204);
    expect((await removed).id).toBe(list.id);
    expect((await sam.get('/api/lists')).body.lists).toEqual([]);
  });

  it('validates input', async () => {
    expect((await alex.post('/api/lists').send({ name: '   ' })).status).toBe(400);
    const { list } = (await alex.post('/api/lists').send({ name: 'Ideas' })).body;
    expect((await alex.post(`/api/lists/${list.id}/items`).send({ text: '' })).status).toBe(400);
    expect((await alex.post(`/api/lists/${list.id}/items`).send({ text: 'x'.repeat(201) })).status).toBe(400);
    expect((await alex.patch(`/api/lists/${list.id}/items/64b000000000000000000001`).send({ done: true })).body.error.code).toBe('ITEM_NOT_FOUND');
  });
});
