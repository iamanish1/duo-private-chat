// Public, build-time configuration only. No secrets ever live in the client.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Duo';

export const LIMITS = {
  textLength: 4000,
  captionLength: 1000,
  imageBytes: 15 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  videoSeconds: 300,
  voiceSeconds: 300,
};

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

// Matches the server: own text messages and captions, for 15 minutes.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const canEditMessage = (message, myId) =>
  Boolean(
    message?.id &&
      message.senderId === myId &&
      !message.deleted &&
      message.type !== 'audio' &&
      message.status !== 'sending' &&
      message.status !== 'failed' &&
      Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS,
  );

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

// Status updates (like WhatsApp): visible to the other person for 24 hours.
export const STATUS = { textLength: 700, videoSeconds: 60, imageMs: 5000, textMs: 6000 };
// Text-status card colours; the server stores the index.
export const STATUS_BACKGROUNDS = [
  'linear-gradient(160deg, #c2502f, #8f2f1b)',
  'linear-gradient(160deg, #2f6fd1, #1b3f8f)',
  'linear-gradient(160deg, #1f9d7a, #0f5f4a)',
  'linear-gradient(160deg, #8e44ad, #5b2378)',
  'linear-gradient(160deg, #e0a526, #b5700d)',
  'linear-gradient(160deg, #d63d6e, #8f1f45)',
  'linear-gradient(160deg, #3a3f47, #16181c)',
  'linear-gradient(160deg, #148ea8, #0b5466)',
];
