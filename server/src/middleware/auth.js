import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { resolveSession } from '../services/authService.js';

export const SESSION_COOKIE = 'duo_session';
// Long-lived "this device is trusted" cookie. Scoped to /api/auth so it is only
// ever sent to the sign-in endpoints (lock status / unlock), never elsewhere.
export const DEVICE_COOKIE = 'duo_device';
const DEVICE_COOKIE_PATH = '/api/auth';

function cookieOptions() {
  const sameSite = config.cookieSameSite;
  return {
    httpOnly: true,
    secure: config.isProd || sameSite === 'none',
    sameSite,
    path: '/',
  };
}

/**
 * Browser-session cookie (no Max-Age/Expires): it disappears when the browser
 * closes, so reopening the app requires unlocking again. The JWT inside still
 * expires after JWT_EXPIRES_IN as an upper bound.
 */
export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export function setDeviceCookie(res, token) {
  const maxAge = Math.max(0, jwt.decode(token).exp * 1000 - Date.now());
  res.cookie(DEVICE_COOKIE, token, { ...cookieOptions(), path: DEVICE_COOKIE_PATH, maxAge });
}

export function clearDeviceCookie(res) {
  res.clearCookie(DEVICE_COOKIE, { ...cookieOptions(), path: DEVICE_COOKIE_PATH });
}

/** Attaches `req.session = { user, conversation, peerId }` or rejects. */
export async function requireAuth(req, res, next) {
  try {
    req.session = await resolveSession(req.cookies?.[SESSION_COOKIE]);
    next();
  } catch (err) {
    if (err.status === 401) clearSessionCookie(res);
    next(err);
  }
}
