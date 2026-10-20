/**
 * Which of a feed's `<podcast:transcript>` files to keep. Pure.
 *
 * A show may publish the same transcript several ways. The richest wins:
 * JSON (timed, speakers named per phrase), then WebVTT (timed, `<v>` voices),
 * then SRT (timed, speakers only by a "Name:" habit), then HTML or plain text
 * (often untimed).
 */
export type FeedTranscriptFormat = 'json' | 'vtt' | 'srt' | 'html' | 'text';

const RANK: Record<FeedTranscriptFormat, number> = { json: 0, vtt: 1, srt: 2, html: 3, text: 4 };

/** The format a transcript's MIME type (or, failing that, its file name) names. */
export function transcriptFormat(type: string | null | undefined, url?: string | null): FeedTranscriptFormat | null {
  const mime = (type ?? '').toLowerCase().split(';')[0].trim();
  if (mime.includes('json')) return 'json';
  if (mime.includes('vtt')) return 'vtt';
  if (mime.includes('srt') || mime.includes('subrip')) return 'srt';
  if (mime.includes('html')) return 'html';
  if (mime === 'text/plain') return 'text';
  const ext = (url ?? '').split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'vtt') return 'vtt';
  if (ext === 'srt') return 'srt';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'txt') return 'text';
  return null;
}

/** The richest transcript a feed lists, or null when it lists none with a URL. */
export function bestTranscript<T extends { url: string | null; type: string | null }>(list: readonly T[]): T | null {
  let best: T | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const item of list) {
    if (!item.url) continue;
    const format = transcriptFormat(item.type, item.url);
    const rank = format ? RANK[format] : 5;
    if (rank < bestRank) {
      best = item;
      bestRank = rank;
    }
  }
  return best;
}
