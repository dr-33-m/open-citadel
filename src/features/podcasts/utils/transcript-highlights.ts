/**
 * Highlights on a transcript's lines. Pure.
 *
 * A highlight keeps the words and the moment of the line it was made on, not
 * the line's place in the list: the lines are cut again every time the
 * transcript is read, and a better cut must not lose anyone's highlights. So
 * each is found again by its words, the nearest copy to its moment winning
 * when a line is said twice ("Exactly."), and closely enough rather than
 * word for word, over as many lines as it now takes, for a transcript made
 * again (`passage-match.ts`).
 */
import { findPassage, PassageIndex } from '@/features/podcasts/utils/passage-match';
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { DEFAULT_HIGHLIGHT_COLOR } from '@/constants/highlights';
import { highlightSeconds } from '@/services/podcasts/transcript/highlight-locator';

/** How much of the talk either side of a line is kept with its highlight. */
const AROUND_LINES = 2;

type Kept = { id: string; text: string; locator: string | null; color: string | null };
export type Mark = { id: string; color: string };

/** Each highlighted line's index, with the highlight on it and its colour. */
export function markedLines(lines: readonly TranscriptLine[], highlights: readonly Kept[]): Map<number, Mark> {
  const marked = new Map<number, Mark>();
  if (highlights.length === 0) return marked;
  const index = new PassageIndex(lines);
  for (const highlight of highlights) {
    const at = highlightSeconds(highlight.locator);
    // Near its moment only: a transcript made again has already looked
    // everywhere and moved it there, and the whole of a long one is too much
    // to read through on every draw. Word for word or not, the same rule:
    // the same words said elsewhere ("Right.") are another line.
    const found = findPassage(index, highlight.text, at, { nearOnly: at !== null });
    if (!found) continue;
    const mark = { id: highlight.id, color: highlight.color || DEFAULT_HIGHLIGHT_COLOR };
    for (let line = found.first; line <= found.last; line++) marked.set(line, mark);
  }
  return marked;
}

/** The lines either side of one, as a highlight's `before` and `after`. */
export function lineSurrounding(lines: readonly TranscriptLine[], index: number): { before?: string; after?: string } {
  const join = (from: number, to: number) =>
    lines
      .slice(Math.max(0, from), Math.max(0, to))
      .map((line) => line.text)
      .join(' ') || undefined;
  return { before: join(index - AROUND_LINES, index), after: join(index + 1, index + 1 + AROUND_LINES) };
}

/** "1 highlight", "12 highlights". */
export function highlightsLabel(count: number): string {
  return `${count} ${count === 1 ? 'highlight' : 'highlights'}`;
}
