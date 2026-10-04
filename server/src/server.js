import http from 'node:http';
import { assertRuntimeConfig, config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { createSocketServer } from './sockets/index.js';
import { User } from './models/index.js';
import { closeStaleCalls } from './services/callService.js';
import { sweepExpiredStatuses } from './services/statusService.js';
import { logger } from './utils/logger.js';

async function start() {
  assertRuntimeConfig();
  await connectDatabase(config.mongoUri);

  // Nobody is connected to a freshly started process.
  await User.updateMany({ isOnline: true }, { $set: { isOnline: false, lastSeen: new Date() } });
  await closeStaleCalls();

  // Statuses last 24 hours; clear out expired ones (and their files) hourly.
  const sweep = () => sweepExpiredStatuses().catch((err) => logger.warn('Status sweep failed', { message: err.message }));
  sweep();
  setInterval(sweep, 60 * 60 * 1000).unref();

  const server = http.createServer(createApp());
  const io = createSocketServer(server);

  server.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port} (${config.env}, storage: ${config.storage.driver}, push: ${config.push.enabled ? 'on' : 'off'})`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    io.close();
    server.close();
    await disconnectDatabase().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
