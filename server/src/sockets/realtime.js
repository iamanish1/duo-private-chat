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

/** True when at least one of the user's tabs is visible (chat on screen). */
export async function isUserViewing(userId) {
  return (await socketsOfUser(userId)).some((socket) => socket.data.visible);
}

export function disconnectUser(userId) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}
