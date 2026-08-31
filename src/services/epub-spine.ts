/**
 * Pure EPUB reading-order logic — no RN or filesystem imports, so it stays
 * unit-testable. The spoiler boundary (which chapters count as "already read")
 * is decided here; `book-context.ts` does the zip/FS I/O around it.
 */

export type SpineLocator = {
  href: string;
  locations?: {
    progression?: number;
    totalProgression?: number;
  };
};

/**
 * Parses the OPF `<spine>` into an ordered list of content-document paths
 * (resolved against the OPF base path) — the book's reading order. Regex-based
 * to match the container.xml parsing already used in book-context.
 */
export function parseSpine(opfContent: string, basePath: string): string[] {
  const manifest = new Map<string, string>();
  const itemRe = /<item\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opfContent))) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
    if (id && href) manifest.set(id, href);
  }

  const spine: string[] = [];
  const itemrefRe = /<itemref\b[^>]*>/g;
  while ((m = itemrefRe.exec(opfContent))) {
    const idref = m[0].match(/\bidref="([^"]+)"/)?.[1];
    if (!idref) continue;
    const href = manifest.get(idref);
    if (!href) continue;
    const clean = decodeURIComponent(href.split('#')[0]);
    spine.push(basePath + clean);
  }
  return spine;
}

export function epubBasename(path: string): string {
  return decodeURIComponent(path.split('#')[0]).split('/').pop() ?? path;
}

/**
 * Decides how far into the book the reader has read: the inclusive index of the
 * last chapter to include, and the within-chapter progression for that last
 * chapter (chapters before it are read in full; chapters after are excluded —
 * the spoiler boundary). `locator = null` ⇒ the whole book (fully-read/archived).
 */
export function resolveReadCutoff(
  spine: string[],
  locator: SpineLocator | null,
): { cutoffIndex: number; progression: number } {
  if (spine.length === 0) return { cutoffIndex: -1, progression: 1 };
  if (!locator) return { cutoffIndex: spine.length - 1, progression: 1 };

  const currentBase = epubBasename(locator.href);
  const idx = spine.findIndex((p) => epubBasename(p) === currentBase);
  if (idx >= 0) {
    return { cutoffIndex: idx, progression: locator.locations?.progression ?? 1 };
  }

  // Locator href not in the spine — fall back to totalProgression if we have
  // one. Without it, fail CLOSED (nothing read) rather than defaulting to
  // 100% and silently treating the whole book as already-read, which would
  // invert the spoiler boundary this function exists to enforce.
  const total = locator.locations?.totalProgression;
  if (total == null) return { cutoffIndex: -1, progression: 1 };

  return {
    cutoffIndex: Math.min(spine.length - 1, Math.floor(spine.length * total)),
    progression: 1,
  };
}

// ── Where the book actually begins ──────────────────────────────────────────

/**
 * Filenames that read as front matter.
 *
 * The last resort, used only when a book declares neither an EPUB 2 `<guide>`
 * nor EPUB 3 landmarks. Matching on the path is crude, but publishers are
 * remarkably consistent about naming these files, and the cost of a wrong
 * guess is one skipped section rather than a spoiler.
 */
const FRONT_MATTER_PATTERN =
  /(cover|halftitle|half-title|titlepage|title-page|copyright|imprint|colophon|dedication|epigraph|frontmatter|front-matter|acknowledg|toc|contents|nav)/i;

export function isFrontMatterHref(href: string): boolean {
  return FRONT_MATTER_PATTERN.test(epubBasename(href));
}

function spineIndexOf(spine: string[], href: string): number {
  const base = epubBasename(href);
  return spine.findIndex((p) => epubBasename(p) === base);
}

/**
 * EPUB 2 `<guide><reference type="text">` — the publisher's own declaration of
 * where the body starts. When present this is authoritative.
 */
export function parseGuideBodyStart(opfContent: string, spine: string[]): number {
  const guide = opfContent.match(/<guide\b[^>]*>([\s\S]*?)<\/guide>/i)?.[1];
  if (!guide) return -1;

  const refRe = /<reference\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(guide))) {
    const type = m[0].match(/\btype="([^"]+)"/i)?.[1]?.toLowerCase();
    const href = m[0].match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    if (type === 'text' || type === 'bodymatter') return spineIndexOf(spine, href);
  }
  return -1;
}

/** Manifest item carrying `properties="nav"` — the EPUB 3 navigation document. */
export function parseNavHref(opfContent: string, basePath: string): string | null {
  const itemRe = /<item\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opfContent))) {
    const props = m[0].match(/\bproperties="([^"]*)"/)?.[1];
    if (!props || !/\bnav\b/.test(props)) continue;
    const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
    if (href) return basePath + decodeURIComponent(href.split('#')[0]);
  }
  return null;
}

/**
 * EPUB 3 `<nav epub:type="landmarks">` — the modern equivalent of the guide,
 * where `bodymatter` marks the start of the book proper.
 */
export function parseLandmarksBodyStart(navContent: string, spine: string[]): number {
  const landmarks = navContent.match(/<nav\b[^>]*epub:type="landmarks"[^>]*>([\s\S]*?)<\/nav>/i)?.[1];
  if (!landmarks) return -1;

  const anchorRe = /<a\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(landmarks))) {
    const type = m[0].match(/epub:type="([^"]+)"/i)?.[1]?.toLowerCase();
    const href = m[0].match(/\bhref="([^"]+)"/i)?.[1];
    if (!href || !type) continue;
    if (type.split(/\s+/).includes('bodymatter')) return spineIndexOf(spine, href);
  }
  return -1;
}

/** Skips leading sections whose filenames read as front matter. */
export function heuristicBodyStart(spine: string[]): number {
  let i = 0;
  while (i < spine.length && isFrontMatterHref(spine[i])) i++;
  // Everything looked like front matter — trust the spine over the guess.
  return i >= spine.length ? 0 : i;
}

/**
 * The spine index where the book proper starts, preferring what the book
 * declares about itself over anything we infer.
 *
 * This replaces guessing by character count. A fixed offset cannot tell a
 * long copyright page from a short first chapter; the book's own structure
 * can, and it is already sitting in the OPF.
 */
export function resolveBodyStart(
  opfContent: string,
  spine: string[],
  navContent?: string | null,
): number {
  const guide = parseGuideBodyStart(opfContent, spine);
  if (guide >= 0) return guide;

  if (navContent) {
    const landmarks = parseLandmarksBodyStart(navContent, spine);
    if (landmarks >= 0) return landmarks;
  }

  return heuristicBodyStart(spine);
}
