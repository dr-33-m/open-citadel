import { desc, eq } from 'drizzle-orm';
import type { CompassReadingRef } from 'samwell-shared';

import { db } from '@/db/client';
import { books, highlights, notes, thoughts } from '@/db/schema';
import {
  extractKeywords,
  rankReadingCandidates,
  type ReadingCandidate,
} from '@/services/compass-reading-rank';

/**
 * Selects the passages from the driver's library — highlights, notes,
 * thoughts — most relevant to a goal, milestone, or check-in, so the pit wall
 * can ground its analysis in what the driver actually reads. Everything runs
 * on-device; selected excerpts travel only inside the analysis request.
 */

const CANDIDATE_ROWS_PER_TABLE = 400;

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function loadCandidates(): ReadingCandidate[] {
  const highlightRows = db
    .select({
      text: highlights.text,
      bookTitle: books.title,
      author: books.author,
      tags: highlights.tags,
      createdAt: highlights.createdAt,
    })
    .from(highlights)
    .leftJoin(books, eq(highlights.bookId, books.id))
    .orderBy(desc(highlights.createdAt))
    .limit(CANDIDATE_ROWS_PER_TABLE)
    .all();

  const noteRows = db
    .select({
      text: notes.text,
      bookTitle: books.title,
      author: books.author,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .leftJoin(books, eq(notes.bookId, books.id))
    .orderBy(desc(notes.createdAt))
    .limit(CANDIDATE_ROWS_PER_TABLE)
    .all();

  const thoughtRows = db
    .select({ text: thoughts.text, tags: thoughts.tags, createdAt: thoughts.createdAt })
    .from(thoughts)
    .orderBy(desc(thoughts.createdAt))
    .limit(CANDIDATE_ROWS_PER_TABLE)
    .all();

  return [
    ...highlightRows.map((row) => ({
      kind: 'highlight' as const,
      text: row.text,
      bookTitle: row.bookTitle,
      author: row.author,
      tags: parseTags(row.tags),
      createdAt: row.createdAt,
    })),
    ...noteRows.map((row) => ({
      kind: 'note' as const,
      text: row.text,
      bookTitle: row.bookTitle,
      author: row.author,
      tags: [],
      createdAt: row.createdAt,
    })),
    ...thoughtRows.map((row) => ({
      kind: 'thought' as const,
      text: row.text,
      bookTitle: null,
      author: null,
      tags: parseTags(row.tags),
      createdAt: row.createdAt,
    })),
  ];
}

/**
 * Returns the library passages most relevant to `query`, or undefined when
 * nothing matches — callers pass the result straight into the request body.
 */
export function selectReadingContext(query: string): CompassReadingRef[] | undefined {
  try {
    const refs = rankReadingCandidates(loadCandidates(), extractKeywords(query));
    return refs.length > 0 ? refs : undefined;
  } catch (err) {
    // Reading context is an enhancer; a failed selection must never block a check-in.
    console.warn('[Compass] Could not select reading context:', err);
    return undefined;
  }
}
