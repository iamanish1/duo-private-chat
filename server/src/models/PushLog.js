import mongoose from 'mongoose';

// Delivery log for troubleshooting notifications. Never stores message text,
// only what happened to each push. Auto-deleted after 3 days.
const pushLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device: { type: String }, // e.g. "Android" / "Windows", from the subscription
  kind: { type: String }, // message | call | missed-call | test
  result: { type: String, enum: ['sent', 'skipped-on-screen', 'expired', 'failed'], required: true },
  statusCode: { type: Number },
  at: { type: Date, default: Date.now },
});

pushLogSchema.index({ at: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });
pushLogSchema.index({ userId: 1, at: -1 });

export const PushLog = mongoose.model('PushLog', pushLogSchema);
