import type { CompassReadingRef } from 'samwell-shared';

/**
 * Pure ranking for reading context: which of the driver's saved passages are
 * most relevant to a goal, milestone, or check-in. No RN or DB imports so it
 * stays unit-testable; the DB-backed selection lives in compass-reading.ts.
 */

export type ReadingCandidate = {
  kind: CompassReadingRef['kind'];
  text: string;
  bookTitle: string | null;
  author: string | null;
  tags: string[];
  createdAt: string;
};

const MAX_REFS = 8;
const MAX_REF_CHARS = 400;
/** A tag match is the curated "why this matters" signal, so it outweighs raw text overlap. */
const TAG_WEIGHT = 2;
const TEXT_WEIGHT = 1;
const TITLE_WEIGHT = 0.5;

const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'but', 'by', 'can', 'could', 'did', 'do',
  'does', 'doing', 'done', 'for', 'from', 'get', 'going', 'had', 'has', 'have',
  'her', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just',
  'like', 'make', 'more', 'most', 'my', 'need', 'no', 'not', 'of', 'on', 'one',
  'or', 'our', 'out', 'over', 'so', 'some', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'to', 'today', 'up', 'us',
  'want', 'was', 'we', 'were', 'what', 'when', 'which', 'while', 'who', 'will',
  'with', 'would', 'you', 'your',
]);

export function extractKeywords(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const word = raw.replace(/^'+|'+$/g, '');
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    seen.add(word);
  }
  return [...seen];
}

function truncate(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_REF_CHARS) return trimmed;
  const cut = trimmed.slice(0, MAX_REF_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > MAX_REF_CHARS / 2 ? lastSpace : MAX_REF_CHARS)}…`;
}

/**
 * Per keyword, the strongest single signal counts: a tag match (2) beats a
 * body-text hit (1) beats a book-title hit (0.5). Tags are the user's own
 * curated "why this matters", so a tagged passage rises above one that merely
 * mentions the word.
 */
export function rankReadingCandidates(
  candidates: ReadingCandidate[],
  keywords: string[],
  limit: number = MAX_REFS,
): CompassReadingRef[] {
  if (keywords.length === 0) return [];

  const scored = candidates
    .map((candidate) => {
      const text = candidate.text.toLowerCase();
      const title = candidate.bookTitle?.toLowerCase() ?? '';
      const tagText = candidate.tags.join(' ').toLowerCase();
      let score = 0;
      for (const keyword of keywords) {
        if (tagText.includes(keyword)) score += TAG_WEIGHT;
        else if (text.includes(keyword)) score += TEXT_WEIGHT;
        else if (title.includes(keyword)) score += TITLE_WEIGHT;
      }
      return { candidate, score };
    })
    .filter((entry) => entry.score > 0);

  scored.sort(
    (a, b) =>
      b.score - a.score || b.candidate.createdAt.localeCompare(a.candidate.createdAt),
  );

  return scored.slice(0, limit).map(({ candidate }) => ({
    kind: candidate.kind,
    text: truncate(candidate.text),
    bookTitle: candidate.bookTitle,
    author: candidate.author,
  }));
}
