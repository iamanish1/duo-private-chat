import { describe, expect, it } from 'vitest';
import { formatBytes, formatDayLabel, formatDuration, formatLastSeen, initials } from './format';
import { isEmojiOnly } from './emoji';

const now = new Date('2026-10-01T15:00:00');

describe('format', () => {
  it('labels days relative to today', () => {
    expect(formatDayLabel(new Date('2026-10-01T09:00:00'), now)).toBe('Today');
    expect(formatDayLabel(new Date('2026-09-30T23:00:00'), now)).toBe('Yesterday');
  });

  it('describes last seen', () => {
    expect(formatLastSeen(new Date('2026-10-01T14:59:40'), now)).toBe('Last seen just now');
    expect(formatLastSeen(new Date('2026-10-01T14:40:00'), now)).toBe('Last seen 20 min ago');
    expect(formatLastSeen(new Date('2026-10-01T09:05:00'), now)).toMatch(/^Last seen today at/);
    expect(formatLastSeen(null, now)).toBe('Offline');
  });

  it('formats durations and sizes', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(initials('Anish Gupta')).toBe('AG');
  });

  it('detects emoji-only messages', () => {
    expect(isEmojiOnly('❤️')).toBe(true);
    expect(isEmojiOnly('😂😂😂')).toBe(true);
    expect(isEmojiOnly('👩‍❤️‍👨')).toBe(true);
    expect(isEmojiOnly('hi ❤️')).toBe(false);
    expect(isEmojiOnly('123')).toBe(false);
    expect(isEmojiOnly('😂😂😂😂')).toBe(false);
  });
});
