// Single place that knows about the Socket.IO server instance. Services emit
// through these helpers so REST and socket code paths behave identically.
let io = null;

export const setIO = (instance) => {
  io = instance;
};

export const userRoom = (userId) => `user:${userId}`;
export const conversationRoom = (conversationId) => `conversation:${conversationId}`;

export function emitToUser(userId, event, payload) {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToConversation(conversationId, event, payload) {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
}

export function emitToSocket(socketId, event, payload) {
  io?.to(socketId).emit(event, payload);
}

export async function socketsOfUser(userId) {
  return io ? io.in(userRoom(userId)).fetchSockets() : [];
}

export async function isUserOnline(userId) {
  return (await socketsOfUser(userId)).length > 0;
}

/**
 * Push endpoints of the user's devices that currently have the app on screen.
 * Those devices see the event live; every other device gets a push.
 */
export async function onScreenPushEndpoints(userId) {
  return (await socketsOfUser(userId)).filter((s) => s.data.visible && s.data.pushEndpoint).map((s) => s.data.pushEndpoint);
}

export function disconnectUser(userId) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}
