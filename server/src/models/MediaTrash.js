import mongoose from 'mongoose';

// Files whose deletion from storage failed (e.g. a network blip). The
// storage janitor retries them, so nothing is left behind for good.
const mediaTrashSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    resourceType: { type: String, enum: ['image', 'video', 'audio'], required: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

export const MediaTrash = mongoose.model('MediaTrash', mediaTrashSchema);
