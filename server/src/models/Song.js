import mongoose from 'mongoose';
import { mediaSchema } from './Message.js';

// A song in the couple's shared library. The audio file (and its cover art,
// if the file had one) live in object storage.
const songSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    artist: { type: String, trim: true, maxlength: 200, default: '' },
    album: { type: String, trim: true, maxlength: 200, default: '' },
    audio: { type: mediaSchema, required: true },
    coverKey: { type: String, default: null },
  },
  { timestamps: true },
);

songSchema.index({ conversationId: 1, createdAt: -1 });

export const Song = mongoose.model('Song', songSchema);
