import mongoose from 'mongoose';

// A sticker one of you made from a photo — kept in the shared sticker tray.
// The image (512×512 WebP, often with transparent corners) lives in storage.
const stickerSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true },
    width: { type: Number, default: 512 },
    height: { type: Number, default: 512 },
  },
  { timestamps: true },
);

stickerSchema.index({ conversationId: 1, createdAt: -1 });

export const Sticker = mongoose.model('Sticker', stickerSchema);
