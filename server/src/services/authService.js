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

  if (user.failedLoginAttempts || user.lockUntil) {
    await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockUntil: null } });
  }
  return { user, token: signToken(user) };
}

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion ?? 0 }, config.jwt.secret, {
    ...JWT_OPTIONS,
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Turns a raw token into the request's private-room context. Every check is
 * server-side: valid signature, unrevoked, allow-listed, and a participant
 * of the single conversation.
 */
export async function resolveSession(token) {
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, { ...JWT_OPTIONS, algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw unauthorized('Your session expired. Please sign in again.', 'SESSION_EXPIRED');
    throw unauthorized('Your session is invalid. Please sign in again.', 'INVALID_SESSION');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || user.tokenVersion !== payload.tv) {
    throw unauthorized('Your session is no longer valid. Please sign in again.', 'INVALID_SESSION');
  }
  if (!isAuthorizedEmail(user.email)) throw forbidden('This account is not authorized.', 'NOT_AUTHORIZED');

  const conversation = await getPrimaryConversation();
  if (!isParticipant(conversation, user._id)) throw forbidden('This account is not authorized.', 'NOT_AUTHORIZED');

  return { user, conversation, peerId: peerIdOf(conversation, user._id), expiresAt: payload.exp * 1000 };
}

export async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}
