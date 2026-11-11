/**
 * The whole post, from its page, for a reader who asked for it.
 *
 * Many blogs publish the first paragraph and a "Continue reading" link. When
 * the reader has chosen to read such a blog in the app (`WholePosts`), the
 * post's own page is read and the article pulled out of it with Mozilla's
 * Readability (Firefox's Reader View), as Read You's per-blog full-content
 * option does. Never on the app's own initiative: a publisher that syndicates
 * summaries has chosen to be read on its site (`article-route.ts`).
 *
 * Readability and its DOM (linkedom) are large, so they load on first use,
 * not with the app.
 */
import { TEASER_CHARS } from '@/services/blogs/feed/excerpt';
import { htmlToText } from '@/services/blogs/feed/text';

/**
 * The article inside a web page, as HTML, or null when Readability finds
 * nothing that reads like one (a home page, a paywall notice). Takes the
 * page's own HTML; fetching it is the caller's.
 */
export async function extractArticle(pageHtml: string): Promise<string | null> {
  const [{ Readability }, { parseHTML }] = await Promise.all([import('@mozilla/readability'), import('linkedom')]);
  const { document } = parseHTML(pageHtml);
  const article = new Readability(document as unknown as Document, { charThreshold: 400 }).parse();
  const content = article?.content?.trim();
  return content && htmlToText(content).length >= TEASER_CHARS / 2 ? content : null;
}

const KEEP_RESERVED = /\b(noarchive|noai)\b/i;
const META = /<meta\b[^>]*>/gi;

function attribute(tag: string, name: string): string | null {
  // After a space, so `data-name=` is not taken for `name=`.
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[2] ?? match[3] ?? match[4] ?? '') : null;
}

/**
 * Whether a page asks not to be kept or mined: `noarchive` or `noai` in its
 * robots meta tag or its `X-Robots-Tag` header, or a TDM reservation (the
 * W3C TDM Reservation Protocol, the EU's machine-readable opt-out) in its
 * meta tag or its header. Such a post is not copied into the reader; it is
 * read on its site. Pure.
 */
export function pageReservesRights(pageHtml: string, robotsHeader: string | null, tdmReserved = false): boolean {
  if (tdmReserved) return true;
  if (robotsHeader && KEEP_RESERVED.test(robotsHeader)) return true;
  const end = pageHtml.search(/<\/head>/i);
  const head = end === -1 ? pageHtml : pageHtml.slice(0, end);
  for (const tag of head.match(META) ?? []) {
    const name = attribute(tag, 'name')?.toLowerCase();
    const content = attribute(tag, 'content') ?? '';
    if (name === 'robots' && KEEP_RESERVED.test(content)) return true;
    if (name === 'tdm-reservation' && content.trim() === '1') return true;
  }
  return false;
}
