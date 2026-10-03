import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

// Injection defence lives at the edge: request bodies are stripped of
// `$`/dotted keys (middleware/sanitize.js) and every input is parsed by zod
// into primitives before it reaches a query.
mongoose.set('strictQuery', true);

export async function connectDatabase(uri) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info('MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDatabase() {
  mongoose.connection.removeAllListeners('disconnected');
  await mongoose.disconnect();
}
