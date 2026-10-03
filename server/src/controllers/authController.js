import { User } from '../models/index.js';
import { authenticate, resolveSession, revokeAllSessions, unlockWithPin } from '../services/authService.js';
import { avatarUrl, selfUser } from '../services/serializers.js';
import {
  DEVICE_COOKIE,
  clearDeviceCookie,
  clearSessionCookie,
  setDeviceCookie,
  setSessionCookie,
} from '../middleware/auth.js';
import { disconnectUser, emitToUser } from '../sockets/realtime.js';
import { alertOnSignIn } from '../services/loginAlertService.js';

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const { user, token, deviceToken } = await authenticate(email, password);
  setSessionCookie(res, token);
  setDeviceCookie(res, deviceToken);
  alertOnSignIn(user, { userAgent: req.get('user-agent'), ip: req.ip });
  res.json({ user: selfUser(user) });
}

/** Full sign-out: this device is no longer trusted for the Duo code. */
export function logout(req, res) {
  clearSessionCookie(res);
  clearDeviceCookie(res);
  res.status(204).end();
}

/** App was closed and reopened: end the session but keep the device trusted. */
export function lock(req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}

/**
 * Whether this device can be unlocked with the Duo code. Always 200 so the
 * client can ask without triggering "session lost" handling.
 */
export async function lockStatus(req, res) {
  const token = req.cookies?.[DEVICE_COOKIE];
  if (!token) return res.json({ locked: false });
  try {
    const { user, peerId } = await resolveSession(token, { device: true, select: '+pinFailedAttempts' });
    const peer = await User.findById(peerId).select('name').lean();
    res.json({
      locked: true,
      hasPin: Boolean(user.hasPin),
      pinLocked: user.pinFailedAttempts >= 5,
      user: { name: user.name, avatarUrl: avatarUrl(user) },
      // Lets the lock screen say "Anishka is calling" when opened from a call.
      peerName: peer?.name ?? null,
    });
  } catch {
    clearDeviceCookie(res);
    res.json({ locked: false });
  }
}

export async function unlock(req, res) {
  const { user, token, deviceToken } = await unlockWithPin(req.cookies?.[DEVICE_COOKIE], req.valid.body.pin);
  setSessionCookie(res, token);
  setDeviceCookie(res, deviceToken); // sliding: stays trusted while in use
  res.json({ user: selfUser(user) });
}

export function me(req, res) {
  res.json({ user: selfUser(req.session.user) });
}

/** Invalidates every token (sessions and trusted devices) and drops live sockets. */
export async function logoutEverywhere(req, res) {
  const userId = req.session.user._id;
  await revokeAllSessions(userId);
  emitToUser(userId, 'session:revoked', {});
  disconnectUser(userId);
  clearSessionCookie(res);
  clearDeviceCookie(res);
  res.status(204).end();
}
