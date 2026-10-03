import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { User } from '../src/models/index.js';
import { setEmailTransport } from '../src/services/emailService.js';
import { buildAlertEmail, describeDevice, resetLoginAlertState } from '../src/services/loginAlertService.js';
import { USERS, connectSocket, delay, loginAs, startTestServer } from './helpers.js';

const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

let ctx;
let sent;
const open = [];

beforeAll(async () => {
  ctx = await startTestServer();
});
beforeEach(() => {
  sent = [];
  setEmailTransport({ sendMail: async (mail) => sent.push(mail) });
  resetLoginAlertState();
});
afterEach(() => {
  open.splice(0).forEach((s) => s.close());
  setEmailTransport(null);
});
afterAll(() => ctx.close());

const signIn = (user) =>
  request(ctx.app)
    .post('/api/auth/login')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('User-Agent', WINDOWS_CHROME)
    .send({ email: user.email, password: user.password });

describe('login alert emails', () => {
  it('emails the configured address when the watched account signs in', async () => {
    expect((await signIn(USERS.alex)).status).toBe(200);
    await delay(50);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('watcher@example.com');
    expect(sent[0].subject).toBe('Alex signed in to Duo');
    expect(sent[0].text).toContain('Chrome on Windows');
    expect(sent[0].text).toMatch(/IST|GMT\+5:30/);
  });

  it('does not email for accounts that are not watched', async () => {
    await signIn(USERS.sam);
    await delay(50);
    expect(sent).toHaveLength(0);
  });

  it('does not send a second email for the connection right after sign-in', async () => {
    const res = await signIn(USERS.alex);
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    open.push(await connectSocket(ctx.url, cookie));
    await delay(150);
    expect(sent).toHaveLength(1);
  });

  it('emails when the account opens the app after being away, once', async () => {
    const alex = await loginAs(ctx.app, USERS.alex);
    resetLoginAlertState();
    sent = [];
    await User.updateOne({ email: USERS.alex.email }, { $set: { lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000) } });

    open.push(await connectSocket(ctx.url, alex.cookie));
    await delay(150);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Alex opened Duo');

    // A quick reconnect or a second tab doesn't email again.
    open.splice(0).forEach((s) => s.close());
    await delay(150);
    open.push(await connectSocket(ctx.url, alex.cookie));
    await delay(150);
    expect(sent).toHaveLength(1);
  });

  it('still signs in normally when email is not configured', async () => {
    setEmailTransport(null);
    expect((await signIn(USERS.alex)).status).toBe(200);
  });

  it('escapes names in the HTML email and describes devices', () => {
    const { html } = buildAlertEmail({ name: '<b>x</b>', event: 'signin', at: new Date(), device: 'Safari on iPhone' });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36')).toBe('Chrome on Android');
  });
});
