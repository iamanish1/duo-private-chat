import mongoose from 'mongoose';

// Separate collection: a person can have several devices/browsers subscribed.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, maxlength: 300 },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
