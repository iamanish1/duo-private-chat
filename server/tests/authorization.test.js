import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Conversation, User } from '../src/models/index.js';
import { hashPassword, signToken } from '../src/services/authService.js';
import { seedAuthorizedUsers } from '../scripts/seedLib.js';
import { USERS, connectSocket, loginAs, startTestServer } from './helpers.js';

let ctx;
let intruder;
const INTRUDER = { email: 'mallory@example.com', name: 'Mallory', password: 'mallory-password-1' };

beforeAll(async () => {
  ctx = await startTestServer();
  // Simulate a third account that somehow got into the database.
  intruder = await User.create({ email: INTRUDER.email, name: INTRUDER.name, passwordHash: await hashPassword(INTRUDER.password) });
});
afterAll(() => ctx.close());

describe('two-person restriction', () => {
  it('lets both authorized people load the private conversation', async () => {
    const alex = await loginAs(ctx.app, USERS.alex);
    const res = await alex.get('/api/conversation');
    expect(res.status).toBe(200);
    expect(res.body.peer.name).toBe('Sam');
    expect(res.body.peer.email).toBeUndefined();
  });

  it('refuses login for a third account even with the right password', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: INTRUDER.email, password: INTRUDER.password });
    expect(res.status).toBe(401);
  });

  it('refuses a validly signed token for a third account on every API', async () => {
    const cookie = `duo_session=${signToken(intruder)}`;
    for (const path of ['/api/conversation', '/api/messages', '/api/messages/media', '/api/calls', '/api/calls/ice-servers']) {
      const res = await request(ctx.app).get(path).set('Cookie', cookie);
      expect(res.status, path).toBe(403);
    }
    const send = await request(ctx.app)
      .post('/api/messages')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ text: 'let me in' });
    expect(send.status).toBe(403);
  });

  it('refuses a third account on Socket.IO', async () => {
    await expect(connectSocket(ctx.url, `duo_session=${signToken(intruder)}`)).rejects.toThrow('unauthorized');
    await expect(connectSocket(ctx.url)).rejects.toThrow('unauthorized');
  });

  it('allows only one conversation in the database', async () => {
    const users = await User.find({ email: { $in: [USERS.alex.email, USERS.sam.email] } });
    await expect(Conversation.create({ participants: users.map((u) => u._id) })).rejects.toThrow(/duplicate key/);
    await expect(Conversation.create({ participants: [users[0]._id, intruder._id], singleton: 'other' })).rejects.toThrow();
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it('seed refuses to run while unknown users exist', async () => {
    await expect(seedAuthorizedUsers([USERS.alex, USERS.sam])).rejects.toThrow(/not listed/);
    await User.deleteOne({ _id: intruder._id });
    const again = await seedAuthorizedUsers([USERS.alex, USERS.sam]);
    expect(again.log.join(' ')).toMatch(/already exists/);
    expect(await User.countDocuments()).toBe(2);
    expect(await Conversation.countDocuments()).toBe(1);
  });
});
