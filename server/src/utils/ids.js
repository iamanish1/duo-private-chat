import mongoose from 'mongoose';

export const isObjectId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));
export const sameId = (a, b) => a != null && b != null && String(a) === String(b);
export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
