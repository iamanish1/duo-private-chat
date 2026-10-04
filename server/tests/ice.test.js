import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = ['TURN_SERVER_URL', 'TURN_SHARED_SECRET', 'TURN_SERVER_USERNAME', 'TURN_SERVER_CREDENTIAL', 'TURN_BACKUP_URL', 'TURN_BACKUP_USERNAME', 'TURN_BACKUP_CREDENTIAL', 'TURN_BACKUP2_URL', 'TURN_BACKUP2_USERNAME', 'TURN_BACKUP2_CREDENTIAL', 'CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN'];

async function loadWith(env) {
  vi.resetModules();
  Object.assign(process.env, env);
  return import('../src/services/iceService.js');
}

afterEach(() => {
  ENV_KEYS.forEach((k) => delete process.env[k]);
  vi.unstubAllGlobals();
});

const CLOUDFLARE_REPLY = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'cf-user',
      credential: 'cf-pass',
    },
  ],
};

describe('ICE server configuration', () => {
  it('issues short-lived TURN credentials from a shared secret (coturn REST scheme)', async () => {
    const { getIceServers } = await loadWith({ TURN_SERVER_URL: 'turn:turn.example.com:3478,turns:turn.example.com:5349', TURN_SHARED_SECRET: 'shared-secret' });
    const { iceServers } = await getIceServers('user-1');
    const turn = iceServers.find((s) => s.urls.some((u) => u.startsWith('turn')));
    const [expiry, user] = turn.username.split(':');
    expect(user).toBe('user-1');
    expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000);
    expect(turn.credential).toBe(crypto.createHmac('sha1', 'shared-secret').update(turn.username).digest('base64'));
  });

  it('lists every relay biggest-first — main, then backups — so a full relay falls through to the next', async () => {
    const { getIceServers } = await loadWith({
      TURN_SERVER_URL: 'turn:relay1.expressturn.com:3478',
      TURN_SERVER_USERNAME: 'express-user',
      TURN_SERVER_CREDENTIAL: 'express-pass',
      TURN_BACKUP_URL: 'turn:openrelay.metered.ca:80,turns:openrelay.metered.ca:443?transport=tcp',
      TURN_BACKUP_USERNAME: 'open-user',
      TURN_BACKUP_CREDENTIAL: 'open-pass',
      TURN_BACKUP2_URL: 'turn:global.relay.metered.ca:80',
      TURN_BACKUP2_USERNAME: 'metered-user',
      TURN_BACKUP2_CREDENTIAL: 'metered-pass',
    });
    const result = await getIceServers('user-1');
    expect(result.relays).toBe(3);
    const relays = result.iceServers.filter((s) => s.username);
    expect(relays.map((s) => s.username)).toEqual(['express-user', 'open-user', 'metered-user']);
    expect(relays[1].urls).toEqual(['turn:openrelay.metered.ca:80', 'turns:openrelay.metered.ca:443?transport=tcp']);
    // STUN comes first so direct connections are tried before any relay.
    expect(result.iceServers[0].urls[0]).toMatch(/^stun:/);
  });

  it('a half-configured backup (no password) is still offered, without credentials', async () => {
    const { getIceServers } = await loadWith({ TURN_BACKUP_URL: 'turn:backup.example.com:3478' });
    const { iceServers } = await getIceServers('user-1');
    expect(iceServers.at(-1)).toEqual({ urls: ['turn:backup.example.com:3478'] });
  });

  it('puts Cloudflare first when set up, drops port-53 URLs, reuses credentials, and keeps the other relays as fallbacks', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => CLOUDFLARE_REPLY }));
    vi.stubGlobal('fetch', fetchMock);
    const { getIceServers } = await loadWith({
      CLOUDFLARE_TURN_KEY_ID: 'key-123',
      CLOUDFLARE_TURN_API_TOKEN: 'secret-token',
      TURN_SERVER_URL: 'turn:global.relay.metered.ca:80',
      TURN_SERVER_USERNAME: 'metered-user',
      TURN_SERVER_CREDENTIAL: 'metered-pass',
    });

    const first = await getIceServers('user-1');
    const urls = first.iceServers.flatMap((s) => s.urls);
    expect(urls).toContain('turns:turn.cloudflare.com:443?transport=tcp');
    expect(urls.some((u) => /:53(\?|$)/.test(u))).toBe(false);
    // Cloudflare before Metered.
    expect(urls.findIndex((u) => u.includes('cloudflare'))).toBeLessThan(urls.findIndex((u) => u.includes('metered')));
    expect(first.iceServers.find((s) => s.username === 'cf-user').credential).toBe('cf-pass');

    // The API token is only ever sent to Cloudflare, never to the phone.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key-123/credentials/generate-ice-servers');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(JSON.stringify(first)).not.toContain('secret-token');

    await getIceServers('user-2');
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached
  });

  it('still offers the configured TURN relay when Cloudflare is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const { getIceServers } = await loadWith({
      CLOUDFLARE_TURN_KEY_ID: 'key-123',
      CLOUDFLARE_TURN_API_TOKEN: 'secret-token',
      TURN_SERVER_URL: 'turn:global.relay.metered.ca:80',
      TURN_SERVER_USERNAME: 'metered-user',
      TURN_SERVER_CREDENTIAL: 'metered-pass',
    });
    const result = await getIceServers('user-1');
    expect(result.relays).toBe(1);
    expect(result.iceServers.find((s) => s.username === 'metered-user').urls).toEqual(['turn:global.relay.metered.ca:80']);
  });

  it('without Cloudflare settings, works exactly as before (no network call)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { getIceServers } = await loadWith({ TURN_SERVER_URL: 'turn:global.relay.metered.ca:80', TURN_SERVER_USERNAME: 'u', TURN_SERVER_CREDENTIAL: 'p' });
    const result = await getIceServers('user-1');
    expect(result.relays).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
