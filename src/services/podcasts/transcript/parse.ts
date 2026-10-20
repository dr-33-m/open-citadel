/**
 * A feed transcript's text to a `TranscriptDoc`, by the format the feed named
 * or, when it named none or named it wrong, the one the body looks like. Pure.
 */
import type { TranscriptDoc } from 'samwell-shared';

import type { FeedTranscriptFormat } from '@/services/podcasts/transcript/formats';
import { parseHtmlTranscript, parsePlainTranscript } from '@/services/podcasts/transcript/parse-text';
import { parseJsonTranscript } from '@/services/podcasts/transcript/parse-json';
import { parseSrtTranscript } from '@/services/podcasts/transcript/parse-srt';
import { parseVttTranscript } from '@/services/podcasts/transcript/parse-vtt';

export function sniffTranscriptFormat(body: string): FeedTranscriptFormat {
  const head = body.trimStart().slice(0, 200);
  if (head.startsWith('WEBVTT')) return 'vtt';
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  if (/^\d+\s*\n\s*[\d:,]+\s+-->/.test(head)) return 'srt';
  if (head.startsWith('<')) return 'html';
  return 'text';
}

const PARSERS: Record<FeedTranscriptFormat, (body: string) => TranscriptDoc | null> = {
  json: parseJsonTranscript,
  vtt: parseVttTranscript,
  srt: parseSrtTranscript,
  html: parseHtmlTranscript,
  text: parsePlainTranscript,
};

export function parseFeedTranscript(body: string, named: FeedTranscriptFormat | null): TranscriptDoc | null {
  const sniffed = sniffTranscriptFormat(body);
  const first = named ? PARSERS[named](body) : null;
  if (first) return first;
  return named === sniffed ? null : PARSERS[sniffed](body);
}
