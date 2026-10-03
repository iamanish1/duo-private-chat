import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      validate: {
        validator: (ids) => ids.length === 2 && String(ids[0]) !== String(ids[1]),
        message: 'A conversation has exactly two distinct participants.',
      },
      required: true,
    },
    // Unique constant: the database itself refuses a second conversation.
    singleton: { type: String, default: 'primary', enum: ['primary'], unique: true, immutable: true },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
