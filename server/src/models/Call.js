import mongoose from 'mongoose';

export const CALL_STATUSES = ['ringing', 'accepted', 'rejected', 'missed', 'ended'];

const callSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['video'], default: 'video' },
    status: { type: String, enum: CALL_STATUSES, default: 'ringing' },
    // true while ringing/accepted; a partial unique index allows one live call.
    active: { type: Boolean, default: true },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
    endReason: { type: String, default: null },
  },
  { timestamps: true },
);

callSchema.index({ conversationId: 1, createdAt: -1 });
callSchema.index({ conversationId: 1 }, { unique: true, partialFilterExpression: { active: true } });

export const Call = mongoose.model('Call', callSchema);
