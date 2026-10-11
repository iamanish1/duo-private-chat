import mongoose from 'mongoose';

// A list you both edit: bucket list, movies to watch, date ideas…
const itemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 200 },
    done: { type: Boolean, default: false },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    doneAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const sharedListSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    emoji: { type: String, maxlength: 16, default: '📝' },
    items: { type: [itemSchema], default: [] },
  },
  { timestamps: true },
);

sharedListSchema.index({ conversationId: 1, createdAt: 1 });

export const SharedList = mongoose.model('SharedList', sharedListSchema);
