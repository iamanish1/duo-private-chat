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
    // Shared chat background — both people see it, either can change it.
    wallpaper: {
      type: new mongoose.Schema(
        {
          kind: { type: String, enum: ['default', 'color', 'gradient', 'photo'], default: 'default' },
          value: { type: String, maxlength: 40, default: null },
          imageKey: { type: String, default: null },
          dim: { type: Number, min: 0, max: 80, default: 0 },
          updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          updatedAt: Date,
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
