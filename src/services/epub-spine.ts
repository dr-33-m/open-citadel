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

  // Locator href not in the spine — fall back to whole-book progression.
  const total = locator.locations?.totalProgression ?? 1;
  return {
    cutoffIndex: Math.min(spine.length - 1, Math.floor(spine.length * total)),
    progression: 1,
  };
}
