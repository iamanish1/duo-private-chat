import { create } from 'zustand';

// phase: idle → outgoing | incoming → connecting → active → ended → idle
const initialState = {
  phase: 'idle',
  call: null,
  role: null, // caller | callee
  peer: null,
  localStream: null,
  remoteStream: null,
  micEnabled: true,
  cameraEnabled: true,
  canSwitchCamera: false,
  facingMode: 'user',
  connectedAt: null,
  reconnecting: false,
  endReason: null,
  error: null,
};

export const useCallStore = create((set) => ({
  ...initialState,
  patch: (patch) => set(patch),
  reset: () => set(initialState),
}));

export const isInCall = (phase) => phase !== 'idle' && phase !== 'ended';
