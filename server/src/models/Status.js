import mongoose from 'mongoose';
import { mediaSchema } from './Message.js';

export const STATUS_TYPES = ['text', 'image', 'video'];

// A WhatsApp-style status: visible to the other person for 24 hours. Media
// lives in object storage; an hourly sweep deletes expired statuses and their
// files (a TTL index would drop the document but leave the file behind).
const statusSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: STATUS_TYPES, required: true },
    // Text statuses: the words on the coloured card. Photos/videos: the caption.
    text: { type: String, maxlength: 700, default: '' },
    // Index into the client's palette of text-status backgrounds.
    background: { type: Number, min: 0, max: 15, default: 0 },
    media: { type: mediaSchema, default: undefined },
    // When the other person first opened it (the "seen" receipt).
    viewedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

statusSchema.index({ conversationId: 1, expiresAt: 1 });

export const Status = mongoose.model('Status', statusSchema);
