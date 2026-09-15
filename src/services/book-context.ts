import { readAsStringAsync } from 'expo-file-system/legacy';
import JSZip from 'jszip';

import {
  epubBasename,
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

async function findOpfPath(zip: JSZip): Promise<string> {
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('No container.xml found');
  const match = containerXml.match(/full-path="([^"]+)"/);
  if (!match) throw new Error('No OPF path in container.xml');
  return match[1];
}

function opfBasePath(opfPath: string): string {
  const idx = opfPath.lastIndexOf('/');
  return idx >= 0 ? opfPath.slice(0, idx + 1) : '';
}

function findChapterFile(zip: JSZip, locatorHref: string, basePath: string): JSZip.JSZipObject | null {
  // Try exact match first (absolute path within zip)
  const fullPath = basePath + locatorHref;
  let file = zip.file(fullPath);
  if (file) return file;

  // Try without basePath (locator href may already be absolute)
  file = zip.file(locatorHref);
  if (file) return file;

  // Try matching by filename only
  const basename = locatorHref.split('/').pop() ?? '';
  const allFiles = zip.files;
  for (const name of Object.keys(allFiles)) {
    if (name.endsWith(basename) && !allFiles[name].dir) {
      return allFiles[name];
    }
  }
  return null;
}

async function loadChapterText(filePath: string, locator: Locator): Promise<string> {
  // expo-file-system paths may have file:// prefix — strip it for readAsStringAsync
  const fsPath = filePath.startsWith('file://') ? filePath.slice(7) : filePath;

  const b64 = await readAsStringAsync(fsPath, { encoding: 'base64' });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const opfPath = await findOpfPath(zip);
  const basePath = opfBasePath(opfPath);

  const chapterFile = findChapterFile(zip, locator.href, basePath);
  if (!chapterFile) throw new Error(`Chapter not found: ${locator.href}`);

  const html = await chapterFile.async('string');
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
 * The EPUB is unzipped once. Result is capped at `maxChars`. The reading-order
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
  const fsPath = filePath.startsWith('file://') ? filePath.slice(7) : filePath;
  const b64 = await readAsStringAsync(fsPath, { encoding: 'base64' });
  const zip = await JSZip.loadAsync(b64, { base64: true });

  const opfPath = await findOpfPath(zip);
  const basePath = opfBasePath(opfPath);
  const opfContent = await zip.file(opfPath)?.async('string');
  if (!opfContent) throw new Error('No OPF content');

  const spine = parseSpine(opfContent, basePath);
  if (spine.length === 0) throw new Error('Empty spine');

  const { cutoffIndex, progression } = resolveReadCutoff(spine, locator);

  const readZipHtml = async (path: string): Promise<string> => {
    let file = zip.file(path);
    if (!file) {
      const base = epubBasename(path);
      const match = Object.keys(zip.files).find(
        (name) => !zip.files[name].dir && name.endsWith(base),
      );
      if (match) file = zip.file(match);
    }
    if (!file) return '';
    return file.async('string');
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
