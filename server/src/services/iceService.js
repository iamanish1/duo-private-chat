import crypto from 'node:crypto';
import { config } from '../config/env.js';

const CREDENTIAL_TTL_SECONDS = 6 * 60 * 60;

/**
 * ICE servers handed to authenticated clients at call time, so TURN
 * credentials never ship inside the frontend bundle. With TURN_SHARED_SECRET
 * (coturn `use-auth-secret`), credentials are short-lived per user.
 */
export function getIceServers(userId) {
  const { stunUrls, turnUrls, turnUsername, turnCredential, turnSharedSecret } = config.webrtc;
  const iceServers = [];
  if (stunUrls.length) iceServers.push({ urls: stunUrls });

  if (turnUrls.length) {
    if (turnSharedSecret) {
      const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS}:${userId}`;
      const credential = crypto.createHmac('sha1', turnSharedSecret).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    } else if (turnUsername && turnCredential) {
      iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
    } else {
      iceServers.push({ urls: turnUrls });
    }
  }
  return { iceServers, ttl: CREDENTIAL_TTL_SECONDS };
}
