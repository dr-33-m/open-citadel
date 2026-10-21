/**
 * A made sentence as a file the native player can open, and how long it
 * plays.
 *
 * Every voice answers MP3 to the audiobook (the server encodes for those that
 * only make PCM), so the cached piece is the track itself and its length is
 * read from its own frames. An older server may still answer PCM: that is
 * wrapped in a WAV header once, beside the cache, so the book plays anyway.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { pieceFileUri, type PieceFile } from '@/services/cloud-tts/audio-cache';
import { mp3DurationSec } from '@/utils/mp3-duration';

export interface TrackFile {
  uri: string;
  mimeType: string;
  seconds: number;
}

function wavFolder(): Directory {
  const folder = new Directory(Paths.cache, 'audiobook', 'wav');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return folder;
}

/** A 44-byte header for 16-bit PCM of this shape and length. */
function wavHeader(dataBytes: number, sampleRate: number, channels: number): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  return header;
}

async function wavFrom(key: string, piece: PieceFile): Promise<TrackFile> {
  const wav = new File(wavFolder(), `${key}.wav`);
  if (!wav.exists) {
    const pcm = await new File(piece.uri).bytes();
    const joined = new Uint8Array(44 + pcm.length);
    joined.set(wavHeader(pcm.length, piece.sampleRate, piece.channels), 0);
    joined.set(pcm, 44);
    wav.write(joined);
  }
  return { uri: wav.uri, mimeType: 'audio/wav', seconds: piece.bytes / (piece.sampleRate * piece.channels * 2) };
}

/** The track for a cached piece, or null when it has left the cache. */
export async function trackFile(key: string): Promise<TrackFile | null> {
  const piece = await pieceFileUri(key);
  if (!piece) return null;
  if (piece.kind === 'pcm') return wavFrom(key, piece);
  const seconds = mp3DurationSec(await new File(piece.uri).bytes());
  return { uri: piece.uri, mimeType: 'audio/mpeg', seconds };
}

/** WAV copies made for an older server's PCM: they are only needed while the book plays. */
export function clearWavCopies(): void {
  try {
    const folder = new Directory(Paths.cache, 'audiobook', 'wav');
    if (folder.exists) folder.delete();
  } catch {
    // Left for the OS to clear with the rest of the cache.
  }
}
