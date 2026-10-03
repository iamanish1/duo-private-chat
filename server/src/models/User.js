import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: {
      key: { type: String },
      resourceType: { type: String, default: 'image' },
    },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
    // Incrementing this invalidates every JWT issued before (log out everywhere).
    tokenVersion: { type: Number, default: 0, select: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    settings: {
      // What push notifications reveal: full text, only the sender, or nothing.
      notificationPreview: { type: String, enum: ['full', 'sender', 'hidden'], default: 'sender' },
      // Off: incoming calls of that type are declined automatically and logged as missed.
      allowVoiceCalls: { type: Boolean, default: true },
      allowVideoCalls: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
