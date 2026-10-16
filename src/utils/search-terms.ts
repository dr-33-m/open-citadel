/**
 * What a search Samwell writes asks for: the exact phrases he quoted and the
 * words that carry meaning, with the filler of a natural question ("what does
 * he say about...") left out. One reading of a query for every search over
 * the reader's library, so the books, the highlights and the thoughts agree
 * on what matched. Pure.
 */

export interface SearchQuery {
  /** "Exact phrases", as quoted. */
  phrases: string[];
  /** Words outside the quotes, lowercased, filler dropped. */
  words: string[];
}

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its ' +
    'me my no not of on or our she so than that the their them then there these they this those to was we were what when ' +
    'where which while who whom why will with would you your about any all also am just more most much only other over ' +
    'same some such too very say says said tell told book books chapter author passage passages'
  ).split(' '),
);

/** Letters and digits in any script, with an apostrophe allowed inside a word. */
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function parseSearchQuery(input: string): SearchQuery {
  const phrases: string[] = [];
  const rest = input.replace(/["“”]([^"“”]+)["“”]/g, (_, phrase: string) => {
    const words = phrase.toLowerCase().match(WORD);
    if (words && words.length > 0) phrases.push(words.join(' '));
    return ' ';
  });
  const words = [...new Set((rest.toLowerCase().match(WORD) ?? []).filter((word) => word.length > 1 && !STOPWORDS.has(word)))];
  return { phrases, words };
}

export function isEmptyQuery(query: SearchQuery): boolean {
  return query.phrases.length === 0 && query.words.length === 0;
}

/**
 * An FTS5 MATCH expression for the query: every phrase and word quoted (so
 * nothing in it can be read as FTS syntax) and OR'ed, leaving the ranking to
 * say which passages hold most of them. Null when nothing is left to search.
 */
export function ftsMatch(query: SearchQuery): string | null {
  const quote = (term: string) => `"${term.replace(/"/g, '""')}"`;
  const terms = [...query.phrases, ...query.words].map(quote);
  return terms.length > 0 ? terms.join(' OR ') : null;
}

const SUFFIXES = ['ships', 'ship', 'ness', 'ment', 'ings', 'ing', 'ies', 'ers', 'er', 'es', 'ed', 'ly', 's'];

/**
 * A word with its common endings taken off (twice at most, never below four
 * letters), so "leadership", "leaders" and "leading" all look for "lead". The
 * index has a real stemmer; this is for the small searches done in memory.
 */
export function stem(word: string): string {
  let current = word;
  for (let pass = 0; pass < 2; pass++) {
    const suffix = SUFFIXES.find((end) => current.endsWith(end) && current.length - end.length >= 4);
    if (!suffix) break;
    current = current.slice(0, current.length - suffix.length);
  }
  return current;
}

/** Where a term first appears in lowercased text: a phrase as written, a word by its stem. */
function firstAt(lower: string, term: string): number {
  return lower.indexOf(term.includes(' ') ? term : stem(term));
}

/**
 * How well a piece of text answers the query, for searches too small for an
 * index (highlights, notes, thoughts): two points a phrase, one a distinct
 * word, so a passage holding more of what was asked ranks first. Zero when
 * nothing matched.
 */
export function matchScore(text: string, query: SearchQuery): number {
  const lower = text.toLowerCase();
  const phrases = query.phrases.filter((phrase) => firstAt(lower, phrase) >= 0).length;
  const words = query.words.filter((word) => firstAt(lower, word) >= 0).length;
  return phrases * 2 + words;
}

/**
 * The part of a long text around its first match, cut at word boundaries and
 * marked with ellipses where it was cut. Short text comes back whole.
 */
export function excerptAround(text: string, query: SearchQuery, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const lower = text.toLowerCase();
  const hits = [...query.phrases, ...query.words].map((term) => firstAt(lower, term)).filter((at) => at >= 0);
  const anchor = hits.length > 0 ? Math.min(...hits) : 0;
  let start = Math.max(0, anchor - Math.floor(maxChars / 3));
  let end = Math.min(text.length, start + maxChars);
  start = Math.max(0, end - maxChars);
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space > 0 && space < anchor) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start) end = space;
  }
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * The words a database pre-filter should look for: each phrase, and each
 * word by its stem, so the filter lets through everything `matchScore` would
 * count. Empty when the query had nothing in it.
 */
export function filterTerms(query: SearchQuery): string[] {
  return [...query.phrases, ...query.words.map(stem)];
}

/**
 * Rows ordered by how well they answer the query, best first; rows that match
 * nothing are dropped. Ties keep the order they came in (newest first, from
 * the database), so recency decides between equals.
 */
export function rankByMatch<T>(rows: readonly T[], query: SearchQuery, textOf: (row: T) => string): T[] {
  return rows
    .map((row, order) => ({ row, order, score: matchScore(textOf(row), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.row);
}
