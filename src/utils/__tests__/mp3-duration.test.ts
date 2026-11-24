import { describe, expect, it } from 'vitest';

import { mp3DurationSec, readFrameHeader, asOneMp3 } from '@/utils/mp3-duration';

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

/** A Xing frame declaring `frames` frames: no audio, only what its encoder says about the file. */
function xing(frames: number): Uint8Array {
  const out = frame(9);
  out.set([0x58, 0x69, 0x6e, 0x67, 0, 0, 0, 1, (frames >>> 24) & 0xff, (frames >>> 16) & 0xff, (frames >>> 8) & 0xff, frames & 0xff], 4 + 17);
  return out;
}

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

  it('counts the frames there are, not the count a Xing frame declares', () => {
    expect(mp3DurationSec(join(xing(1000), frame(9), frame(9)))).toBeCloseTo(2 * FRAME_SEC, 6);
  });

  it('counts every part of MP3s joined one after another', () => {
    // Kokoro's maker: one file per clause, each with its own Info frame.
    const joined = join(xing(2), frame(9), frame(5), xing(3), frame(9), frame(14), frame(1));
    expect(mp3DurationSec(joined)).toBeCloseTo(5 * FRAME_SEC, 6);
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

describe('asOneMp3', () => {
  /** The frame count, byte count and flags of the Xing frame at the start. */
  function xingOf(bytes: Uint8Array): { flags: number; frames: number; total: number } {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = 4 + 17;
    expect(String.fromCharCode(...bytes.subarray(tag, tag + 4))).toBe('Xing');
    return { flags: view.getUint32(tag + 4), frames: view.getUint32(tag + 8), total: view.getUint32(tag + 12) };
  }

  it('makes MP3s joined one after another one file, with one Xing frame true for all of it', () => {
    const audio = [frame(9), frame(5), frame(9), frame(14)];
    const joined = join(xing(2), audio[0], audio[1], xing(2), audio[2], audio[3]);
    const one = asOneMp3(joined)!;
    expect(one.subarray(417)).toEqual(join(...audio));
    expect(xingOf(one)).toEqual({ flags: 0x7, frames: 4, total: one.length });
    expect(mp3DurationSec(one)).toBeCloseTo(4 * FRAME_SEC, 6);
  });

  it('passes over a tag or stray bytes between the parts', () => {
    const id3 = new Uint8Array(10 + 20);
    id3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20]);
    const joined = join(xing(2), frame(9), frame(9), id3, frame(5), new Uint8Array([1, 2, 3]), frame(9), frame(9));
    const one = asOneMp3(joined)!;
    expect(one.subarray(417)).toEqual(join(frame(9), frame(9), frame(5), frame(9), frame(9)));
    expect(xingOf(one).frames).toBe(5);
  });

  it('is null for a file that is one already', () => {
    expect(asOneMp3(join(frame(9), frame(5), frame(9)))).toBeNull();
    expect(asOneMp3(join(xing(3), frame(9), frame(5), frame(9)))).toBeNull();
  });
});
