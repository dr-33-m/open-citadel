/**
 * How long an MP3 plays, read from its own frame headers.
 *
 * The audiobook keeps every sentence as the MP3 the voice made, and its
 * clock is the lengths of those files. Asking the native player would mean
 * loading each one; the bytes already say it. An ID3 tag in front is skipped
 * by its declared size; a Xing or Info frame (what a VBR encoder writes
 * first) gives the frame count outright; otherwise the frames are walked and
 * their samples summed, which is exact for CBR and VBR alike.
 *
 * Pure, so it can be tested on its own.
 */

/** Bitrates in kbps by [version is MPEG-1][layer III index]. Only layer III is made by the voices. */
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44_100, 48_000, 32_000], // MPEG-1
  2: [22_050, 24_000, 16_000], // MPEG-2
  0: [11_025, 12_000, 8_000], // MPEG-2.5
};

export interface FrameHeader {
  /** Bytes in the frame, header included. */
  length: number;
  sampleRate: number;
  /** Samples per frame: 1152 for MPEG-1 layer III, 576 for MPEG-2 and 2.5. */
  samples: number;
  mono: boolean;
  mpeg1: boolean;
}

/** The layer III frame header at `at`, or null when there is none there. */
export function readFrameHeader(bytes: Uint8Array, at: number): FrameHeader | null {
  if (at + 4 > bytes.length) return null;
  const b1 = bytes[at + 1];
  const b2 = bytes[at + 2];
  if (bytes[at] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 0x3;
  const layer = (b1 >> 1) & 0x3;
  if (version === 1 || layer !== 1) return null;
  const mpeg1 = version === 3;
  const kbps = (mpeg1 ? BITRATES_V1 : BITRATES_V2)[(b2 >> 4) & 0xf];
  const sampleRate = SAMPLE_RATES[version]?.[(b2 >> 2) & 0x3];
  if (!kbps || !sampleRate) return null;
  const padding = (b2 >> 1) & 0x1;
  const samples = mpeg1 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding;
  const mono = ((bytes[at + 3] >> 6) & 0x3) === 3;
  return { length, sampleRate, samples, mono, mpeg1 };
}

/** Bytes taken by an ID3v2 tag at the very start, or 0. */
function id3Size(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const footer = bytes[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

/** The frame count a Xing/Info frame declares, or null when the first frame is not one. */
function xingFrames(bytes: Uint8Array, at: number, header: FrameHeader): number | null {
  const sideInfo = header.mpeg1 ? (header.mono ? 17 : 32) : header.mono ? 9 : 17;
  const tag = at + 4 + sideInfo;
  if (tag + 12 > bytes.length) return null;
  const id = String.fromCharCode(bytes[tag], bytes[tag + 1], bytes[tag + 2], bytes[tag + 3]);
  if (id !== 'Xing' && id !== 'Info') return null;
  const flags = (bytes[tag + 4] << 24) | (bytes[tag + 5] << 16) | (bytes[tag + 6] << 8) | bytes[tag + 7];
  if (!(flags & 0x1)) return null;
  return ((bytes[tag + 8] << 24) | (bytes[tag + 9] << 16) | (bytes[tag + 10] << 8) | bytes[tag + 11]) >>> 0;
}

/** Seconds of audio in an MP3, or 0 when no frame can be found. */
export function mp3DurationSec(bytes: Uint8Array): number {
  let at = id3Size(bytes);
  // A stray byte or two before the first frame: look a little way on for it.
  const searchEnd = Math.min(bytes.length, at + 4096);
  let first: FrameHeader | null = null;
  for (; at < searchEnd; at++) {
    first = readFrameHeader(bytes, at);
    if (first && (at + first.length === bytes.length || readFrameHeader(bytes, at + first.length))) break;
    first = null;
  }
  if (!first) return 0;
  const declared = xingFrames(bytes, at, first);
  if (declared !== null) return (declared * first.samples) / first.sampleRate;
  let seconds = 0;
  while (at < bytes.length) {
    const frame = readFrameHeader(bytes, at);
    if (!frame) break;
    seconds += frame.samples / frame.sampleRate;
    at += frame.length;
  }
  return seconds;
}
