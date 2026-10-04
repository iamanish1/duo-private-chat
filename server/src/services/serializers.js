import { storage } from './storage/index.js';
import { config } from '../config/env.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const id = (value) => (value == null ? null : String(value));

export function avatarUrl(user) {
  return user?.avatar?.key ? storage.url(user.avatar.key, { resourceType: 'image', variant: 'thumb' }) : null;
}

// Full resolution, for viewing someone's profile photo full screen.
const avatarFullUrl = (user) => (user?.avatar?.key ? storage.url(user.avatar.key, { resourceType: 'image', variant: 'full' }) : null);

export function publicUser(user, presence = {}) {
  return {
    id: id(user._id),
    name: user.name,
    avatarUrl: avatarUrl(user),
    avatarFullUrl: avatarFullUrl(user),
    isOnline: presence.isOnline ?? user.isOnline,
    lastSeen: presence.lastSeen ?? user.lastSeen,
    acceptsVoiceCalls: user.settings?.allowVoiceCalls !== false,
    acceptsVideoCalls: user.settings?.allowVideoCalls !== false,
  };
}

export function selfUser(user) {
  return {
    ...publicUser(user),
    email: user.email,
    hasPin: Boolean(user.hasPin),
    settings: {
      notificationPreview: user.settings?.notificationPreview ?? 'sender',
      allowVoiceCalls: user.settings?.allowVoiceCalls !== false,
      allowVideoCalls: user.settings?.allowVideoCalls !== false,
    },
  };
}

export function serializeMedia(media) {
  if (!media) return null;
  let thumbnailUrl = null;
  if (media.thumbnailKey) thumbnailUrl = storage.url(media.thumbnailKey, { resourceType: 'image', variant: 'thumb' });
  else if (media.resourceType === 'video') thumbnailUrl = storage.videoPosterUrl(media.key);
  else if (media.resourceType === 'image') thumbnailUrl = storage.url(media.key, { resourceType: 'image', variant: 'thumb' });
  return {
    url: storage.url(media.key, { resourceType: media.resourceType, mimeType: media.mimeType, variant: 'full' }),
    thumbnailUrl,
    mimeType: media.mimeType,
    size: media.size,
    width: media.width ?? null,
    height: media.height ?? null,
    duration: media.duration ?? null,
    waveform: media.waveform?.length ? media.waveform : null,
  };
}

function serializeReply(reply) {
  if (!reply || typeof reply !== 'object' || !reply._id) return null;
  const deleted = Boolean(reply.deletedAt);
  return {
    id: id(reply._id),
    senderId: id(reply.senderId),
    type: reply.type,
    text: deleted ? '' : (reply.text || '').slice(0, 160),
    deleted,
    thumbnailUrl: !deleted && reply.media ? serializeMedia(reply.media).thumbnailUrl : null,
  };
}

// Reply to a status: the preview image is only offered while the status
// (and so its file) still exists.
function serializeStatusReply(message) {
  const reply = message.statusReply;
  if (!reply?.statusId) return null;
  const expired = new Date(reply.expiresAt).getTime() <= Date.now();
  return {
    statusId: id(reply.statusId),
    ownerId: id(message.receiverId),
    type: reply.type,
    text: reply.text || '',
    background: reply.background ?? 0,
    thumbnailUrl: !expired && reply.media ? serializeMedia(reply.media).thumbnailUrl : null,
    expired,
  };
}

function mediaRemovalDate(message, deleted) {
  const { retentionDays, retentionTypes } = config.media;
  if (deleted || !retentionDays || !message.media || message.keptAt || message.mediaExpiredAt) return null;
  if (!retentionTypes.includes(message.type)) return null;
  return new Date(new Date(message.createdAt).getTime() + retentionDays * DAY_MS);
}

export function serializeMessage(message) {
  const deleted = Boolean(message.deletedAt);
  return {
    id: id(message._id),
    clientId: message.clientId ?? null,
    conversationId: id(message.conversationId),
    senderId: id(message.senderId),
    receiverId: id(message.receiverId),
    type: message.type,
    text: deleted ? '' : message.text,
    media: deleted ? null : serializeMedia(message.media),
    // Kept flat as well for consumers that only need the URLs.
    mediaUrl: deleted || !message.media ? null : storage.url(message.media.key, { resourceType: message.media.resourceType, mimeType: message.media.mimeType }),
    replyTo: serializeReply(message.replyTo),
    statusReply: deleted ? null : serializeStatusReply(message),
    reactions: (message.reactions || []).map((r) => ({ userId: id(r.userId), emoji: r.emoji })),
    status: message.status,
    deliveredAt: message.deliveredAt,
    readAt: message.readAt,
    editedAt: deleted ? null : message.editedAt ?? null,
    kept: Boolean(message.keptAt),
    mediaExpired: Boolean(message.mediaExpiredAt),
    // When the file will be removed (old-video clean-up), unless kept.
    mediaRemovesAt: mediaRemovalDate(message, deleted),
    deleted,
    createdAt: message.createdAt,
  };
}

export function serializeStatus(status) {
  return {
    id: id(status._id),
    userId: id(status.userId),
    type: status.type,
    text: status.text || '',
    background: status.background ?? 0,
    media: serializeMedia(status.media),
    viewedAt: status.viewedAt ?? null,
    createdAt: status.createdAt,
    expiresAt: status.expiresAt,
  };
}

export function serializeCall(call) {
  return {
    id: id(call._id),
    callerId: id(call.callerId),
    receiverId: id(call.receiverId),
    type: call.type,
    status: call.status,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    duration: call.duration,
    endReason: call.endReason,
    createdAt: call.createdAt,
  };
}
