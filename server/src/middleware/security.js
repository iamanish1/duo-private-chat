import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { AppError, forbidden } from '../utils/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  try {
    const { host: originHost, origin: normalized } = new URL(origin);
    return originHost === host || config.clientOrigins.includes(normalized);
  } catch {
    return false;
  }
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing calls must
 * carry a custom header (which forces a CORS preflight cross-origin) and,
 * when the browser sends an Origin, it must be ours.
 */
export function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('x-requested-with') !== 'XMLHttpRequest' || !isAllowedOrigin(req.get('origin'), req.get('host'))) {
    return next(forbidden('Request blocked.', 'CSRF_REJECTED'));
  }
  next();
}

/** Strips `$`-prefixed and dotted keys from bodies (MongoDB operator injection). */
export function sanitizeInput(req, res, next) {
  const clean = (value, depth = 0) => {
    if (depth > 10 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') delete value[key];
      else value[key] = clean(value[key], depth + 1);
    }
    return value;
  };
  if (req.body) clean(req.body);
  if (req.params) clean(req.params);
  next();
}

const limitHandler = (message) => (req, res, next) => next(new AppError(429, 'RATE_LIMITED', message));

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limitHandler('Too many sign-in attempts. Please wait a few minutes.'),
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limitHandler('You are going a little fast. Please slow down.'),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limitHandler('Too many uploads at once. Please wait a moment.'),
});

// Duo-code unlock and changes: separate budget from password sign-ins. The
// per-account 5-wrong-codes lockout is the main defence; this caps volume.
export const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limitHandler('Too many attempts. Please wait a few minutes.'),
});
