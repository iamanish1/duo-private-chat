import mongoose from 'mongoose';

// A playlist both people can edit; songs are kept in play order.
const playlistSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    songIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

playlistSchema.index({ conversationId: 1, createdAt: 1 });

export const Playlist = mongoose.model('Playlist', playlistSchema);
