import mongoose from 'mongoose';

export const MESSAGE_TYPES = ['text', 'image', 'video', 'audio'];
export const MESSAGE_STATUSES = ['sent', 'delivered', 'read'];

// Media binaries live in object storage; MongoDB keeps only the storage key
// and metadata. URLs are generated (signed) when messages are serialized.
export const mediaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'video', 'audio'], required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: Number,
    height: Number,
    duration: Number,
    // Voice notes: ~48 normalized peaks (0–100) for drawing the bubble waveform.
    waveform: { type: [Number], default: undefined },
    thumbnailKey: String,
  },
  { _id: false },
);

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true, maxlength: 16 },
  },
  { _id: false },
);

// A reply to a status keeps a small copy of it, so the quote still makes
// sense in the chat after the status itself has expired (24 h).
const statusReplySchema = new mongoose.Schema(
  {
    statusId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['text', 'image', 'video'], required: true },
    text: { type: String, maxlength: 160, default: '' },
    background: { type: Number, default: 0 },
    media: { type: mediaSchema, default: undefined },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Client-generated id: makes retries idempotent and reconciles optimistic UI.
    clientId: { type: String, maxlength: 64 },
    type: { type: String, enum: MESSAGE_TYPES, required: true },
    text: { type: String, maxlength: 4000, default: '' },
    media: { type: mediaSchema, default: undefined },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    statusReply: { type: statusReplySchema, default: undefined },
    reactions: { type: [reactionSchema], default: [] },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'sent' },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    // Set when the sender corrected the text (shown as "edited").
    editedAt: { type: Date, default: null },
    // "Keep forever": exempt from the automatic removal of old videos.
    keptAt: { type: Date, default: null },
    // The file was removed after the retention period; the message stays.
    mediaExpiredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Cursor pagination walks _id (monotonic) within the single conversation.
messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, type: 1, _id: -1 });
messageSchema.index({ receiverId: 1, status: 1 });
messageSchema.index(
  { senderId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
);

export const Message = mongoose.model('Message', messageSchema);
