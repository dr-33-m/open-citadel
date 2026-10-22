import { describe, expect, it } from 'vitest';

import { mp3DurationSec, readFrameHeader } from '@/utils/mp3-duration';

/** An MPEG-1 layer III mono frame at `kbps` and 44.1 kHz, padded with zeros. */
function frame(kbpsIndex: number): Uint8Array {
  const header = [0xff, 0xfb, (kbpsIndex << 4) | 0, 0xc0];
  const bytes = new Uint8Array(4);
  bytes.set(header);
  const length = readFrameHeader(bytes, 0)?.length ?? 0;
  const out = new Uint8Array(length);
  out.set(header);
  return out;
}

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const FRAME_SEC = 1152 / 44_100;

describe('mp3DurationSec', () => {
  it('sums the frames of a CBR file', () => {
    const frames = Array.from({ length: 100 }, () => frame(9));
    expect(readFrameHeader(frames[0], 0)?.length).toBe(417);
    expect(mp3DurationSec(join(...frames))).toBeCloseTo(100 * FRAME_SEC, 6);
  });

  it('sums VBR frames of different sizes', () => {
    const frames = [frame(5), frame(9), frame(14), frame(1), frame(9)];
    expect(mp3DurationSec(join(...frames))).toBeCloseTo(5 * FRAME_SEC, 6);
  });

  it('takes the frame count a Xing header declares', () => {
    const xing = frame(9);
    const tag = 4 + 17;
    xing.set([0x58, 0x69, 0x6e, 0x67, 0, 0, 0, 1, 0, 0, 0x03, 0xe8], tag); // 'Xing', frames flag, 1000 frames
    expect(mp3DurationSec(join(xing, frame(9), frame(9)))).toBeCloseTo(1000 * FRAME_SEC, 6);
  });

  it('skips an ID3 tag in front', () => {
    const id3 = new Uint8Array(10 + 300);
    id3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0x02, 0x2c]); // size 300, syncsafe
    expect(mp3DurationSec(join(id3, frame(9), frame(9), frame(9)))).toBeCloseTo(3 * FRAME_SEC, 6);
  });

  it('is zero for bytes that are not MP3', () => {
    expect(mp3DurationSec(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBe(0);
  });
});
