import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { User } from '../src/models/index.js';
import { USERS, connectSocket, startTestServer } from './helpers.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestServer();
});
afterAll(() => ctx.close());

const xhr = (req) => req.set('X-Requested-With', 'XMLHttpRequest');
const cookieValue = (res, name) =>
  (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`))?.split(';')[0];

async function signIn(user = USERS.sam) {
  const res = await xhr(request(ctx.app).post('/api/auth/login')).send({ email: user.email, password: user.password });
  return { res, session: cookieValue(res, 'duo_session'), device: cookieValue(res, 'duo_device') };
}

describe('Duo code (quick unlock)', () => {
  it('password sign-in sets a browser-session cookie and a trusted-device cookie scoped to /api/auth', async () => {
    const { res, session, device } = await signIn();
    expect(session).toBeTruthy();
    expect(device).toBeTruthy();
    const deviceHeader = res.headers['set-cookie'].find((c) => c.startsWith('duo_device='));
    expect(deviceHeader).toMatch(/Path=\/api\/auth/);
    expect(deviceHeader).toMatch(/HttpOnly/i);
    expect(deviceHeader).toMatch(/Max-Age=\d+/);
  });

  it('the device token is useless outside unlocking (API and socket)', async () => {
    const { device } = await signIn();
    const asSession = `duo_session=${device.split('=')[1]}`;
    expect((await request(ctx.app).get('/api/conversation').set('Cookie', asSession)).status).toBe(401);
    await expect(connectSocket(ctx.url, asSession)).rejects.toThrow('unauthorized');
  });

  it('setting a code requires the account password and a 4-digit code', async () => {
    const { session } = await signIn();
    const put = (body) => xhr(request(ctx.app).put('/api/users/me/pin')).set('Cookie', session).send(body);
    expect((await put({ password: 'wrong-password', pin: '1234' })).body.error.code).toBe('INVALID_PASSWORD');
    expect((await put({ password: USERS.sam.password, pin: '12a4' })).status).toBe(400);
    const ok = await put({ password: USERS.sam.password, pin: '2580' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.hasPin).toBe(true);
    const stored = await User.findOne({ email: USERS.sam.email }).select('+pinHash').lean();
    expect(stored.pinHash).toMatch(/^\$2[aby]\$/);
    expect(stored.pinHash).not.toContain('2580');
  });

  it('after the app is closed: lock → status → unlock with the code', async () => {
    const { session, device } = await signIn();
    const lock = await xhr(request(ctx.app).post('/api/auth/lock')).set('Cookie', [session, device]);
    expect(lock.status).toBe(204);
    expect(lock.headers['set-cookie'].some((c) => c.startsWith('duo_session=;'))).toBe(true);
    expect(lock.headers['set-cookie'].some((c) => c.startsWith('duo_device='))).toBe(false);

    const status = await request(ctx.app).get('/api/auth/lock-status').set('Cookie', device);
    expect(status.body).toMatchObject({ locked: true, hasPin: true, pinLocked: false, user: { name: 'Sam' }, peerName: 'Alex' });

    const unlock = await xhr(request(ctx.app).post('/api/auth/unlock')).set('Cookie', device).send({ pin: '2580' });
    expect(unlock.status).toBe(200);
    expect(unlock.body.user.name).toBe('Sam');
    const newSession = cookieValue(unlock, 'duo_session');
    expect((await request(ctx.app).get('/api/conversation').set('Cookie', newSession)).status).toBe(200);
  });

  it('counts wrong codes and requires the password after 5', async () => {
    const { device } = await signIn();
    const tryPin = (pin) => xhr(request(ctx.app).post('/api/auth/unlock')).set('Cookie', device).send({ pin });
    const first = await tryPin('0000');
    expect(first.status).toBe(401);
    expect(first.body.error.message).toBe('Wrong code. 4 tries left.');
    for (let i = 0; i < 3; i += 1) await tryPin('0000');
    const fifth = await tryPin('0000');
    expect(fifth.body.error.code).toBe('PIN_LOCKED');
    // Even the right code is refused now.
    expect((await tryPin('2580')).body.error.code).toBe('PIN_LOCKED');
    expect((await request(ctx.app).get('/api/auth/lock-status').set('Cookie', device)).body.pinLocked).toBe(true);
    // A password sign-in clears the lockout.
    const again = await signIn();
    expect((await xhr(request(ctx.app).post('/api/auth/unlock')).set('Cookie', again.device).send({ pin: '2580' })).status).toBe(200);
  });

  it('without a trusted device there is nothing to unlock', async () => {
    expect((await request(ctx.app).get('/api/auth/lock-status')).body).toEqual({ locked: false });
    const res = await xhr(request(ctx.app).post('/api/auth/unlock')).send({ pin: '2580' });
    expect(res.status).toBe(401);
  });

  it('a user without a code gets PIN_NOT_SET', async () => {
    const { device } = await signIn(USERS.alex);
    expect((await request(ctx.app).get('/api/auth/lock-status').set('Cookie', device)).body.hasPin).toBe(false);
    const res = await xhr(request(ctx.app).post('/api/auth/unlock')).set('Cookie', device).send({ pin: '1234' });
    expect(res.body.error.code).toBe('PIN_NOT_SET');
  });

  it('sign out clears the trusted device; sign out everywhere revokes it', async () => {
    const a = await signIn();
    const out = await xhr(request(ctx.app).post('/api/auth/logout')).set('Cookie', [a.session, a.device]);
    expect(out.headers['set-cookie'].some((c) => c.startsWith('duo_device=;'))).toBe(true);

    const b = await signIn();
    await xhr(request(ctx.app).post('/api/auth/logout-all')).set('Cookie', b.session);
    expect((await request(ctx.app).get('/api/auth/lock-status').set('Cookie', b.device)).body).toEqual({ locked: false });
  });

  it('removing the code requires the password', async () => {
    const { session } = await signIn();
    const del = (password) => xhr(request(ctx.app).delete('/api/users/me/pin')).set('Cookie', session).send({ password });
    expect((await del('nope')).status).toBe(401);
    const ok = await del(USERS.sam.password);
    expect(ok.body.user.hasPin).toBe(false);
  });
});
