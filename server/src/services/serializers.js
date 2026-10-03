import { storage } from './storage/index.js';

const id = (value) => (value == null ? null : String(value));

export function avatarUrl(user) {
  return user?.avatar?.key ? storage.url(user.avatar.key, { resourceType: 'image', variant: 'thumb' }) : null;
}

export function publicUser(user, presence = {}) {
  return {
    id: id(user._id),
    name: user.name,
    avatarUrl: avatarUrl(user),
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

function serializeMedia(media) {
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
    reactions: (message.reactions || []).map((r) => ({ userId: id(r.userId), emoji: r.emoji })),
    status: message.status,
    deliveredAt: message.deliveredAt,
    readAt: message.readAt,
    deleted,
    createdAt: message.createdAt,
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
