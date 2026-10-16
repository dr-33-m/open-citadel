import { findEntry, openEpub, opfFolder, opfPathOf } from '@/services/book-text/archive';
import { htmlToParagraphs, sectionTitle } from '@/services/book-text/paragraphs';
import { isFrontMatterHref, parseNavHref, parseSpine, resolveBodyStart } from '@/services/epub-spine';

/** One spine item, read: what Samwell's reading tools see of a book. */
export interface ExtractedSection {
  /** Spine position, i.e. reading order, from 0. */
  index: number;
  /** The spine path, which a reader's locator names. */
  href: string;
  title: string | null;
  /** Cover, title page, copyright, contents and the like. */
  frontMatter: boolean;
  paragraphs: string[];
}

/** A turn of the event loop between chapters, so a long book never holds the screen. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Every section of an EPUB as numbered paragraphs, in reading order, front
 * matter flagged rather than dropped (the spine positions have to stay true
 * to the reader's locators). Reads the package file and each chapter, and
 * never an image or a font.
 *
 * Not bounded by where the reader is: that is applied when the text is read
 * back (`readableExtent`), so the index serves a reader who moves on without
 * being built again.
 */
export async function extractBookText(filePath: string): Promise<ExtractedSection[]> {
  const archive = await openEpub(filePath);
  const opfPath = await opfPathOf(archive);
  if (!opfPath) throw new Error('No package file in this book');
  const opf = await archive.text(opfPath);
  if (!opf) throw new Error('The package file is empty');

  const folder = opfFolder(opfPath);
  const spine = parseSpine(opf, folder);
  const navHref = parseNavHref(opf, folder);
  const navEntry = navHref ? findEntry(archive, navHref, '') : null;
  const bodyStart = resolveBodyStart(opf, spine, navEntry ? await archive.text(navEntry) : null);

  // Every chapter fetched up front, in as few reads as their places in the
  // file allow (a chapter at a time was a native round trip each, about a
  // minute for a book on a debug build), then parsed one at a time.
  const entries = spine.map((href) => findEntry(archive, href, ''));
  const texts = await archive.textMany(entries.filter((entry): entry is string => entry !== null));

  const sections: ExtractedSection[] = [];
  for (const [index, href] of spine.entries()) {
    const entry = entries[index];
    const html = entry ? (texts.get(entry) ?? '') : '';
    sections.push({
      index,
      href,
      title: sectionTitle(html),
      frontMatter: index < bodyStart || isFrontMatterHref(href),
      paragraphs: htmlToParagraphs(html),
    });
    await breathe();
  }
  return sections;
}
