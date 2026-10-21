/**
 * The book as the audiobook reads it: its sections from the text index, and
 * each section's sentences, made on demand.
 *
 * Never the whole book at once (a long book is about nine thousand
 * sentences): a section is cut when listening reaches it, and the few in
 * hand are kept, cut as `scriptSentences` cuts them.
 */
import type { ClockSection } from '@/features/audiobook/utils/book-clock';
import { scriptSentences, type ScriptParagraph, type Sentence } from '@/features/audiobook/utils/sentences-of';
import type { BookRow } from '@/services/book-text/book-row';
import { bookTextDriver } from '@/services/book-text/driver';
import { ensureIndexed } from '@/services/book-text/indexer';
import { paragraphsOf, sectionsOf, type StoredSection } from '@/services/book-text/store';

/** Every paragraph of a section, however long. */
const ALL_PARAGRAPHS = 1_000_000;
/** Sections kept cut in memory: the one playing, either side, and a jump or two. */
const KEEP_SECTIONS = 6;

export interface SectionScript {
  section: StoredSection;
  paragraphs: ScriptParagraph[];
  sentences: Sentence[];
}

export class BookScript {
  private readonly cut = new Map<number, SectionScript>();

  constructor(
    readonly bookId: string,
    /** Every section, front matter included: what a place and a share of the book are measured against. */
    readonly sections: readonly StoredSection[],
  ) {}

  /** The sections read aloud, in order: front matter and empty ones are passed over. */
  get listened(): StoredSection[] {
    const body = this.sections.filter((s) => !s.frontMatter && s.chars > 0);
    return body.length > 0 ? body : this.sections.filter((s) => s.chars > 0);
  }

  /** The listened sections as the clock lays them out. */
  get clockSections(): ClockSection[] {
    return this.listened.map((s) => ({ index: s.index, chars: s.chars, paragraphs: s.paragraphs }));
  }

  section(index: number): StoredSection | null {
    return this.sections.find((s) => s.index === index) ?? null;
  }

  /** The listened section after this one, or null at the end of the book. */
  nextSection(index: number): StoredSection | null {
    return this.listened.find((s) => s.index > index) ?? null;
  }

  /** The listened section before this one, or null at the start. */
  previousSection(index: number): StoredSection | null {
    return [...this.listened].reverse().find((s) => s.index < index) ?? null;
  }

  /** A section's sentences if they are already cut, without waiting. */
  peek(index: number): SectionScript | null {
    return this.cut.get(index) ?? null;
  }

  /** The sections cut so far, for the clock to sum exactly. */
  cutSentences(): Map<number, Sentence[]> {
    return new Map([...this.cut].map(([index, script]) => [index, script.sentences]));
  }

  /** A section's paragraphs and sentences, read from the index the first time. */
  async load(index: number): Promise<SectionScript | null> {
    const kept = this.cut.get(index);
    if (kept) {
      // Most recently used last, so the oldest is the one let go.
      this.cut.delete(index);
      this.cut.set(index, kept);
      return kept;
    }
    const section = this.section(index);
    if (!section) return null;
    const paragraphs = await paragraphsOf(await bookTextDriver(), this.bookId, index, 1, ALL_PARAGRAPHS);
    const script = { section, paragraphs, sentences: scriptSentences(paragraphs) };
    this.cut.set(index, script);
    while (this.cut.size > KEEP_SECTIONS) this.cut.delete(this.cut.keys().next().value as number);
    return script;
  }
}

/** A book's script, indexing the book first if it must. Null when its text cannot be read. */
export async function loadScript(book: Pick<BookRow, 'id' | 'filePath'>): Promise<BookScript | null> {
  if (!(await ensureIndexed(book))) return null;
  const sections = await sectionsOf(await bookTextDriver(), book.id);
  return sections.some((s) => s.chars > 0) ? new BookScript(book.id, sections) : null;
}
