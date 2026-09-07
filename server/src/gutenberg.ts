import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { readIdentity } from './identity.js';

/**
 * Free books, for the reader who arrives with an empty phone.
 *
 * Here rather than on the device for one reason: Project Gutenberg is somebody
 * else's website, and when it changes there should be one place to fix it
 * rather than an app update everyone has to install. The device only ever
 * downloads a URL this route hands it.
 *
 * Authenticated like every other route. It reads nothing of the user's and
 * spends nothing, but an open endpoint on this server is an open proxy, and
 * the only caller is a signed-in app mid-onboarding.
 */
export const gutenbergRoutes = new Hono();

/**
 * Where the catalogue is read from.
 *
 * Gutendex is the JSON API for Project Gutenberg's catalogue, and this points
 * at a self-hosted instance so the free-books library later in the app is not
 * built on somebody else's rate limit. Environment rather than code because
 * the URL names self-hosted infrastructure and this repository is public, the
 * same rule `SAMWELL_CLOUD_URL` and the Logto endpoint already follow.
 *
 * The public instance is the fallback default, so a machine with no
 * configuration still works.
 */
/*
 * `||`, not `??`, and the difference is not academic.
 *
 * Creating the key in a deployment UI and leaving the box empty is the normal
 * way this variable comes into existence, and an empty string is neither null
 * nor undefined — so `??` would keep it, the base URL would be `''`, and every
 * search would build a relative URL that `fetch` cannot parse. It fails safe
 * (the throw is caught and the site fallback answers) which is exactly what
 * makes it worth fixing: the symptom is a self-hosted instance quietly never
 * being used.
 */
const GUTENDEX_URL = (process.env.GUTENDEX_URL?.trim() || 'https://gutendex.com').replace(
  /\/+$/,
  '',
);

const GUTENBERG_SITE = 'https://www.gutenberg.org';

/** How long either source gets before this route gives up on it. */
const SOURCE_TIMEOUT_MS = 12_000;

export interface FreeBook {
  id: number;
  title: string;
  author: string;
  subjects: string[];
  /** Where the device downloads it from. */
  epubUrl: string;
  /** Gutenberg's own download count. A rough proxy for "is this the good one". */
  downloads: number;
}

/**
 * The EPUB URL for an ebook id.
 *
 * Deterministic, which is what makes the HTML fallback below viable: scraping
 * only has to recover the id, never a download link. `.epub3.images` is the
 * format Gutenberg itself marks Recommended, and runs a few hundred kB for a
 * typical book.
 */
export function gutenbergEpubUrl(id: number): string {
  return `${GUTENBERG_SITE}/ebooks/${id}.epub3.images`;
}

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: accept,
        // Gutenberg blocks unidentified clients. Naming the app is both the
        // polite thing and the thing that keeps the fallback working.
        'User-Agent': 'OpenCitadel/1.0 (+https://open-citadel.online)',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

type GutendexBook = {
  id?: unknown;
  title?: unknown;
  authors?: { name?: unknown }[];
  subjects?: unknown;
  download_count?: unknown;
  formats?: Record<string, unknown>;
};

/** "Dyer, Frank Lewis" is how the catalogue stores it, not how anyone says it. */
function humanizeAuthor(name: string): string {
  const [surname, rest] = name.split(/,\s*/, 2);
  if (!rest) return name.trim();
  // Life dates ride along on some records: "Twain, Mark, 1835-1910".
  const given = rest.replace(/,?\s*\d{3,4}\??\s*-\s*\d{0,4}\??\s*$/, '').trim();
  return given ? `${given} ${surname}`.trim() : surname.trim();
}

function fromGutendex(book: GutendexBook): FreeBook | null {
  const id = Number(book.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const title = typeof book.title === 'string' ? book.title.trim() : '';
  if (!title) return null;

  /*
   * Only books that actually have an EPUB.
   *
   * The catalogue carries plain-text-only records, and offering one of those
   * would end with a download that succeeds and a file the reader cannot open.
   * The key has varied between Gutendex versions, so any epub-ish format
   * counts rather than one exact string.
   */
  const formats = book.formats ?? {};
  const hasEpub = Object.keys(formats).some((key) => key.includes('epub'));
  if (!hasEpub) return null;

  const authors = Array.isArray(book.authors) ? book.authors : [];
  const author =
    authors
      .map((entry) => (typeof entry?.name === 'string' ? humanizeAuthor(entry.name) : ''))
      .filter(Boolean)
      .join(' and ') || 'Unknown';

  const subjects = Array.isArray(book.subjects)
    ? book.subjects.filter((s): s is string => typeof s === 'string').slice(0, 6)
    : [];

  return {
    id,
    title,
    author,
    subjects,
    epubUrl: gutenbergEpubUrl(id),
    downloads: Number(book.download_count) || 0,
  };
}

async function searchGutendex(query: string, limit: number): Promise<FreeBook[]> {
  // Trailing slash on purpose. DRF's DefaultRouter registers the viewset at
  // `/books/`, and Django's APPEND_SLASH would answer `/books?...` with a 301
  // to exactly this URL. Following a redirect on every search is a round trip
  // spent to save a character.
  const url =
    `${GUTENDEX_URL}/books/?search=${encodeURIComponent(query)}` +
    '&languages=en&mime_type=application%2Fepub%2Bzip';

  const response = await fetchWithTimeout(url, 'application/json');
  if (!response.ok) {
    throw new Error(`Gutendex returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as { results?: unknown };
  const results = Array.isArray(body.results) ? body.results : [];
  return results
    .map((entry) => fromGutendex(entry as GutendexBook))
    .filter((book): book is FreeBook => book !== null)
    .slice(0, limit);
}

/*
 * The fallback: Gutenberg's own search page.
 *
 * Deliberately crude, and only has to recover the ebook id and the two lines
 * of text beside it, because `gutenbergEpubUrl` derives the rest. It exists
 * because the primary source is a self-hosted instance that can be down for
 * reasons that have nothing to do with Project Gutenberg, and a reader's first
 * two minutes with the app is a bad time to discover a container did not come
 * back up.
 *
 * No subjects and no download count from this path. Samwell picks from titles
 * and authors, which is worse and is still an answer.
 */
const BOOK_LINK = /<li[^>]*class="[^"]*booklink[^"]*"[\s\S]*?<\/li>/g;
const EBOOK_ID = /href="\/ebooks\/(\d+)"/;
const TITLE = /<span[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/span>/;
const SUBTITLE = /<span[^>]*class="[^"]*\bsubtitle\b[^"]*"[^>]*>([\s\S]*?)<\/span>/;

function decodeEntities(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchGutenbergSite(query: string, limit: number): Promise<FreeBook[]> {
  const url = `${GUTENBERG_SITE}/ebooks/search/?query=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, 'text/html');
  if (!response.ok) {
    throw new Error(`gutenberg.org returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const books: FreeBook[] = [];

  for (const block of html.match(BOOK_LINK) ?? []) {
    const id = Number(block.match(EBOOK_ID)?.[1]);
    if (!Number.isInteger(id) || id <= 0) continue;

    const title = decodeEntities(block.match(TITLE)?.[1] ?? '');
    if (!title) continue;

    books.push({
      id,
      title,
      author: decodeEntities(block.match(SUBTITLE)?.[1] ?? '') || 'Unknown',
      subjects: [],
      epubUrl: gutenbergEpubUrl(id),
      downloads: 0,
    });

    if (books.length >= limit) break;
  }

  return books;
}

gutenbergRoutes.get('/gutenberg/search', async (c) => {
  await readIdentity(c);

  const query = (c.req.query('q') ?? '').trim();
  if (!query) {
    throw new HTTPException(400, { message: 'q is required.' });
  }

  /*
   * More than Samwell will offer, on purpose.
   *
   * He is told to pick the three that genuinely fit what the reader said, and
   * he cannot do that from a list of three. A wider shortlist is where the
   * choosing actually happens.
   */
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 12) || 12, 1), 25);

  try {
    const results = await searchGutendex(query, limit);
    if (results.length > 0) return c.json({ results, source: 'gutendex' as const });
    /*
     * Zero results falls through, and that is not the obvious call.
     *
     * The tidy view is that an empty answer from a healthy catalogue is an
     * answer, and asking a second source is a wasted request. That reasoning
     * assumes the catalogue is populated, and a self-hosted Gutendex is empty
     * for hours after it is first deployed while `updatecatalog` walks tens of
     * thousands of RDF files into Postgres. During that window every search
     * would answer "nothing found" in perfect health, and Samwell would tell a
     * brand new user that Project Gutenberg has nothing on what they care
     * about. That is the worst possible first impression, and it happens on
     * exactly the days somebody has just set this up.
     *
     * So an empty answer is treated as a miss rather than a verdict. The cost
     * is one extra request on genuinely obscure queries, and even there the
     * site's own search is fuzzier and may well do better.
     */
  } catch (error) {
    console.warn(
      `[Gutenberg] Catalogue search failed for "${query}", falling back to the site:`,
      error,
    );
  }

  try {
    const results = await searchGutenbergSite(query, limit);
    return c.json({ results, source: 'gutenberg.org' as const });
  } catch (error) {
    console.error(`[Gutenberg] Both sources failed for "${query}":`, error);
    throw new HTTPException(502, {
      message: 'Could not reach Project Gutenberg.',
    });
  }
});
