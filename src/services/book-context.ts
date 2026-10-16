import { findEntry, openEpub, opfFolder, opfPathOf, type EpubArchive } from '@/services/book-text/archive';
import { parseOpfMetadata, type EpubMetadata } from '@/services/epub-metadata';
import {
  isFrontMatterHref,
  parseNavHref,
  parseSpine,
  resolveBodyStart,
  resolveReadCutoff,
} from '@/services/epub-spine';

interface Locator {
  href: string;
  locations?: {
    progression?: number;
    position?: number;
    totalProgression?: number;
  };
}

function stripHtml(html: string): string {
  // Remove script/style blocks first, then all tags
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The section's own heading, for labelling a passage with where it came from.
 * `<title>` is the most reliable and is what readers see in a TOC; a leading
 * `<h1>`/`<h2>` is the fallback for books that leave `<title>` generic.
 */
function extractSectionTitle(html: string): string | null {
  const heading =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1];
  if (!heading) return null;
  const text = stripHtml(heading);
  return text.length > 0 && text.length <= 120 ? text : null;
}

async function findOpfPath(archive: EpubArchive): Promise<string> {
  const opfPath = await opfPathOf(archive);
  if (!opfPath) throw new Error('No OPF path in container.xml');
  return opfPath;
}

/**
 * One chapter's text, by the reader's locator. Reads the archive's directory,
 * its package file and that chapter, and nothing else of the book
 * (`openEpub`): it runs every time a highlight is made and every time a chat
 * opens on a passage.
 */
async function loadChapterText(filePath: string, locator: Locator): Promise<string> {
  const archive = await openEpub(filePath);
  const basePath = opfFolder(await findOpfPath(archive));
  const entry = findEntry(archive, locator.href, basePath);
  const html = entry ? await archive.text(entry) : null;
  if (html == null) throw new Error(`Chapter not found: ${locator.href}`);
  return stripHtml(html);
}

/**
 * Extracts plain text from an EPUB chapter up to the given locator progression.
 * Falls back to the full chapter text if progression is unavailable.
 * Returns at most `maxChars` characters (the text immediately before the selection).
 */
export async function extractChapterTextToLocator(
  filePath: string,
  locator: Locator,
  maxChars = 3000,
): Promise<string> {
  const text = await loadChapterText(filePath, locator);

  const progression = locator.locations?.progression ?? 1;
  const sliceEnd = Math.floor(text.length * progression);
  const sliced = text.slice(0, sliceEnd);

  // Return the last `maxChars` chars so the LLM gets the most relevant passage
  return sliced.length > maxChars ? sliced.slice(sliced.length - maxChars) : sliced;
}

/**
 * Extracts the chapter text surrounding the locator position — what came just
 * before and what follows. Captured once at highlight time so a highlight
 * keeps the progression it was lifted from (chats, tags, and Compass all
 * lose meaning without it).
 */
export async function extractSurroundingText(
  filePath: string,
  locator: Locator,
  beforeChars = 600,
  afterChars = 600,
): Promise<{ before: string; after: string }> {
  const text = await loadChapterText(filePath, locator);

  const progression = locator.locations?.progression ?? 1;
  const anchor = Math.floor(text.length * progression);
  return {
    before: text.slice(Math.max(0, anchor - beforeChars), anchor).trim(),
    after: text.slice(anchor, anchor + afterChars).trim(),
  };
}

// ── Whole-book reading, spoiler-bounded ──────────────────────────────────────

/**
 * Extracts the plain text a reader has ALREADY read from an EPUB, in reading
 * order, and never a word beyond their position:
 *  - chapters before the current one → full text
 *  - the current chapter → sliced to the locator's within-chapter progression
 *  - chapters after → excluded entirely (spoiler-safe at the data layer)
 *
 * Pass `locator = null` for a fully-read (archived) book to get the whole text.
 * The EPUB is opened once, and only its chapters are read. Result is capped at `maxChars`. The reading-order
 * and cutoff logic lives in the pure `epub-spine` module.
 */
export interface ReadSection {
  /** Position in the spine, i.e. reading order. */
  index: number;
  href: string;
  /** The section's heading, where the book provides one. */
  title: string | null;
  text: string;
  /** Front matter: cover, title page, copyright, contents and the like. */
  frontMatter: boolean;
  /** The section the reader is partway through — cut at their position. */
  partial: boolean;
}

/**
 * The read portion of a book, kept in its own sections rather than flattened.
 *
 * Same spoiler boundary as {@link extractReadText}, but preserving the
 * structure the EPUB already describes: which section each passage belongs
 * to, what it is called, and whether it is front matter. A caller searching
 * for a passage can then skip the jacket copy and say which chapter a quote
 * came from, neither of which is recoverable once the book is one string.
 */
export async function extractReadSections(
  filePath: string,
  locator: Locator | null,
  maxChars = 200_000,
): Promise<ReadSection[]> {
  const archive = await openEpub(filePath);
  const opfPath = await findOpfPath(archive);
  const basePath = opfFolder(opfPath);
  const opfContent = await archive.text(opfPath);
  if (!opfContent) throw new Error('No OPF content');

  const spine = parseSpine(opfContent, basePath);
  if (spine.length === 0) throw new Error('Empty spine');

  const { cutoffIndex, progression } = resolveReadCutoff(spine, locator);

  const readZipHtml = async (path: string): Promise<string> => {
    const entry = findEntry(archive, path, '');
    return entry ? ((await archive.text(entry)) ?? '') : '';
  };

  const navHref = parseNavHref(opfContent, basePath);
  const navContent = navHref ? await readZipHtml(navHref) : null;
  const bodyStart = resolveBodyStart(opfContent, spine, navContent);

  const sections: ReadSection[] = [];
  let budget = maxChars;

  for (let i = 0; i <= cutoffIndex && budget > 0; i++) {
    const html = await readZipHtml(spine[i]);
    if (!html) continue;

    let text = stripHtml(html);
    const partial = i === cutoffIndex && progression < 1;
    if (partial) text = text.slice(0, Math.floor(text.length * progression));
    if (!text) continue;

    text = text.slice(0, budget);
    budget -= text.length;

    sections.push({
      index: i,
      href: spine[i],
      title: extractSectionTitle(html),
      text,
      // Before the declared start of the body, or named like front matter
      // even after it — some books put acknowledgements mid-stream.
      frontMatter: i < bodyStart || isFrontMatterHref(spine[i]),
      partial,
    });
  }

  return sections;
}

export async function extractReadText(
  filePath: string,
  locator: Locator | null,
  maxChars = 200_000,
): Promise<string> {
  const sections = await extractReadSections(filePath, locator, maxChars);
  return sections
    .map((s) => s.text)
    .join('\n\n')
    .slice(0, maxChars);
}

/**
 * What the book file says about itself, and how many sections of body it has.
 *
 * For `get_book_details`. Reads only the package file, never a chapter, so
 * nothing past the reader can leak through it. The count is of sections after
 * the front matter, which is as near to "chapters" as an EPUB states.
 */
export async function readBookPackageInfo(filePath: string): Promise<BookPackageInfo> {
  const known = packageInfoCache.get(filePath);
  if (known) return known;
  const archive = await openEpub(filePath);
  const opfPath = await findOpfPath(archive);
  const opfContent = await archive.text(opfPath);
  if (!opfContent) throw new Error('No OPF content');
  const spine = parseSpine(opfContent, opfFolder(opfPath));
  const bodyStart = resolveBodyStart(opfContent, spine, null);
  const info = { metadata: parseOpfMetadata(opfContent), sectionCount: Math.max(0, spine.length - bodyStart) };
  if (packageInfoCache.size >= PACKAGE_INFO_CACHE_SIZE) {
    const oldest = packageInfoCache.keys().next().value;
    if (oldest !== undefined) packageInfoCache.delete(oldest);
  }
  packageInfoCache.set(filePath, info);
  return info;
}

type BookPackageInfo = { metadata: EpubMetadata; sectionCount: number };

/*
 * Kept per file. Finding the package file used to mean reading the whole
 * book in as base64 on the JS thread; it is a few small reads now, but
 * Samwell may look up several books in one turn, or the same one again a
 * turn later, and a file at a path does not change what it says about
 * itself, so what was read once stays true.
 */
const PACKAGE_INFO_CACHE_SIZE = 32;
const packageInfoCache = new Map<string, BookPackageInfo>();
