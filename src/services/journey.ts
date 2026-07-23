import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  books,
  compassCheckins,
  compassGoals,
  compassMilestones,
  highlights,
  journeyNotes,
  readingProgress,
} from '@/db/schema';
import { extractKeywords } from '@/services/compass-reading-rank';

/**
 * Journey memory — the arc of the user's reading and execution, synthesized
 * on-device from data that already lives here (finished books, highlight tags,
 * Compass history) plus a small store of distilled reflections. Recall returns
 * a compact text block; for cloud requests only that slice travels, exactly
 * like reading-context. Nothing new is stored off-device.
 */

const MAX_SNAPSHOT_CHARS = 1600;
const MAX_NOTES_CHARS = 1000;
const RECENT_FINISHED = 6;
const RECENT_CHECKINS = 5;
const TOP_TAGS = 8;

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function topHighlightTags(limit: number): string[] {
  const rows = db.select({ tags: highlights.tags }).from(highlights).all();
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseTags(row.tags)) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

/**
 * Deterministic synthesis of the journey from existing local data. No LLM.
 * Returns a compact, token-bounded text block.
 */
export function buildJourneySnapshot(): string {
  const lines: string[] = [];

  const finished = db
    .select({
      title: books.title,
      author: books.author,
      category: books.category,
    })
    .from(books)
    .where(eq(books.status, 'archived'))
    .orderBy(desc(books.completedAt))
    .limit(RECENT_FINISHED)
    .all();
  if (finished.length > 0) {
    lines.push(
      'Recently finished: ' +
        finished
          .map((b) => `"${b.title}" by ${b.author}${b.category ? ` (${b.category})` : ''}`)
          .join('; '),
    );
  }

  const reading = db
    .select({
      title: books.title,
      author: books.author,
      percentage: readingProgress.percentage,
    })
    .from(books)
    .leftJoin(readingProgress, eq(readingProgress.bookId, books.id))
    .where(eq(books.status, 'reading'))
    .all();
  if (reading.length > 0) {
    lines.push(
      'Currently reading: ' +
        reading
          .map(
            (b) =>
              `"${b.title}" by ${b.author}` +
              (b.percentage != null ? ` (${Math.round(b.percentage * 100)}%)` : ''),
          )
          .join('; '),
    );
  }

  const tags = topHighlightTags(TOP_TAGS);
  if (tags.length > 0) {
    lines.push('Themes they return to (from tagged highlights): ' + tags.join(', '));
  }

  const goal = db.select().from(compassGoals).where(eq(compassGoals.status, 'active')).get();
  if (goal) {
    const milestone = db
      .select()
      .from(compassMilestones)
      .where(and(eq(compassMilestones.goalId, goal.id), eq(compassMilestones.status, 'active')))
      .orderBy(desc(compassMilestones.sortOrder))
      .get();
    lines.push(
      `Active goal: ${goal.title}` + (milestone ? ` — current milestone: ${milestone.title}` : ''),
    );

    const recentNight = db
      .select({ focusScore: compassCheckins.focusScore, localDate: compassCheckins.localDate })
      .from(compassCheckins)
      .where(and(eq(compassCheckins.goalId, goal.id), eq(compassCheckins.kind, 'night')))
      .orderBy(desc(compassCheckins.localDate))
      .limit(RECENT_CHECKINS)
      .all();
    const scores = recentNight.map((r) => r.focusScore).filter((s): s is number => s != null);
    if (scores.length > 0) {
      lines.push(
        `Recent focus scores (newest first): ${scores.join(', ')}` +
          (scores.length >= 2
            ? scores[0] > scores[scores.length - 1]
              ? ' — trending up'
              : scores[0] < scores[scores.length - 1]
                ? ' — trending down'
                : ''
            : ''),
      );
    }
  }

  const completed = db
    .select({
      title: compassMilestones.title,
      variance: compassMilestones.finalVarianceDays,
    })
    .from(compassMilestones)
    .where(eq(compassMilestones.status, 'completed'))
    .orderBy(desc(compassMilestones.sortOrder))
    .limit(3)
    .all();
  if (completed.length > 0) {
    lines.push(
      'Completed milestones: ' +
        completed
          .map(
            (m) =>
              `${m.title}` +
              (m.variance != null
                ? ` (${m.variance > 0 ? `+${m.variance}d over` : m.variance < 0 ? `${-m.variance}d under` : 'on target'})`
                : ''),
          )
          .join('; '),
    );
  }

  return lines.join('\n').slice(0, MAX_SNAPSHOT_CHARS);
}

/**
 * Full journey slice for injection: the deterministic snapshot plus the
 * distilled reflections most relevant to `query`.
 */
export function recallJourney(query: string): string {
  const snapshot = buildJourneySnapshot();

  const notes = db
    .select({ text: journeyNotes.text, tags: journeyNotes.tags, createdAt: journeyNotes.createdAt })
    .from(journeyNotes)
    .orderBy(desc(journeyNotes.createdAt))
    .limit(50)
    .all();

  let relevant: string[] = [];
  const keywords = extractKeywords(query);
  if (keywords.length > 0 && notes.length > 0) {
    relevant = notes
      .map((n) => {
        const hay = `${n.text} ${parseTags(n.tags).join(' ')}`.toLowerCase();
        const score = keywords.reduce((s, k) => s + (hay.includes(k) ? 1 : 0), 0);
        return { text: n.text, score };
      })
      .filter((n) => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((n) => n.text);
  }
  // Fall back to the most recent reflections when nothing keyword-matches.
  if (relevant.length === 0) {
    relevant = notes.slice(0, 3).map((n) => n.text);
  }

  const parts: string[] = [];
  if (snapshot) parts.push(snapshot);
  if (relevant.length > 0) {
    parts.push('Reflections from the journey:\n' + relevant.map((r) => `- ${r}`).join('\n').slice(0, MAX_NOTES_CHARS));
  }
  return parts.join('\n\n');
}

// ── Writes ───────────────────────────────────────────────────────────────────

function createId(): string {
  return `jn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function saveJourneyReflection(text: string, sourceRef: string, tags: string[] = []): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  db.insert(journeyNotes)
    .values({
      id: createId(),
      kind: 'reflection',
      text: trimmed,
      tags: tags.length > 0 ? JSON.stringify(tags) : null,
      sourceRef,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/**
 * Deterministic note written when a book is finished — its identity plus the
 * top tags the user attached while reading it. No LLM call.
 */
export function saveBookFinishedNote(bookId: string): void {
  const book = db
    .select({ title: books.title, author: books.author, category: books.category })
    .from(books)
    .where(eq(books.id, bookId))
    .get();
  if (!book) return;

  const tagRows = db
    .select({ tags: highlights.tags })
    .from(highlights)
    .where(eq(highlights.bookId, bookId))
    .all();
  const counts = new Map<string, number>();
  for (const row of tagRows) {
    for (const tag of parseTags(row.tags)) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const topTags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  const text =
    `Finished "${book.title}" by ${book.author}${book.category ? ` (${book.category})` : ''}.` +
    (topTags.length > 0 ? ` Themes drawn from it: ${topTags.join(', ')}.` : '');

  db.insert(journeyNotes)
    .values({
      id: createId(),
      kind: 'book_finished',
      text,
      tags: topTags.length > 0 ? JSON.stringify(topTags) : null,
      sourceRef: bookId,
      createdAt: new Date().toISOString(),
    })
    .run();
}
