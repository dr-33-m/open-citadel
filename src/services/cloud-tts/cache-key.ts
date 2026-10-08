/**
 * What a piece of audio is stored under on the phone.
 *
 * Book, text, model and voice, and the speed only when the maker applies it
 * (otherwise the same audio would be stored once per speed for nothing). So a
 * chapter read again, or a sentence gone back to, is played from the phone
 * and costs nothing.
 *
 * cyrb53 rather than a cryptographic hash: this names a file, it guards
 * nothing, and it has to be synchronous and cheap on every sentence. 53 bits
 * over a few hundred thousand pieces makes a collision vanishingly unlikely,
 * and the text's length is folded in as well.
 */
import { normaliseUtterance } from '@/services/cloud-tts/sentences';

function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export interface PieceIdentity {
  bookId: string;
  modelId: string;
  voice: string;
  /** Null when the maker ignores speed. */
  speed: number | null;
  text: string;
}

export function pieceCacheKey(piece: PieceIdentity): string {
  const text = normaliseUtterance(piece.text);
  const material = [piece.bookId, piece.modelId, piece.voice, piece.speed ?? '', text].join('\u0000');
  return `${cyrb53(material).toString(36)}-${text.length.toString(36)}`;
}
