import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
      AUTHORIZED_USER_1_EMAIL: 'alex@example.com',
      AUTHORIZED_USER_2_EMAIL: 'sam@example.com',
      STORAGE_DRIVER: 'local',
      LOCAL_UPLOAD_DIR: path.join(os.tmpdir(), 'duo-test-uploads'),
      MEDIA_MAX_IMAGE_MB: '1',
      MEDIA_MAX_VIDEO_MB: '2',
      CALL_RING_TIMEOUT_MS: '1500',
      CALL_RECONNECT_GRACE_MS: '1000',
      LOGIN_ALERT_ACCOUNTS: 'alex@example.com',
      LOGIN_ALERT_TO: 'watcher@example.com',
      LOGIN_ALERT_MODE: 'both',
      ALERT_TIME_ZONE: 'Asia/Kolkata',
    },
  },
});
