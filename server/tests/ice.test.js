import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

describe('ICE server configuration', () => {
  it('issues short-lived TURN credentials from a shared secret (coturn REST scheme)', async () => {
    vi.resetModules();
    process.env.TURN_SERVER_URL = 'turn:turn.example.com:3478,turns:turn.example.com:5349';
    process.env.TURN_SHARED_SECRET = 'shared-secret';
    const { getIceServers } = await import('../src/services/iceService.js');

    const { iceServers } = getIceServers('user-1');
    const turn = iceServers.find((s) => s.urls.some((u) => u.startsWith('turn')));
    const [expiry, user] = turn.username.split(':');
    expect(user).toBe('user-1');
    expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000);
    expect(turn.credential).toBe(crypto.createHmac('sha1', 'shared-secret').update(turn.username).digest('base64'));

    delete process.env.TURN_SERVER_URL;
    delete process.env.TURN_SHARED_SECRET;
  });
});
