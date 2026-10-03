import { describe, expect, it } from 'vitest';
import { tuneOpus } from './webrtc';

const CHROME_AUDIO = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9',
  'a=rtpmap:111 opus/48000/2',
  'a=rtcp-fb:111 transport-cc',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  'a=rtpmap:9 G722/8000',
  '',
].join('\r\n');

const fmtpOf = (sdp, pt) => sdp.match(new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`))?.[1];

describe('tuneOpus', () => {
  it('merges the voice profile into the Opus line and keeps existing params', () => {
    const params = fmtpOf(tuneOpus(CHROME_AUDIO), 111).split(';');
    expect(params).toEqual(
      expect.arrayContaining(['minptime=10', 'useinbandfec=1', 'usedtx=0', 'maxaveragebitrate=64000', 'maxplaybackrate=48000', 'stereo=0']),
    );
    expect(params.filter((p) => p.startsWith('useinbandfec'))).toHaveLength(1);
  });

  it('leaves other codecs untouched', () => {
    expect(fmtpOf(tuneOpus(CHROME_AUDIO), 63)).toBe('111/111');
  });

  it('adds an fmtp line when the browser omitted one', () => {
    const sdp = 'm=audio 9 UDP/TLS/RTP/SAVPF 109\r\na=rtpmap:109 opus/48000/2\r\n';
    expect(fmtpOf(tuneOpus(sdp), 109)).toContain('maxaveragebitrate=64000');
  });

  it('does nothing when Opus is absent', () => {
    const sdp = 'm=audio 9 RTP/SAVPF 0\r\na=rtpmap:0 PCMU/8000\r\n';
    expect(tuneOpus(sdp)).toBe(sdp);
  });
});
