import { resolveReadCutoff, type SpineLocator } from '@/services/epub-spine';

/** A section's place and size, as the index keeps it. */
export interface SectionShape {
  index: number;
  href: string;
  /** Length of the section's paragraphs joined, which a paragraph's `start` counts into. */
  chars: number;
}

/**
 * How far into a book the reader has got: every section before `lastSection`
 * whole, `lastSection` up to `lastSectionChars`, nothing after it. A book with
 * no saved position has nothing readable (fail closed, never open).
 */
export interface ReadableExtent {
  /** -1 when nothing has been read. */
  lastSection: number;
  /** Infinity when the last section is read to its end. */
  lastSectionChars: number;
}

export const NOTHING_READ: ReadableExtent = { lastSection: -1, lastSectionChars: 0 };

/**
 * The spoiler boundary from a reader's position: `null` for a book read to
 * the end (or a post, which has no plot to spoil), `undefined` for one with
 * no position at all. The cut inside the current section is by its share of
 * characters, as the reader's own progression is.
 */
export function readableExtent(sections: readonly SectionShape[], locator: SpineLocator | null | undefined): ReadableExtent {
  if (locator === undefined || sections.length === 0) return NOTHING_READ;
  const ordered = [...sections].sort((a, b) => a.index - b.index);
  if (locator === null) return { lastSection: ordered[ordered.length - 1].index, lastSectionChars: Infinity };
  const { cutoffIndex, progression } = resolveReadCutoff(
    ordered.map((section) => section.href),
    locator,
  );
  if (cutoffIndex < 0) return NOTHING_READ;
  const section = ordered[cutoffIndex];
  return {
    lastSection: section.index,
    lastSectionChars: progression >= 1 ? Infinity : Math.floor(section.chars * Math.max(0, progression)),
  };
}

/**
 * What of one paragraph the reader has reached: all of it, the part before
 * their position, or null for none of it.
 */
export function readablePart(extent: ReadableExtent, section: number, start: number, text: string): string | null {
  if (section < extent.lastSection) return text;
  if (section > extent.lastSection) return null;
  if (start >= extent.lastSectionChars) return null;
  const allowed = extent.lastSectionChars - start;
  return allowed >= text.length ? text : text.slice(0, allowed);
}

/** A section as far as the boundary decisions need it. */
export interface SectionEntry extends SectionShape {
  title: string | null;
  frontMatter: boolean;
}

/** The sections the reader has reached, front matter left out. */
export function reachedSections<T extends SectionEntry>(sections: readonly T[], extent: ReadableExtent): T[] {
  return sections.filter((section) => !section.frontMatter && section.index <= extent.lastSection);
}

/** Which section a reference names: its number, its exact title, or part of its title. */
export function pickSection<T extends SectionEntry>(sections: readonly T[], reference: string): T | null {
  const wanted = reference.trim().toLowerCase();
  const asNumber = /^\d+$/.test(wanted) ? Number.parseInt(wanted, 10) : null;
  return (
    (asNumber !== null ? sections.find((section) => section.index === asNumber) : undefined) ??
    sections.find((section) => section.title?.toLowerCase() === wanted) ??
    sections.find((section) => !!wanted && section.title?.toLowerCase().includes(wanted)) ??
    null
  );
}
