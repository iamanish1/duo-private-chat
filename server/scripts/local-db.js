/**
 * Runs a real, persistent MongoDB for local development without installing
 * MongoDB yourself (downloads the official binary on first run).
 *   npm run db:local   → mongodb://127.0.0.1:27017/duo, data in server/.data/db
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.env.LOCAL_DB_PORT || 27017);

// On Windows a second mongod can bind the same port without an error, so
// connections silently go to whichever answers. Refuse instead.
const inUse = await new Promise((resolve) => {
  const probe = net.connect(port, '127.0.0.1');
  probe.once('connect', () => probe.end(() => resolve(true)));
  probe.once('error', () => resolve(false));
});
if (inUse) {
  console.log(`Something (probably MongoDB) is already listening on 127.0.0.1:${port}.`);
  console.log(`Use it directly with MONGODB_URI=mongodb://127.0.0.1:${port}/duo, or run this on another port: LOCAL_DB_PORT=27018 npm run db:local`);
  process.exit(0);
}

const dbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/db');
fs.mkdirSync(dbPath, { recursive: true });
const server = await MongoMemoryServer.create({
  instance: { port, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' },
});

console.log(`MongoDB running at ${server.getUri()}duo`);
console.log(`Data directory: ${dbPath}`);
console.log('Press Ctrl+C to stop.');

const stop = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
