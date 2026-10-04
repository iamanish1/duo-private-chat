import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const CREDENTIAL_TTL_SECONDS = 6 * 60 * 60;
const CLOUDFLARE_TTL_SECONDS = 24 * 60 * 60;
const CLOUDFLARE_REFRESH_MS = 12 * 60 * 60 * 1000; // reuse credentials for half their life
const CLOUDFLARE_TIMEOUT_MS = 4000;

let cloudflareCache = null; // { iceServers, fetchedAt }

/** Browsers stall on TURN over port 53, so Cloudflare advises dropping those URLs. */
const withoutPort53 = (urls) => [].concat(urls).filter((url) => !/:53(\?|$)/.test(url));

/**
 * Short-lived STUN/TURN credentials from Cloudflare Realtime (1 TB/month
 * free). Cached and shared between calls; null when unconfigured or failing.
 */
async function cloudflareIceServers() {
  const { cloudflareTurnKeyId: keyId, cloudflareTurnApiToken: token } = config.webrtc;
  if (!keyId || !token) return null;
  if (cloudflareCache && Date.now() - cloudflareCache.fetchedAt < CLOUDFLARE_REFRESH_MS) return cloudflareCache.iceServers;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: CLOUDFLARE_TTL_SECONDS }),
      signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Cloudflare TURN responded ${res.status}`);
    const body = await res.json();
    const iceServers = []
      .concat(body.iceServers ?? [])
      .map((server) => ({ ...server, urls: withoutPort53(server.urls) }))
      .filter((server) => server.urls.length);
    if (!iceServers.length) throw new Error('Cloudflare TURN returned no servers');
    cloudflareCache = { iceServers, fetchedAt: Date.now() };
    return iceServers;
  } catch (err) {
    logger.warn('Cloudflare TURN unavailable; using the fallback relay', { message: err.message });
    // A slightly stale credential beats none: it is valid for 24 h.
    return cloudflareCache && Date.now() - cloudflareCache.fetchedAt < CLOUDFLARE_TTL_SECONDS * 1000 - 60_000 ? cloudflareCache.iceServers : null;
  }
}

/** The classic TURN settings (e.g. Metered, or coturn with a shared secret). */
function configuredTurn(userId) {
  const { turnUrls, turnUsername, turnCredential, turnSharedSecret } = config.webrtc;
  if (!turnUrls.length) return [];
  if (turnSharedSecret) {
    const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS}:${userId}`;
    const credential = crypto.createHmac('sha1', turnSharedSecret).update(username).digest('base64');
    return [{ urls: turnUrls, username, credential }];
  }
  if (turnUsername && turnCredential) return [{ urls: turnUrls, username: turnUsername, credential: turnCredential }];
  return [{ urls: turnUrls }];
}

const backupRelays = () =>
  config.webrtc.backupRelays.map(({ urls, username, credential }) => (username && credential ? { urls, username, credential } : { urls }));

/**
 * ICE servers handed to authenticated clients at call time, so TURN
 * credentials never ship inside the frontend bundle.
 *
 * Relays are listed in preference order — Cloudflare (if set up), the main
 * TURN relay, then backups. Phones connect directly whenever they can; when
 * they need a relay, WebRTC prefers the earlier servers, and a relay whose
 * free allowance has run out refuses the allocation, so the call simply goes
 * through the next one. A relay failing mid-call triggers an ICE restart
 * (callController), which lands on the next working relay.
 */
export async function getIceServers(userId) {
  const { stunUrls } = config.webrtc;
  const iceServers = [];
  if (stunUrls.length) iceServers.push({ urls: stunUrls });
  const relays = [...((await cloudflareIceServers()) ?? []), ...configuredTurn(userId), ...backupRelays()];
  const relayCount = relays.filter((s) => [].concat(s.urls).some((u) => /^turns?:/.test(u))).length;
  return { iceServers: [...iceServers, ...relays], ttl: CREDENTIAL_TTL_SECONDS, relays: relayCount };
}

export function resetIceCache() {
  cloudflareCache = null;
}
