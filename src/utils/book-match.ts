/**
 * Which book a name means, when Samwell is the one saying it.
 *
 * A model names a book the way a person does: "Taste of Luxury" for "The Taste
 * of Luxury: Bernard Arnault and the Moët-Hennessy Louis Vuitton Story", the
 * author's surname, the half of the title before the colon. The resolver this
 * replaces matched any one word with SQL `LIKE`, so "of" alone pulled in half
 * the library and the answer came back ambiguous, or it missed a book whose
 * title carried an accent the model left off.
 *
 * Scores rather than a yes or no, so a lookup can rank, and the same rules
 * serve both finding books (`search_library`) and acting on one.
 *
 * Pure: no database, no React Native, so it is tested on its own.
 */

export interface MatchableBook {
  title: string;
  author: string;
}

/** Words that say nothing about which book is meant. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'by', 'with', 'at', 'from', 'is', 'my', 'book',
]);

/** A leading article is not part of how anyone looks a title up. */
const LEADING_ARTICLE = /^(the|a|an)\s+/;

/** Lower case, accents off, punctuation to spaces, one space between words. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function withoutArticle(text: string): string {
  return text.replace(LEADING_ARTICLE, '');
}

/** The words of a query that tell books apart; all of them when every word is a stop word. */
export function significantWords(query: string): string[] {
  const words = normalizeForMatch(query).split(' ').filter(Boolean);
  const kept = words.filter((word) => !STOP_WORDS.has(word));
  return kept.length > 0 ? kept : words;
}

/** Score of a full match on the title. */
export const EXACT = 100;
/** The title starts with the query, or its main part (before a colon) is the query. */
export const LEADING = 90;
/** Every significant word is in the title or the author. */
export const ALL_WORDS = 60;
/** Below this a book is not a match at all. */
export const MATCH_FLOOR = 30;

function hasWord(words: string[], word: string): boolean {
  // Whole words, or the start of one for words long enough to mean something
  // ("biograph" finds "biography"), never the middle of one ("art" is not in "start").
  return words.some((candidate) => candidate === word || (word.length >= 4 && candidate.startsWith(word)));
}

/** How well `query` names `book`, 0 when it does not. */
export function scoreBook(query: string, book: MatchableBook): number {
  const wanted = withoutArticle(normalizeForMatch(query));
  if (!wanted) return 0;
  const title = withoutArticle(normalizeForMatch(book.title));
  if (title === wanted) return EXACT;
  const mainTitle = withoutArticle(normalizeForMatch(book.title.split(':')[0] ?? ''));
  if (mainTitle === wanted || title.startsWith(`${wanted} `)) return LEADING;

  const words = significantWords(query);
  const titleWords = title.split(' ');
  const allWords = [...titleWords, ...normalizeForMatch(book.author).split(' ')];
  const matched = words.filter((word) => hasWord(allWords, word)).length;
  if (matched === 0) return 0;
  if (matched === words.length) {
    // All in the title alone outranks a match that leans on the author.
    return ALL_WORDS + (words.every((word) => hasWord(titleWords, word)) ? 5 : 0);
  }
  const share = matched / words.length;
  return share >= 0.5 ? Math.round(MATCH_FLOOR + 20 * share) : 0;
}

/** Books that match, best first. Ties keep the order they came in. */
export function rankBooks<T extends MatchableBook>(query: string, books: readonly T[]): { book: T; score: number }[] {
  return books
    .map((book) => ({ book, score: scoreBook(query, book) }))
    .filter((entry) => entry.score >= MATCH_FLOOR)
    .sort((a, b) => b.score - a.score);
}

export type TitleResolution<T> =
  | { kind: 'one'; book: T }
  | { kind: 'ambiguous'; matches: T[] }
  | { kind: 'none' };

/** How many near matches an ambiguous answer names. Enough to ask which, few enough to read. */
const AMBIGUOUS_LIMIT = 6;

/**
 * The one book a name means, several when it could mean any of them, or none.
 *
 * One book wins when it carries every word and scores above every other. Two
 * equally good matches, or only partial ones, are ambiguous rather than a coin
 * toss, since acting on the wrong book (a delete, a move off a shelf) is worse
 * than asking.
 */
export function resolveTitle<T extends MatchableBook>(query: string, books: readonly T[]): TitleResolution<T> {
  const ranked = rankBooks(query, books);
  const top = ranked[0];
  if (!top) return { kind: 'none' };
  // A book that only shares some of the words is a suggestion, not an answer.
  if (top.score < ALL_WORDS) {
    return { kind: 'ambiguous', matches: ranked.slice(0, AMBIGUOUS_LIMIT).map((entry) => entry.book) };
  }
  const tied = ranked.filter((entry) => entry.score === top.score);
  if (tied.length === 1) return { kind: 'one', book: top.book };
  return { kind: 'ambiguous', matches: tied.slice(0, AMBIGUOUS_LIMIT).map((entry) => entry.book) };
}
