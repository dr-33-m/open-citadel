/**
 * How long an MP3 plays, read from its own frame headers, and the same MP3
 * without the frames that only describe it.
 *
 * The audiobook keeps every sentence as the MP3 the voice made, and its
 * clock is the lengths of those files. Asking the native player would mean
 * loading each one; the bytes already say it. The frames are walked and
 * their samples summed, which is exact for CBR and VBR alike.
 *
 * A Xing or Info frame (what an encoder writes first) is not trusted. Kokoro's
 * maker reads a sentence a clause at a time and joins the MP3s, so a
 * sentence with a semicolon or a colon in it is two files, each with its own
 * Info frame, and the first one declares only the first clause. Believed, by
 * this clock or by Android's player (which stops where it says the audio
 * ends), it cut every such sentence off at the clause. Such a file is made
 * one (`mp3Track`): one Xing frame, true for all of it. Not none: without
 * one, Android's player guesses a VBR file's length from its first frame,
 * which is quiet and small, and waited out a sentence seven times too long.
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

/** Bytes taken by an ID3v2 tag at `at`, or 0. A file joined onto another may bring its own. */
function id3Size(bytes: Uint8Array, at = 0): number {
  if (bytes.length < at + 10 || bytes[at] !== 0x49 || bytes[at + 1] !== 0x44 || bytes[at + 2] !== 0x33) return 0;
  const size = ((bytes[at + 6] & 0x7f) << 21) | ((bytes[at + 7] & 0x7f) << 14) | ((bytes[at + 8] & 0x7f) << 7) | (bytes[at + 9] & 0x7f);
  const footer = bytes[at + 5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

/** Whether the frame at `at` is a Xing or Info frame: no audio, only what its encoder says about the file. */
function isInfoFrame(bytes: Uint8Array, at: number, header: FrameHeader): boolean {
  const sideInfo = header.mpeg1 ? (header.mono ? 17 : 32) : header.mono ? 9 : 17;
  const tag = at + 4 + sideInfo;
  if (tag + 4 > bytes.length) return false;
  const id = String.fromCharCode(bytes[tag], bytes[tag + 1], bytes[tag + 2], bytes[tag + 3]);
  return id === 'Xing' || id === 'Info';
}

/** How far on to look for the next frame past bytes that are not one. */
const RESYNC_BYTES = 4096;

/** The next frame at or after `from` that another frame follows (or that ends the file), or -1. */
function nextFrame(bytes: Uint8Array, from: number): number {
  const end = Math.min(bytes.length, from + RESYNC_BYTES);
  for (let at = from; at < end; at++) {
    const frame = readFrameHeader(bytes, at);
    if (frame && (at + frame.length >= bytes.length || readFrameHeader(bytes, at + frame.length))) return at;
  }
  return -1;
}

interface Walk {
  seconds: number;
  /** The byte ranges of the audio frames, in order. */
  kept: [number, number][];
  /** The first Xing or Info frame, the one a rewritten file keeps. */
  info: { start: number; header: FrameHeader } | null;
  infoFrames: number;
  /** Joined-on tags and stray bytes passed over. */
  foreign: number;
}

function walk(bytes: Uint8Array): Walk {
  const result: Walk = { seconds: 0, kept: [], info: null, infoFrames: 0, foreign: 0 };
  let at = nextFrame(bytes, id3Size(bytes));
  if (at < 0) return result;
  while (at < bytes.length) {
    const tag = id3Size(bytes, at);
    if (tag > 0) {
      result.foreign += 1;
      at += tag;
      continue;
    }
    const frame = readFrameHeader(bytes, at);
    if (!frame) {
      const next = nextFrame(bytes, at + 1);
      if (next < 0) break;
      result.foreign += 1;
      at = next;
      continue;
    }
    if (isInfoFrame(bytes, at, frame)) {
      result.infoFrames += 1;
      result.info ??= { start: at, header: frame };
    } else {
      result.seconds += frame.samples / frame.sampleRate;
      result.kept.push([at, Math.min(at + frame.length, bytes.length)]);
    }
    at += frame.length;
  }
  return result;
}

/** Seconds of audio in an MP3, or 0 when no frame can be found. */
export function mp3DurationSec(bytes: Uint8Array): number {
  return walk(bytes).seconds;
}

/**
 * A Xing frame that tells the truth about `frames` audio frames in `total`
 * bytes (itself included), on the first Info frame's own header: the frame
 * count, the byte count and, where the frame has room, a seek table, so a
 * player knows the length and can seek within it. Everything else in the
 * frame (the encoder's notes about the first part only) is zeroed.
 */
function truthfulXing(bytes: Uint8Array, info: { start: number; header: FrameHeader }, offsets: number[], total: number): Uint8Array {
  const { header } = info;
  const frame = bytes.slice(info.start, info.start + header.length);
  const tag = 4 + (header.mpeg1 ? (header.mono ? 17 : 32) : header.mono ? 9 : 17);
  frame.fill(0, 4);
  const withToc = tag + 16 + 100 <= frame.length;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  frame.set([0x58, 0x69, 0x6e, 0x67], tag); // 'Xing'
  view.setUint32(tag + 4, withToc ? 0x7 : 0x3);
  view.setUint32(tag + 8, offsets.length);
  view.setUint32(tag + 12, total);
  if (withToc) {
    for (let i = 0; i < 100; i++) {
      const at = header.length + offsets[Math.floor((i / 100) * offsets.length)];
      frame[tag + 16 + i] = Math.min(255, Math.floor((at / total) * 256));
    }
  }
  return frame;
}

export interface Mp3Track {
  /** The file made one (`truthfulXing`), or null when it is one already. */
  mended: Uint8Array | null;
  /** Seconds of audio in it. */
  seconds: number;
}

/**
 * An MP3 as a track, in one walk of its frames: its length, and the file
 * made one when it is several joined (one Info frame at most and nothing
 * between its frames is one already): its audio frames behind a single Xing
 * frame that counts them all.
 */
export function mp3Track(bytes: Uint8Array): Mp3Track {
  const { seconds, kept, info, infoFrames, foreign } = walk(bytes);
  if (kept.length === 0 || (infoFrames <= 1 && foreign === 0)) return { mended: null, seconds };
  const offsets: number[] = [];
  let audio = 0;
  for (const [from, to] of kept) {
    offsets.push(audio);
    audio += to - from;
  }
  const lead = info ? truthfulXing(bytes, info, offsets, info.header.length + audio) : new Uint8Array(0);
  const mended = new Uint8Array(lead.length + audio);
  mended.set(lead, 0);
  let at = lead.length;
  for (const [from, to] of kept) {
    mended.set(bytes.subarray(from, to), at);
    at += to - from;
  }
  return { mended, seconds };
}
