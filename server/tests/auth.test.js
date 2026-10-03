import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/index.js';
import { USERS, loginAs, startTestServer } from './helpers.js';

let ctx;
beforeAll(async () => {
  ctx = await startTestServer();
});
afterAll(() => ctx.close());

const post = (path) => request(ctx.app).post(path).set('X-Requested-With', 'XMLHttpRequest');

describe('authentication', () => {
  it('logs in with valid credentials and sets an HTTP-only cookie', async () => {
    const res = await post('/api/auth/login').send({ email: USERS.alex.email, password: USERS.alex.password });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Alex', email: USERS.alex.email });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^duo_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('accepts emails case-insensitively', async () => {
    const res = await post('/api/auth/login').send({ email: '  ALEX@Example.com ', password: USERS.alex.password });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await post('/api/auth/login').send({ email: USERS.sam.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects unknown emails with the same message', async () => {
    const res = await post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates the login payload and blocks operator injection', async () => {
    const res = await post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });

  it('stores only bcrypt hashes', async () => {
    const user = await User.findOne({ email: USERS.alex.email }).select('+passwordHash').lean();
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.passwordHash).not.toContain(USERS.alex.password);
  });

  it('returns the current user from /me and rejects anonymous requests', async () => {
    const agent = await loginAs(ctx.app, USERS.alex);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(USERS.alex.email);

    const anonymous = await request(ctx.app).get('/api/auth/me');
    expect(anonymous.status).toBe(401);
    const protectedRoute = await request(ctx.app).get('/api/messages');
    expect(protectedRoute.status).toBe(401);
  });

  it('rejects tampered and expired tokens', async () => {
    const tampered = await request(ctx.app).get('/api/conversation').set('Cookie', 'duo_session=not.a.jwt');
    expect(tampered.status).toBe(401);
    expect(tampered.body.error.code).toBe('INVALID_SESSION');

    const user = await User.findOne({ email: USERS.alex.email });
    const expired = jwt.sign({ sub: String(user._id), tv: 0 }, process.env.JWT_SECRET, {
      issuer: 'duo', audience: 'duo-client', expiresIn: -10,
    });
    const res = await request(ctx.app).get('/api/conversation').set('Cookie', `duo_session=${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');

    const wrongSecret = jwt.sign({ sub: String(user._id), tv: 0 }, 'some-other-secret-value-that-is-long', { issuer: 'duo', audience: 'duo-client' });
    const forged = await request(ctx.app).get('/api/conversation').set('Cookie', `duo_session=${wrongSecret}`);
    expect(forged.status).toBe(401);
  });

  it('requires the CSRF header for state-changing requests', async () => {
    const agent = await loginAs(ctx.app, USERS.alex);
    const res = await request(ctx.app).post('/api/messages').set('Cookie', agent.cookie).send({ text: 'hi' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');

    const foreignOrigin = await agent.post('/api/messages').set('Origin', 'https://evil.example').send({ text: 'hi' });
    expect(foreignOrigin.status).toBe(403);
  });

  it('logout-all revokes previously issued tokens', async () => {
    const agent = await loginAs(ctx.app, USERS.sam);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent.post('/api/auth/logout-all')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    // A fresh login still works.
    expect((await (await loginAs(ctx.app, USERS.sam)).get('/api/auth/me')).status).toBe(200);
  });

  it('locks an account after repeated failures', async () => {
    for (let i = 0; i < 5; i += 1) {
      await post('/api/auth/login').send({ email: USERS.sam.email, password: `bad-${i}` });
    }
    const locked = await post('/api/auth/login').send({ email: USERS.sam.email, password: USERS.sam.password });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    await User.updateOne({ email: USERS.sam.email }, { $set: { lockUntil: null } });
  });

  it('has no signup endpoint', async () => {
    const body = { email: 'new@example.com', password: 'password-123' };
    // Anonymous callers cannot even probe which routes exist.
    expect((await post('/api/auth/register').send(body)).status).toBe(401);
    const agent = await loginAs(ctx.app, USERS.alex);
    expect((await agent.post('/api/auth/register').send(body)).status).toBe(404);
    expect((await agent.post('/api/users').send(body)).status).toBe(404);
    expect(await User.countDocuments()).toBe(2);
  });
});
