import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '../..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

// Tests configure process.env themselves; everything else reads the repo-root .env.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
}

const emptyToUndefined = (value) => (value === '' ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());
const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().trim().toLowerCase().pipe(z.email()).optional(),
);
const intWithDefault = (fallback) => z.preprocess(emptyToUndefined, z.coerce.number().int().nonnegative().default(fallback));
const csv = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: intWithDefault(5000),
  MONGODB_URI: optionalString,
  JWT_SECRET: optionalString,
  JWT_EXPIRES_IN: z.preprocess(emptyToUndefined, z.string().default('7d')),
  CLIENT_URL: optionalString,
  COOKIE_SAME_SITE: z.preprocess(emptyToUndefined, z.enum(['lax', 'strict', 'none']).optional()),
  TRUST_PROXY: intWithDefault(0),
  SERVE_CLIENT: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),

  AUTHORIZED_USER_1_EMAIL: optionalEmail,
  AUTHORIZED_USER_2_EMAIL: optionalEmail,

  STORAGE_DRIVER: z.preprocess(emptyToUndefined, z.enum(['cloudinary', 'local']).optional()),
  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  CLOUDINARY_FOLDER: z.preprocess(emptyToUndefined, z.string().default('duo')),
  LOCAL_UPLOAD_DIR: optionalString,

  MEDIA_MAX_IMAGE_MB: intWithDefault(15),
  MEDIA_MAX_VIDEO_MB: intWithDefault(100),
  MEDIA_MAX_VIDEO_SECONDS: intWithDefault(300),
  MEDIA_MAX_VOICE_MB: intWithDefault(15),
  MEDIA_MAX_VOICE_SECONDS: intWithDefault(300),

  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: optionalString,

  STUN_URLS: z.preprocess(emptyToUndefined, z.string().default('stun:stun.l.google.com:19302')),
  TURN_SERVER_URL: optionalString,
  TURN_SERVER_USERNAME: optionalString,
  TURN_SERVER_CREDENTIAL: optionalString,
  TURN_SHARED_SECRET: optionalString,

  SMTP_HOST: optionalString,
  SMTP_PORT: intWithDefault(587),
  SMTP_SECURE: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  EMAIL_FROM: optionalString,

  LOGIN_ALERT_ACCOUNTS: optionalString,
  LOGIN_ALERT_TO: optionalString,
  LOGIN_ALERT_MODE: z.preprocess(emptyToUndefined, z.enum(['signin', 'online', 'both']).default('signin')),
  LOGIN_ALERT_ONLINE_GAP_MINUTES: intWithDefault(30),
  ALERT_TIME_ZONE: z.preprocess(emptyToUndefined, z.string().default('UTC')),

  CALL_RING_TIMEOUT_MS: intWithDefault(45_000),
  CALL_RECONNECT_GRACE_MS: intWithDefault(20_000),
});

function buildConfig() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  const hasCloudinary = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  const storageDriver = env.STORAGE_DRIVER || (hasCloudinary ? 'cloudinary' : 'local');
  const clientOrigins = csv(env.CLIENT_URL).map((url) => new URL(url).origin);

  const clientDist = path.join(REPO_ROOT, 'client', 'dist');
  const serveClient = env.SERVE_CLIENT ? env.SERVE_CLIENT === 'true' : isProd && fs.existsSync(clientDist);

  return Object.freeze({
    env: env.NODE_ENV,
    isProd,
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    mongoUri: env.MONGODB_URI,
    jwt: { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN },
    clientOrigins,
    // Cross-site deployments need SameSite=None (HTTPS only); same-origin uses Lax.
    cookieSameSite: env.COOKIE_SAME_SITE || (isProd && clientOrigins.length > 0 && !serveClient ? 'none' : 'lax'),
    trustProxy: env.TRUST_PROXY,
    serveClient,
    clientDist,
    authorizedEmails: [env.AUTHORIZED_USER_1_EMAIL, env.AUTHORIZED_USER_2_EMAIL].filter(Boolean),
    storage: {
      driver: storageDriver,
      cloudinary: {
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        apiSecret: env.CLOUDINARY_API_SECRET,
        folder: env.CLOUDINARY_FOLDER,
      },
      localDir: env.LOCAL_UPLOAD_DIR || path.join(SERVER_ROOT, 'uploads'),
    },
    media: {
      maxImageBytes: env.MEDIA_MAX_IMAGE_MB * 1024 * 1024,
      maxVideoBytes: env.MEDIA_MAX_VIDEO_MB * 1024 * 1024,
      maxVideoSeconds: env.MEDIA_MAX_VIDEO_SECONDS,
      maxVoiceBytes: env.MEDIA_MAX_VOICE_MB * 1024 * 1024,
      maxVoiceSeconds: env.MEDIA_MAX_VOICE_SECONDS,
    },
    push: {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT || 'mailto:admin@localhost',
      enabled: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    },
    webrtc: {
      stunUrls: csv(env.STUN_URLS),
      turnUrls: csv(env.TURN_SERVER_URL),
      turnUsername: env.TURN_SERVER_USERNAME,
      turnCredential: env.TURN_SERVER_CREDENTIAL,
      turnSharedSecret: env.TURN_SHARED_SECRET,
    },
    email: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : env.SMTP_PORT === 465,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.EMAIL_FROM || env.SMTP_USER,
    },
    loginAlerts: {
      accounts: csv(env.LOGIN_ALERT_ACCOUNTS).map((e) => e.toLowerCase()),
      recipients: csv(env.LOGIN_ALERT_TO),
      onSignIn: env.LOGIN_ALERT_MODE !== 'online',
      onOnline: env.LOGIN_ALERT_MODE !== 'signin',
      onlineGapMs: env.LOGIN_ALERT_ONLINE_GAP_MINUTES * 60 * 1000,
      timeZone: env.ALERT_TIME_ZONE,
    },
    calls: {
      ringTimeoutMs: env.CALL_RING_TIMEOUT_MS,
      reconnectGraceMs: env.CALL_RECONNECT_GRACE_MS,
    },
  });
}

export const config = buildConfig();

/** Fail fast on settings the running server cannot work without. */
export function assertRuntimeConfig() {
  const problems = [];
  if (!config.mongoUri) problems.push('MONGODB_URI is required');
  if (!config.jwt.secret || config.jwt.secret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  if (config.authorizedEmails.length !== 2) {
    problems.push('AUTHORIZED_USER_1_EMAIL and AUTHORIZED_USER_2_EMAIL must both be set');
  } else if (config.authorizedEmails[0] === config.authorizedEmails[1]) {
    problems.push('The two authorized emails must be different');
  }
  if (config.storage.driver === 'cloudinary' && !config.storage.cloudinary.apiSecret) {
    problems.push('STORAGE_DRIVER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
  }
  if (problems.length) {
    throw new Error(`Cannot start server:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}
