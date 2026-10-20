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

const TIME = /^t=(\d+(?:\.\d+)?)$/;

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

/** The moment a highlight's locator plays from, or null when it carries none (a book's highlight, a bad row). */
export function highlightSeconds(locator: string | null): number | null {
  if (!locator) return null;
  try {
    const fragments: unknown = JSON.parse(locator)?.locations?.fragments;
    if (!Array.isArray(fragments)) return null;
    for (const fragment of fragments) {
      const match = typeof fragment === 'string' ? TIME.exec(fragment) : null;
      if (match) return Number(match[1]);
    }
    return null;
  } catch {
    return null;
  }
}
