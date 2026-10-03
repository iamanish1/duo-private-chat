import { config } from '../config/env.js';
import { resolveSession } from '../services/authService.js';

export const SESSION_COOKIE = 'duo_session';

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
 * closes, so reopening the app requires signing in again. The JWT inside still
 * expires after JWT_EXPIRES_IN as an upper bound.
 */
export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
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
