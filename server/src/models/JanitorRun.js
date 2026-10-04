import mongoose from 'mongoose';

// What each storage clean-up did; kept for 30 days for troubleshooting.
const janitorRunSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  statusesRemoved: { type: Number, default: 0 },
  trashRetried: { type: Number, default: 0 },
  trashCleared: { type: Number, default: 0 },
  orphanScan: { type: Boolean, default: false },
  filesChecked: { type: Number, default: 0 },
  orphansDeleted: { type: Number, default: 0 },
  bytesFreed: { type: Number, default: 0 },
  skipped: { type: String, default: null },
});

janitorRunSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const JanitorRun = mongoose.model('JanitorRun', janitorRunSchema);
