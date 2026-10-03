import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/index.js';
import { AppError, unauthorized, forbidden } from '../utils/AppError.js';
import { getPrimaryConversation, isParticipant, peerIdOf } from './conversationService.js';

export const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const JWT_OPTIONS = { issuer: 'duo', audience: 'duo-client' };
// Device tokens use their own audience, so they can never pass as a session.
const DEVICE_JWT_OPTIONS = { issuer: 'duo', audience: 'duo-device' };
const MAX_PIN_ATTEMPTS = 5;
const PIN_ROUNDS = 10;

let dummyHash;
// Compare against a throwaway hash for unknown emails so response timing
// does not reveal whether an account exists.
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS));

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);
export const isAuthorizedEmail = (email) => config.authorizedEmails.includes(String(email).toLowerCase());

const invalidCredentials = () => unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');

export async function authenticate(email, password) {
  const user = await User.findOne({ email }).select('+passwordHash +failedLoginAttempts +lockUntil +tokenVersion');
  if (!user || !isAuthorizedEmail(user.email)) {
    await bcrypt.compare(password, getDummyHash());
    throw invalidCredentials();
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new AppError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const update = attempts >= MAX_FAILED_ATTEMPTS
      ? { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_DURATION_MS) }
      : { failedLoginAttempts: attempts };
    await User.updateOne({ _id: user._id }, { $set: update });
    throw invalidCredentials();
  }

  const conversation = await getPrimaryConversation();
  if (!isParticipant(conversation, user._id)) throw invalidCredentials();

  // A password sign-in also clears any Duo-code lockout.
  await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockUntil: null, pinFailedAttempts: 0 } });
  return { user, token: signToken(user), deviceToken: signDeviceToken(user) };
}

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion ?? 0 }, config.jwt.secret, {
    ...JWT_OPTIONS,
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

export function signDeviceToken(user) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion ?? 0 }, config.jwt.secret, {
    ...DEVICE_JWT_OPTIONS,
    algorithm: 'HS256',
    expiresIn: config.jwt.deviceExpiresIn,
  });
}

/**
 * Turns a raw token into the request's private-room context. Every check is
 * server-side: valid signature, unrevoked, allow-listed, and a participant
 * of the single conversation.
 */
export async function resolveSession(token, { device = false, select = '' } = {}) {
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, { ...(device ? DEVICE_JWT_OPTIONS : JWT_OPTIONS), algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw unauthorized('Your session expired. Please sign in again.', 'SESSION_EXPIRED');
    throw unauthorized('Your session is invalid. Please sign in again.', 'INVALID_SESSION');
  }

  const user = await User.findById(payload.sub).select(`+tokenVersion ${select}`.trim());
  if (!user || user.tokenVersion !== payload.tv) {
    throw unauthorized('Your session is no longer valid. Please sign in again.', 'INVALID_SESSION');
  }
  if (!isAuthorizedEmail(user.email)) throw forbidden('This account is not authorized.', 'NOT_AUTHORIZED');

  const conversation = await getPrimaryConversation();
  if (!isParticipant(conversation, user._id)) throw forbidden('This account is not authorized.', 'NOT_AUTHORIZED');

  return { user, conversation, peerId: peerIdOf(conversation, user._id), expiresAt: payload.exp * 1000 };
}

/** Trusted device + correct Duo code → a fresh session. */
export async function unlockWithPin(deviceToken, pin) {
  const { user } = await resolveSession(deviceToken, { device: true, select: '+pinHash +pinFailedAttempts' });
  if (!user.pinHash) throw new AppError(400, 'PIN_NOT_SET', 'No Duo code is set. Sign in with your password.');
  if (user.pinFailedAttempts >= MAX_PIN_ATTEMPTS) {
    throw new AppError(429, 'PIN_LOCKED', 'Too many wrong codes. Sign in with your password.');
  }
  if (!(await bcrypt.compare(pin, user.pinHash))) {
    const attempts = user.pinFailedAttempts + 1;
    await User.updateOne({ _id: user._id }, { $set: { pinFailedAttempts: attempts } });
    const left = MAX_PIN_ATTEMPTS - attempts;
    if (left <= 0) throw new AppError(429, 'PIN_LOCKED', 'Too many wrong codes. Sign in with your password.');
    throw new AppError(401, 'WRONG_PIN', `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
  }
  if (user.pinFailedAttempts) await User.updateOne({ _id: user._id }, { $set: { pinFailedAttempts: 0 } });
  return { user, token: signToken(user), deviceToken: signDeviceToken(user) };
}

async function verifyPassword(userId, password) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_PASSWORD', 'Incorrect password.');
  }
  return user;
}

/** Setting or removing the Duo code always requires the account password. */
export async function setPin(userId, password, pin) {
  await verifyPassword(userId, password);
  return User.findByIdAndUpdate(
    userId,
    { $set: { pinHash: await bcrypt.hash(pin, PIN_ROUNDS), pinFailedAttempts: 0, hasPin: true } },
    { returnDocument: 'after' },
  );
}

export async function removePin(userId, password) {
  await verifyPassword(userId, password);
  return User.findByIdAndUpdate(userId, { $set: { pinHash: null, pinFailedAttempts: 0, hasPin: false } }, { returnDocument: 'after' });
}

export async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}
