/**
 * Where a highlight lifted from a podcast transcript sits, as a Readium
 * locator into the episode's book. Pure.
 *
 * It carries two places at once: the paragraph in the book (`#s12`, which
 * the reader scrolls to and marks), and the moment in the audio, as the
 * media fragment Readium's own audiobook locators use (`t=754.2`). So the
 * same row opens in the reader like any book's highlight, and plays from its
 * moment anywhere the app knows it is an episode's.
 */
import type { TranscriptDoc } from 'samwell-shared';

import { episodeParts, partFile, type EpisodeEpubInput } from '@/services/podcasts/transcript/episode-epub';
import { locatorSeconds } from '@/utils/locator-time';

export type EpisodeHighlightPlace = {
  /** The transcript block the words come from. */
  segment: number;
  /** Seconds into the episode where they start; null in a transcript without times. */
  seconds: number | null;
  text: string;
  before?: string;
  after?: string;
};

export type EpisodeHighlightLocator = {
  href: string;
  type: 'application/xhtml+xml';
  title?: string;
  locations: { progression: number; fragments: string[]; cssSelector: string };
  text: { before?: string; highlight: string; after?: string };
};

/** The locator for a line of an episode's transcript, and the title of the part it falls in. */
export function episodeHighlightLocator(
  doc: TranscriptDoc,
  chapters: EpisodeEpubInput['chapters'],
  place: EpisodeHighlightPlace,
): { locator: EpisodeHighlightLocator; chapter: string | null } {
  const parts = episodeParts(doc, chapters);
  const at = Math.max(
    0,
    parts.findIndex((part) => part.segments.includes(place.segment)),
  );
  const part = parts[at];
  const anchor = `s${place.segment}`;
  return {
    locator: {
      href: `OEBPS/${partFile(at)}`,
      type: 'application/xhtml+xml',
      title: part?.title,
      locations: { progression: 0, fragments: place.seconds === null ? [anchor] : [anchor, `t=${place.seconds.toFixed(1)}`], cssSelector: `#${anchor}` },
      text: { before: place.before, highlight: place.text, after: place.after },
    },
    chapter: part?.title ?? null,
  };
}

/** The moment a stored highlight's locator plays from, or null when it carries none (a book's highlight, a bad row). */
export function highlightSeconds(locator: string | null): number | null {
  if (!locator) return null;
  try {
    return locatorSeconds(JSON.parse(locator));
  } catch {
    return null;
  }
}

/** Spaces as one, for finding the same words however a transcript spaced them. */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A transcript's blocks with their spacing evened out, made once for every highlight looked for in it. */
export function segmentWords(doc: TranscriptDoc): string[] {
  return doc.segments.map((segment) => squash(segment.text));
}

/**
 * Where a highlight's words are in a transcript made again: the block that
 * holds them and the moment its first word is spoken, nearest `near` (its old
 * moment) when the words come more than once. Null when the new transcript
 * does not have them word for word, and the highlight is then left as it was.
 * `words` is `segmentWords(doc)`.
 */
export function placeOfWords(
  doc: TranscriptDoc,
  words: readonly string[],
  highlighted: string,
  near: number | null,
): { segment: number; seconds: number | null } | null {
  const wanted = squash(highlighted);
  if (!wanted) return null;
  let best: { segment: number; seconds: number | null } | null = null;
  words.forEach((text, index) => {
    const at = text.indexOf(wanted);
    if (at < 0) return;
    const segment = doc.segments[index]!;
    // The word it starts on, by the spaces before it, and that word's time.
    const word = at === 0 ? 0 : text.slice(0, at).split(' ').length - (text[at - 1] === ' ' ? 1 : 0);
    const offset = segment.words?.[word];
    const seconds = segment.end > 0 ? segment.start + (offset !== undefined ? offset / 100 : 0) : null;
    const closer = best === null || (near !== null && seconds !== null && best.seconds !== null && Math.abs(seconds - near) < Math.abs(best.seconds - near));
    if (closer) best = { segment: index, seconds };
  });
  return best;
}
