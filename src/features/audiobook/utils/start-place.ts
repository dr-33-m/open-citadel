/**
 * Where listening starts, from the book's saved place.
 *
 * The saved locator is placed in the index the way the spoiler boundary
 * places it (`resolveReadCutoff`): a section, and a share of its characters.
 * Listening starts at the first sentence that begins there or after it. A
 * book with no saved place, or one left in its front matter, starts at the
 * first section that is not front matter.
 *
 * Pure, so it can be tested on its own.
 */
import type { Sentence } from '@/features/audiobook/utils/sentences-of';
import { resolveReadCutoff, type SpineLocator } from '@/services/epub-spine';

export interface PlaceSection {
  index: number;
  href: string;
  chars: number;
  frontMatter: boolean;
}

/** A section, by its index, and a character offset into it. */
export interface Place {
  section: number;
  offset: number;
}

/** The first section read aloud, or null for a book with none. */
export function firstListenedSection(sections: readonly PlaceSection[]): number | null {
  return (sections.find((s) => !s.frontMatter) ?? sections[0])?.index ?? null;
}

export function startPlace(sections: readonly PlaceSection[], locator: SpineLocator | null | undefined): Place | null {
  const first = firstListenedSection(sections);
  if (first === null) return null;
  if (!locator) return { section: first, offset: 0 };
  const { cutoffIndex, progression } = resolveReadCutoff(
    sections.map((s) => s.href),
    locator,
  );
  const section = sections[cutoffIndex];
  if (!section) return { section: first, offset: 0 };
  if (section.frontMatter) {
    const body = sections.find((s, i) => i > cutoffIndex && !s.frontMatter);
    return { section: body?.index ?? first, offset: 0 };
  }
  return { section: section.index, offset: Math.max(0, Math.floor(section.chars * Math.min(1, Math.max(0, progression)))) };
}

/** The first sentence that begins at or after `offset`, or -1 when the section has none past it. */
export function startIndex(script: readonly Sentence[], offset: number): number {
  return script.findIndex((sentence) => sentence.offset >= offset);
}

/** Which way `to` lies from `from` in reading order: 1 further on, -1 further back, 0 at the same place. */
export function directionTo(from: Place, to: Place): -1 | 0 | 1 {
  if (to.section !== from.section) return to.section > from.section ? 1 : -1;
  if (to.offset === from.offset) return 0;
  return to.offset > from.offset ? 1 : -1;
}
