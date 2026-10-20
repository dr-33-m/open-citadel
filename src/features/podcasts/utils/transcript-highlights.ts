/**
 * Highlights on a transcript's lines. Pure.
 *
 * A highlight keeps the words and the moment of the line it was made on, not
 * the line's place in the list: the lines are cut again every time the
 * transcript is read, and a better cut must not lose anyone's highlights. So
 * each is found again by its words, the nearest copy to its moment winning
 * when a line is said twice ("Exactly.").
 */
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import type { EpisodeHighlight } from '@/services/podcasts/transcript/highlights';
import { formatClock } from '@/utils/clock';

/** How much of the talk either side of a line is kept with its highlight. */
const AROUND_LINES = 2;

type Kept = { id: string; text: string; seconds: number | null };

/** Each highlighted line's index, with the highlight on it. */
export function markedLines(lines: readonly TranscriptLine[], highlights: readonly Kept[]): Map<number, string> {
  const marked = new Map<number, string>();
  if (highlights.length === 0) return marked;
  const byText = new Map<string, TranscriptLine[]>();
  for (const line of lines) {
    const same = byText.get(line.text);
    if (same) same.push(line);
    else byText.set(line.text, [line]);
  }
  for (const highlight of highlights) {
    const candidates = byText.get(highlight.text);
    if (!candidates) continue;
    const at = highlight.seconds;
    const best =
      at === null
        ? candidates[0]
        : candidates.reduce((near, line) => (Math.abs(line.start - at) < Math.abs(near.start - at) ? line : near));
    marked.set(best.index, highlight.id);
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

/**
 * An episode's highlights as lines to draw with the transcript's own row, in
 * the order they are said: one made in the reader, with no moment, last.
 */
export function highlightLines(highlights: readonly EpisodeHighlight[]): { lines: TranscriptLine[]; byIndex: EpisodeHighlight[] } {
  const byIndex = [...highlights].sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity));
  const lines = byIndex.map((highlight, index) => ({
    index,
    segment: 0,
    start: highlight.seconds ?? 0,
    time: highlight.seconds === null ? null : formatClock(highlight.seconds),
    text: highlight.text,
    speaker: null,
    heading: null,
  }));
  return { lines, byIndex };
}

/** "1 highlight", "12 highlights". */
export function highlightsLabel(count: number): string {
  return `${count} ${count === 1 ? 'highlight' : 'highlights'}`;
}
