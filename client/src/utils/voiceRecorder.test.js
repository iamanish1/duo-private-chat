import { describe, expect, it } from 'vitest';
import { buildWaveform } from './voiceRecorder';

describe('buildWaveform', () => {
  it('produces fixed-size peaks scaled to the loudest moment', () => {
    const samples = Array.from({ length: 480 }, (_, i) => (i > 240 ? 0.8 : 0.2));
    const wave = buildWaveform(samples, 48);
    expect(wave).toHaveLength(48);
    expect(Math.max(...wave)).toBe(100);
    expect(wave[0]).toBe(25);
    expect(wave.every((v) => v >= 4 && v <= 100)).toBe(true);
  });

  it('handles silence and very short recordings', () => {
    expect(buildWaveform([], 10)).toEqual(Array(10).fill(4));
    expect(buildWaveform([0.5, 0.5], 4)).toHaveLength(4);
  });
});
