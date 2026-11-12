/**
 * SRT: numbered cues of `start --> end` and text. A speaker is only a habit
 * here ("SPEAKER_00: Hey"), written at the start of a turn and holding until
 * the next, so a named speaker carries forward. Pure.
 */
import type { TranscriptDoc } from 'samwell-shared';

import { docFromPieces, parseClock, plainText, speakerPrefixes, splitPrefix, type Piece } from '@/services/podcasts/transcript/cues';

const TIMING = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/;

export function parseSrtTranscript(body: string): TranscriptDoc | null {
  const cues = body
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      const at = lines.findIndex((line) => TIMING.test(line));
      if (at < 0) return null;
      const [, from, to] = TIMING.exec(lines[at]) as RegExpExecArray;
      return { start: parseClock(from) ?? 0, end: parseClock(to) ?? 0, text: plainText(lines.slice(at + 1).join(' ')) };
    })
    .filter((cue): cue is { start: number; end: number; text: string } => cue != null && cue.text !== '');

  const known = speakerPrefixes(cues.map((cue) => cue.text));
  let speaker: string | null = null;
  const pieces: Piece[] = cues.map((cue) => {
    const split = splitPrefix(cue.text, known);
    if (split.speaker) speaker = split.speaker;
    return { start: cue.start, end: cue.end, speaker, text: split.text };
  });
  const doc = docFromPieces(pieces);
  return doc.segments.length > 0 ? doc : null;
}
