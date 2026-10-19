/**
 * The words a chat about a podcast episode opens with. Pure; `episode-chat.ts`
 * reads the episode and calls this.
 */
import type { TranscriptDoc } from 'samwell-shared';

import { formatClock } from '@/utils/clock';

/** The same budget a post gets, so the smallest on-device model still fits. */
export const EPISODE_CONTEXT_CHARS = 6000;

export type EpisodeChatInput = {
  title: string;
  showTitle: string;
  durationSec: number;
  chapters: { startSec: number; title: string }[];
  positionSec: number;
  doc: TranscriptDoc | null;
};

/** The transcript as Samwell reads it: `[12:04] Lex Fridman: words`, one line a segment. */
export function transcriptLines(doc: TranscriptDoc, maxChars: number): { text: string; cut: boolean } {
  let text = '';
  for (const segment of doc.segments) {
    const name = segment.speaker != null ? doc.speakers[segment.speaker] : null;
    const time = segment.end > 0 || segment.start > 0 ? `[${formatClock(segment.start)}] ` : '';
    const line = `${time}${name ? `${name}: ` : ''}${segment.text}\n`;
    if (text.length + line.length > maxChars) return { text: text || line.slice(0, maxChars), cut: true };
    text += line;
  }
  return { text, cut: false };
}

/** The opening instruction for a chat about an episode. Pure. */
export function episodeChatPrompt(input: EpisodeChatInput): string {
  const length = input.durationSec > 0 ? ` (${formatClock(input.durationSec)} long)` : '';
  const lines = [
    `You are discussing the podcast episode "${input.title}" from "${input.showTitle}"${length}. Help the user understand it, question it, and apply it. Be concise and insightful.`,
  ];
  if (input.chapters.length > 0) {
    lines.push(`Its chapters:\n${input.chapters.map((c) => `${formatClock(c.startSec)} ${c.title}`).join('\n')}`);
  }
  if (input.positionSec > 0) {
    lines.push(
      `They are at ${formatClock(input.positionSec)} in it. You may discuss any part of the episode; when it helps, say that they have not reached a part yet.`,
    );
  }
  lines.push(
    'Cite moments by their time in square brackets, like [12:04] or [1:02:10], taken from the transcript: the listener can tap one to play it.',
  );
  if (input.doc) {
    const { text, cut } = transcriptLines(input.doc, EPISODE_CONTEXT_CHARS);
    lines.push(
      `Here is the transcript${cut ? ', up to where it continues' : ''}:\n\n${text.trim()}` +
        (cut ? `\n\nFor the rest, use search_reading and read_chapter with book_title "${input.title}".` : ''),
    );
  }
  return lines.join('\n\n');
}
