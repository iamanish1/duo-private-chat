import { create } from 'zustand';

// phase: idle → outgoing | incoming → connecting → active → ended → idle
const initialState = {
  phase: 'idle',
  kind: 'video', // video | audio (voice call)
  call: null,
  role: null, // caller | callee
  peer: null,
  localStream: null,
  remoteStream: null,
  micEnabled: true,
  cameraEnabled: true,
  canSwitchCamera: false,
  switchingCamera: false,
  facingMode: 'user',
  connectedAt: null,
  reconnecting: false,
  endReason: null,
  error: null,
  minimized: false, // call shrunk to a floating window while chatting
  chatSeenAt: null, // incoming messages after this show as a badge on the Chat button
};

export const useCallStore = create((set) => ({
  ...initialState,
  patch: (patch) => set(patch),
  reset: () => set(initialState),
}));

export const isInCall = (phase) => phase !== 'idle' && phase !== 'ended';
