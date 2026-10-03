import { config } from '../config/env.js';
import { Call, User } from '../models/index.js';
import { AppError, conflict, forbidden, notFound } from '../utils/AppError.js';
import { sameId, toObjectId } from '../utils/ids.js';
import { logger } from '../utils/logger.js';
import { emitToConversation, emitToSocket, emitToUser, onScreenPushEndpoints } from '../sockets/realtime.js';
import { publicUser, serializeCall } from './serializers.js';
import { buildCallNotification, buildMissedCallNotification, sendToUser } from './pushService.js';

// Per-process call coordination. Signaling is routed socket-to-socket so a
// second open tab can never hijack an ongoing call. (Single instance: move
// these maps to Redis if the API is ever scaled horizontally.)
const ringTimers = new Map();
const graceTimers = new Map();
const callSockets = new Map(); // callId -> { [userId]: socketId }

const callKey = (call) => String(call._id ?? call.id);

function clearTimers(callId) {
  clearTimeout(ringTimers.get(callId));
  ringTimers.delete(callId);
  for (const [key, timer] of graceTimers) {
    if (key.startsWith(`${callId}:`)) {
      clearTimeout(timer);
      graceTimers.delete(key);
    }
  }
}

async function findActiveCall(session, callId) {
  const call = await Call.findOne({ _id: toObjectId(callId), conversationId: session.conversation._id, active: true });
  if (!call) throw notFound('This call has already ended.', 'CALL_NOT_FOUND');
  return call;
}

/** Terminal transition shared by reject / hang up / timeout / disconnect. */
async function finish(callId, { status, reason }) {
  const now = new Date();
  const call = await Call.findOne({ _id: callId, active: true });
  if (!call) return null;
  const finalStatus = status ?? (call.status === 'accepted' ? 'ended' : 'missed');
  call.set({
    status: finalStatus,
    active: false,
    endedAt: now,
    endReason: reason,
    duration: call.startedAt ? Math.round((now - call.startedAt) / 1000) : 0,
  });
  await call.save();
  clearTimers(callId);
  callSockets.delete(callId);
  emitToConversation(call.conversationId, 'call:ended', { call: serializeCall(call), reason });

  // Unanswered (timed out or the caller hung up): swap the ringing
  // notification for a missed-call one so it never goes unnoticed.
  if (finalStatus === 'missed' && (reason === 'no-answer' || reason === 'cancelled')) {
    notifyMissedCall(call).catch(() => logger.warn('Missed-call push failed'));
  }
  return call;
}

async function notifyMissedCall(call) {
  const [caller, receiver] = await Promise.all([
    User.findById(call.callerId).select('name').lean(),
    User.findById(call.receiverId).select('settings').lean(),
  ]);
  const payload = buildMissedCallNotification({ caller, callId: callKey(call), type: call.type, preview: receiver?.settings?.notificationPreview });
  await sendToUser(call.receiverId, payload, { urgency: 'high' });
}

export async function initiateCall(session, socketId, type = 'video') {
  const { user, conversation, peerId } = session;

  // The other person switched this kind of call off: never ring, log it as missed.
  const receiver = await User.findById(peerId).select('name settings').lean();
  const allowed = type === 'audio' ? receiver?.settings?.allowVoiceCalls : receiver?.settings?.allowVideoCalls;
  if (allowed === false) {
    const now = new Date();
    await Call.create({ conversationId: conversation._id, callerId: user._id, receiverId: peerId, type, status: 'missed', active: false, endedAt: now, endReason: 'calls-off' });
    throw new AppError(409, 'CALLS_OFF', `${receiver.name} isn't taking ${type === 'audio' ? 'voice' : 'video'} calls right now.`);
  }

  let call;
  try {
    call = await Call.create({ conversationId: conversation._id, callerId: user._id, receiverId: peerId, type });
  } catch (err) {
    if (err.code === 11000) throw conflict('A call is already in progress.', 'CALL_BUSY');
    throw err;
  }

  const id = callKey(call);
  callSockets.set(id, { [String(user._id)]: socketId });
  const dto = serializeCall(call);
  emitToUser(peerId, 'call:incoming', { call: dto, caller: publicUser(user) });
  ringTimers.set(id, setTimeout(() => finish(id, { status: 'missed', reason: 'no-answer' }), config.calls.ringTimeoutMs));

  onScreenPushEndpoints(peerId)
    .then(async (skipEndpoints) => {
      const receiver = await User.findById(peerId).select('settings').lean();
      const payload = buildCallNotification({ caller: user, callId: id, type, preview: receiver?.settings?.notificationPreview });
      await sendToUser(peerId, payload, { urgency: 'high', ttl: Math.ceil(config.calls.ringTimeoutMs / 1000), skipEndpoints });
    })
    .catch(() => logger.warn('Incoming-call push failed'));

  return dto;
}

export async function acceptCall(session, callId, socketId) {
  const call = await Call.findOneAndUpdate(
    { _id: toObjectId(callId), conversationId: session.conversation._id, receiverId: session.user._id, status: 'ringing', active: true },
    { $set: { status: 'accepted', startedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!call) throw conflict('This call is no longer available.', 'CALL_UNAVAILABLE');

  const id = callKey(call);
  clearTimeout(ringTimers.get(id));
  ringTimers.delete(id);
  callSockets.set(id, { ...callSockets.get(id), [String(session.user._id)]: socketId });
  // socketId lets the receiver's other tabs dismiss their ringing screen.
  emitToConversation(session.conversation._id, 'call:accepted', { call: serializeCall(call), socketId });
  return serializeCall(call);
}

export async function rejectCall(session, callId) {
  const call = await findActiveCall(session, callId);
  if (!sameId(call.receiverId, session.user._id) || call.status !== 'ringing') {
    throw forbidden('Only the person being called can decline.', 'CALL_FORBIDDEN');
  }
  return serializeCall(await finish(callKey(call), { status: 'rejected', reason: 'rejected' }));
}

export async function endCall(session, callId) {
  const call = await findActiveCall(session, callId);
  const reason = call.status === 'ringing' ? 'cancelled' : 'hangup';
  return serializeCall(await finish(callKey(call), { reason }));
}

/** Relays SDP/ICE only between the two sockets registered on the call. */
export async function relaySignal(session, socketId, event, { callId, ...payload }) {
  const sockets = callSockets.get(String(callId));
  if (!sockets || sockets[String(session.user._id)] !== socketId) return false;
  const target = sockets[String(session.peerId)];
  if (!target) return false;
  emitToSocket(target, event, { callId: String(callId), ...payload });
  return true;
}

/** After a socket reconnect, re-attach it to the live call. */
export async function rejoinCall(session, callId, socketId) {
  const call = await findActiveCall(session, callId);
  const id = callKey(call);
  const userId = String(session.user._id);
  if (call.status !== 'accepted') {
    if (sameId(call.callerId, userId)) callSockets.set(id, { ...callSockets.get(id), [userId]: socketId });
    return serializeCall(call);
  }
  clearTimeout(graceTimers.get(`${id}:${userId}`));
  graceTimers.delete(`${id}:${userId}`);
  callSockets.set(id, { ...callSockets.get(id), [userId]: socketId });
  const peerSocket = callSockets.get(id)?.[String(session.peerId)];
  if (peerSocket) emitToSocket(peerSocket, 'call:peer-rejoined', { callId: id });
  return serializeCall(call);
}

/** A participant's socket dropped: cancel ringing, or wait for a reconnect. */
export function handleSocketDisconnect(session, socketId) {
  const userId = String(session.user._id);
  for (const [callId, sockets] of callSockets) {
    if (sockets[userId] !== socketId) continue;
    const peerSocket = sockets[String(session.peerId)];
    if (!peerSocket) {
      // Caller left while still ringing.
      finish(callId, { reason: 'cancelled' }).catch(() => {});
      continue;
    }
    emitToSocket(peerSocket, 'call:peer-reconnecting', { callId });
    graceTimers.set(
      `${callId}:${userId}`,
      setTimeout(() => finish(callId, { reason: 'connection-lost' }).catch(() => {}), config.calls.reconnectGraceMs),
    );
  }
}

/** Ringing call waiting for this user (e.g. app opened from a push). */
export async function pendingIncomingCall(session) {
  const call = await Call.findOne({ conversationId: session.conversation._id, receiverId: session.user._id, status: 'ringing', active: true }).lean();
  return call ? serializeCall(call) : null;
}

export async function listCalls(conversationId, { before, limit = 30 }) {
  const filter = { conversationId };
  if (before) filter._id = { $lt: toObjectId(before) };
  const calls = await Call.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  return { calls: calls.slice(0, limit).map(serializeCall), hasMore: calls.length > limit };
}

/** Calls left "active" by a crash/restart can never resume; close them. */
export async function closeStaleCalls() {
  const now = new Date();
  await Call.updateMany({ active: true, status: 'ringing' }, { $set: { active: false, status: 'missed', endedAt: now, endReason: 'server-restart' } });
  await Call.updateMany({ active: true }, { $set: { active: false, status: 'ended', endedAt: now, endReason: 'server-restart' } });
}

export function resetCallState() {
  for (const id of [...ringTimers.keys(), ...callSockets.keys()]) clearTimers(id);
  callSockets.clear();
}
