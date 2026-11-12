/**
 * WebVTT: cues of `start --> end` and text, a speaker given by a `<v Name>`
 * voice tag. Pure.
 */
import type { TranscriptDoc } from 'samwell-shared';

import { docFromPieces, parseClock, plainText, type Piece } from '@/services/podcasts/transcript/cues';

const TIMING = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/;

export function parseVttTranscript(body: string): TranscriptDoc | null {
  const blocks = body.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const pieces: Piece[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => TIMING.test(line));
    if (at < 0) continue;
    const [, from, to] = TIMING.exec(lines[at]) as RegExpExecArray;
    const raw = lines.slice(at + 1).join(' ');
    const voice = /<v(?:\.[^\s>]+)?\s+([^>]+)>/.exec(raw);
    pieces.push({
      start: parseClock(from) ?? 0,
      end: parseClock(to) ?? 0,
      speaker: voice ? voice[1].trim() : null,
      text: plainText(raw),
    });
  }
  const doc = docFromPieces(pieces);
  return doc.segments.length > 0 ? doc : null;
}
