import { authenticate, revokeAllSessions } from '../services/authService.js';
import { selfUser } from '../services/serializers.js';
import { clearSessionCookie, setSessionCookie } from '../middleware/auth.js';
import { disconnectUser, emitToUser } from '../sockets/realtime.js';
import { alertOnSignIn } from '../services/loginAlertService.js';

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const { user, token } = await authenticate(email, password);
  setSessionCookie(res, token);
  alertOnSignIn(user, { userAgent: req.get('user-agent'), ip: req.ip });
  res.json({ user: selfUser(user) });
}

export function logout(req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: selfUser(req.session.user) });
}

/** Invalidates every token for this user and drops their live sockets. */
export async function logoutEverywhere(req, res) {
  const userId = req.session.user._id;
  await revokeAllSessions(userId);
  emitToUser(userId, 'session:revoked', {});
  disconnectUser(userId);
  clearSessionCookie(res);
  res.status(204).end();
}
