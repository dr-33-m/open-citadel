/**
 * Reading an HTTP `Range` header against a file of known size.
 *
 * iOS plays a URL through AVPlayer, which opens a WAV file by asking for its
 * first two bytes and gives up unless the answer is a 206 with that slice. An
 * MP3 it will read as a plain stream, which is why the Gemini samples (WAV)
 * stayed silent on iPhones while the Kokoro and ElevenLabs ones (MP3) played.
 * Android reads straight through and never asked.
 *
 * One range only, which is all a media player asks for. A header this does
 * not understand (several ranges, another unit) is answered with the whole
 * file, as the spec allows.
 */

export type ByteRange = { start: number; end: number };

/** The slice asked for, `'unsatisfiable'` for a range past the end, or null for the whole file. */
export function parseByteRange(header: string | null | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from, to] = match;
  if (from === '' && to === '') return null;

  if (from === '') {
    // The last `to` bytes.
    const length = Number(to);
    if (length === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(from);
  if (start >= size) return 'unsatisfiable';
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (end < start) return null;
  return { start, end };
}
