import http from 'node:http';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as ioClient } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { createSocketServer } from '../src/sockets/index.js';
import { seedAuthorizedUsers } from '../scripts/seedLib.js';
import { clearConversationCache } from '../src/services/conversationService.js';
import { resetCallState } from '../src/services/callService.js';
import { resetWatchState } from '../src/services/watchService.js';
import { resetListenState } from '../src/services/listenService.js';

export const USERS = {
  alex: { email: 'alex@example.com', name: 'Alex', password: 'alex-password-123' },
  sam: { email: 'sam@example.com', name: 'Sam', password: 'sam-password-456' },
};

/** Real MongoDB + real HTTP server + real Socket.IO server. */
export async function startTestServer() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await mongoose.connection.syncIndexes();
  clearConversationCache();
  await seedAuthorizedUsers([USERS.alex, USERS.sam]);

  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    app,
    url,
    async close() {
      resetCallState();
      resetWatchState();
      resetListenState();
      io.close();
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}

/** Logs in and returns an agent that carries the session cookie and CSRF header. */
export async function loginAs(app, user) {
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ email: user.email, password: user.password });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status}`);
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  const call = (method, path) => request(app)[method](path).set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest');
  return {
    cookie,
    user: res.body.user,
    get: (path) => call('get', path),
    post: (path) => call('post', path),
    patch: (path) => call('patch', path),
    put: (path) => call('put', path),
    delete: (path) => call('delete', path),
  };
}

export function connectSocket(url, cookie) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      transports: ['websocket'],
      extraHeaders: cookie ? { cookie } : {},
      reconnection: false,
      forceNew: true,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });
}

export function waitFor(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export const emitAck = (socket, event, payload) =>
  new Promise((resolve) => socket.timeout(5000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: err } : res)));

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const clientId = () => `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

// 1×1 PNG
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
