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

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];
