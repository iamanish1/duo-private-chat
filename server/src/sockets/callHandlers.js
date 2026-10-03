import * as calls from '../services/callService.js';

const SIGNAL_EVENTS = ['webrtc:offer', 'webrtc:answer', 'webrtc:ice-candidate', 'webrtc:restart'];

export function registerCallHandlers(socket, on) {
  const { session } = socket.data;

  on('call:initiate', async () => ({ call: await calls.initiateCall(session, socket.id) }));
  on('call:accept', async ({ callId }) => ({ call: await calls.acceptCall(session, callId, socket.id) }));
  on('call:reject', async ({ callId }) => ({ call: await calls.rejectCall(session, callId) }));
  on('call:end', async ({ callId }) => ({ call: await calls.endCall(session, callId) }));
  on('call:rejoin', async ({ callId }) => ({ call: await calls.rejoinCall(session, callId, socket.id) }));

  // WebRTC signaling: relayed only between the two sockets bound to the call.
  for (const event of SIGNAL_EVENTS) {
    on(event, async (data) => ({ relayed: await calls.relaySignal(session, socket.id, event, data) }));
  }

  socket.on('disconnect', () => calls.handleSocketDisconnect(session, socket.id));
}
