import { describe, expect, it } from 'vitest';
import { applyStatus, latestUnreadIncoming, mergeMessages, newestConfirmedId, upsertMessage } from './messageList';

const msg = (id, extra = {}) => ({ id, clientId: null, senderId: 'a', status: 'sent', createdAt: '2026-01-01T00:00:00Z', ...extra });
const pending = (clientId, extra = {}) => ({ id: null, clientId, senderId: 'me', status: 'sending', ...extra });

describe('upsertMessage', () => {
  it('keeps confirmed messages ordered by id and pending ones last', () => {
    let list = [msg('0002'), pending('local-1')];
    list = upsertMessage(list, msg('0001'));
    list = upsertMessage(list, msg('0003'));
    expect(list.map((m) => m.id ?? m.clientId)).toEqual(['0001', '0002', '0003', 'local-1']);
  });

  it('replaces an optimistic message when the server confirms it', () => {
    const list = [msg('0001'), pending('c1', { text: 'hi' })];
    const next = upsertMessage(list, msg('0002', { clientId: 'c1', senderId: 'me', text: 'hi' }));
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ id: '0002', clientId: 'c1', status: 'sent' });
  });

  it('never downgrades a delivery status (late echo after a read receipt)', () => {
    const list = [msg('0001', { status: 'read' })];
    expect(upsertMessage(list, msg('0001', { status: 'sent' }))[0].status).toBe('read');
  });

  it('keeps the on-device media preview after confirmation', () => {
    const list = [pending('c1', { localPreview: { url: 'blob:1' } })];
    const next = upsertMessage(list, msg('0009', { clientId: 'c1' }));
    expect(next[0].localPreview).toEqual({ url: 'blob:1' });
  });

  it('merges a page without duplicates', () => {
    const list = [msg('0002'), msg('0003')];
    expect(mergeMessages(list, [msg('0001'), msg('0002')]).map((m) => m.id)).toEqual(['0001', '0002', '0003']);
  });
});

describe('applyStatus', () => {
  it('moves statuses forward only', () => {
    const list = [msg('1', { status: 'sent' }), msg('2', { status: 'read' })];
    const next = applyStatus(list, ['1', '2'], 'delivered', 'now');
    expect(next.map((m) => m.status)).toEqual(['delivered', 'read']);
    expect(next[0].deliveredAt).toBe('now');
  });

  it('returns the same list when nothing changes', () => {
    const list = [msg('1', { status: 'read' })];
    expect(applyStatus(list, ['1'], 'delivered', 'now')).toBe(list);
  });
});

describe('helpers', () => {
  it('finds the newest confirmed id and latest unread incoming', () => {
    const list = [msg('1'), msg('2', { senderId: 'me' }), pending('p')];
    expect(newestConfirmedId(list)).toBe('2');
    expect(latestUnreadIncoming([msg('1', { senderId: 'peer' }), msg('2', { senderId: 'me' })], 'me')?.id).toBe('1');
    expect(latestUnreadIncoming([msg('1', { senderId: 'peer', status: 'read' })], 'me')).toBeNull();
  });
});
