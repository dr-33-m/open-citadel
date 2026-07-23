import { and, desc, eq, like, or } from 'drizzle-orm';
import type { ToolDefinition } from '@dr33m/react-native-litert-lm';

import { db } from '@/db/client';
import { books, highlights, notes, readingProgress, thoughts } from '@/db/schema';
import { extractReadText } from '@/services/book-context';

// ── Tool definitions ────────────────────────────────────────────────────────

export const SAMWELL_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_highlights',
      description:
        "Search the user's book highlights and notes. Can search by keyword in highlight/note text, by book title, or by tag. Call with no arguments to get the most recent highlights.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keyword to search in highlight text, note text, or book title',
          },
          book_title: {
            type: 'string',
            description: 'Book title to filter by (partial match, individual words are matched)',
          },
          tag: {
            type: 'string',
            description: 'Tag to filter by (exact match)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_thoughts',
      description:
        "Search the user's standalone thoughts (not tied to any book). Can search by keyword or by tag. Call with no arguments to get the most recent thoughts.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keyword to search in thought text',
          },
          tag: {
            type: 'string',
            description: 'Tag to filter by (exact match)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_reading',
      description:
        "Search the full text of the books the user is currently reading or has finished, for passages relevant to a topic. Only returns text the user has already read (never ahead of their position). Use to ground points in what the user's authors actually say.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Topic or question to find relevant passages for',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'suggest_next_book',
      description:
        "List the user's library (queued, currently reading, finished) so you can recommend what to read next based on their journey. Only recommend books from this list.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'tag_highlight',
      description:
        'Add one or more tags to a highlight for future reference and organization.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The highlight ID (from search results)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to add',
          },
        },
        required: ['id', 'tags'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'tag_thought',
      description:
        'Add one or more tags to a thought for future reference and organization.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The thought ID (from search results)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to add',
          },
        },
        required: ['id', 'tags'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_highlight',
      description:
        'Permanently delete a highlight (and its note). Only call this when the user explicitly asks to delete or remove a highlight. This cannot be undone.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The highlight ID (from search results)',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_thought',
      description:
        'Permanently delete a standalone thought. Only call this when the user explicitly asks to delete or remove a thought. This cannot be undone.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The thought ID (from search results)',
          },
        },
        required: ['id'],
      },
    },
  },
];

// ── Tools that must be user-approved before executing ──────────────────────

export const APPROVAL_REQUIRED_TOOLS = new Set([
  'tag_highlight',
  'tag_thought',
  'delete_highlight',
  'delete_thought',
]);

// ── Tool definitions in litert-lm format ────────────────────────────────────

export const SAMWELL_TOOLS_LITERT: ToolDefinition[] = SAMWELL_TOOLS.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  parametersJson: JSON.stringify(t.function.parameters),
}));

// ── Tool result types ───────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  type: 'highlight' | 'thought';
  bookId: string | null;
  bookTitle: string | null;
  text: string;
  tags: string[];
  locator: string | null;
  noteText: string | null;
}

// ── Tool executor ───────────────────────────────────────────────────────────

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: unknown; status: string }> {
  console.log(`[Samwell] Tool call: ${name}`, JSON.stringify(args));
  switch (name) {
    case 'search_highlights':
      return {
        result: await searchHighlights(
          (args.query as string) ?? '',
          (args.book_title as string) ?? '',
          (args.tag as string) ?? '',
        ),
        status: 'Searching through highlights…',
      };
    case 'search_thoughts':
      return {
        result: await searchThoughts(
          (args.query as string) ?? '',
          (args.tag as string) ?? '',
        ),
        status: 'Searching through thoughts…',
      };
    case 'search_reading':
      return {
        result: await searchReading((args.query as string) ?? ''),
        status: 'Checking your books…',
      };
    case 'suggest_next_book':
      return {
        result: await suggestNextBook(),
        status: 'Looking over your library…',
      };
    case 'tag_highlight':
      return {
        result: await addTags(args.id as string, 'highlight', args.tags as string[]),
        status: 'Organizing tags…',
      };
    case 'tag_thought':
      return {
        result: await addTags(args.id as string, 'thought', args.tags as string[]),
        status: 'Organizing tags…',
      };
    case 'delete_highlight':
      return {
        result: await deleteEntry(args.id as string, 'highlight'),
        status: 'Deleting highlight…',
      };
    case 'delete_thought':
      return {
        result: await deleteEntry(args.id as string, 'thought'),
        status: 'Deleting thought…',
      };
    default:
      return { result: { error: `Unknown tool: ${name}` }, status: 'Unknown tool' };
  }
}

// ── search_highlights implementation ────────────────────────────────────────

async function searchHighlights(
  query: string,
  bookTitle: string,
  tag: string,
): Promise<SearchResult[]> {
  const q = query.trim();
  const b = bookTitle.trim();
  const t = tag.trim();

  // No filters — return the most recent highlights
  if (!q && !b && !t) {
    return getRecentHighlights(5);
  }

  const results: SearchResult[] = [];

  // Build OR conditions for the WHERE clause
  const conditions = [];
  if (q) {
    for (const word of q.split(/\s+/).filter(Boolean)) {
      conditions.push(like(highlights.text, `%${word}%`));
      conditions.push(like(books.title, `%${word}%`));
    }
  }
  if (b) {
    for (const word of b.split(/\s+/).filter(Boolean)) {
      conditions.push(like(books.title, `%${word}%`));
    }
  }
  if (t) conditions.push(like(highlights.tags, `%"${t}"%`));

  if (conditions.length > 0) {
    const rows = db
      .select({
        id: highlights.id,
        text: highlights.text,
        tags: highlights.tags,
        locator: highlights.locator,
        bookId: highlights.bookId,
        bookTitle: books.title,
        noteText: notes.text,
      })
      .from(highlights)
      .innerJoin(books, eq(highlights.bookId, books.id))
      .leftJoin(notes, eq(notes.highlightId, highlights.id))
      .where(or(...conditions))
      .orderBy(desc(highlights.createdAt))
      .limit(15)
      .all();

    // Post-filter: when book_title is given alongside query/tag, narrow to books matching ANY word
    const filtered = b
      ? rows.filter((r) => {
          const title = r.bookTitle.toLowerCase();
          return b.split(/\s+/).some((w) => title.includes(w.toLowerCase()));
        })
      : rows;

    // Dedup by highlight id (a highlight can have multiple notes)
    const seen = new Map<string, SearchResult>();
    for (const row of filtered) {
      if (seen.has(row.id)) {
        const existing = seen.get(row.id)!;
        if (row.noteText && existing.noteText) existing.noteText += ` | ${row.noteText}`;
        continue;
      }
      seen.set(row.id, {
        id: row.id,
        type: 'highlight',
        bookId: row.bookId,
        bookTitle: row.bookTitle,
        text: row.text,
        tags: row.tags ? JSON.parse(row.tags) : [],
        locator: row.locator,
        noteText: row.noteText ?? null,
      });
    }
    results.push(...seen.values());
  }

  // Also search notes text directly (may surface highlights via note content)
  if (q) {
    const noteRows = db
      .select({
        highlightId: notes.highlightId,
        noteText: notes.text,
        highlightText: highlights.text,
        highlightTags: highlights.tags,
        highlightLocator: highlights.locator,
        bookId: highlights.bookId,
        bookTitle: books.title,
      })
      .from(notes)
      .innerJoin(highlights, eq(notes.highlightId, highlights.id))
      .innerJoin(books, eq(highlights.bookId, books.id))
      .where(or(...q.split(/\s+/).filter(Boolean).map((w) => like(notes.text, `%${w}%`))))
      .limit(5)
      .all();

    for (const row of noteRows) {
      if (row.highlightId && !results.some((r) => r.id === row.highlightId)) {
        results.push({
          id: row.highlightId,
          type: 'highlight',
          bookId: row.bookId,
          bookTitle: row.bookTitle,
          text: row.highlightText,
          tags: row.highlightTags ? JSON.parse(row.highlightTags) : [],
          locator: row.highlightLocator,
          noteText: row.noteText,
        });
      }
    }
  }

  return results.slice(0, 5);
}

// ── Helper: get recent highlights ──────────────────────────────────────────

function getRecentHighlights(limit: number): SearchResult[] {
  const rows = db
    .select({
      id: highlights.id,
      text: highlights.text,
      tags: highlights.tags,
      locator: highlights.locator,
      bookId: highlights.bookId,
      bookTitle: books.title,
      noteText: notes.text,
    })
    .from(highlights)
    .innerJoin(books, eq(highlights.bookId, books.id))
    .leftJoin(notes, eq(notes.highlightId, highlights.id))
    .orderBy(desc(highlights.createdAt))
    .limit(limit)
    .all();

  const seen = new Map<string, SearchResult>();
  for (const row of rows) {
    if (seen.has(row.id)) {
      const existing = seen.get(row.id)!;
      if (row.noteText && existing.noteText) existing.noteText += ` | ${row.noteText}`;
      continue;
    }
    seen.set(row.id, {
      id: row.id,
      type: 'highlight',
      bookId: row.bookId,
      bookTitle: row.bookTitle,
      text: row.text,
      tags: row.tags ? JSON.parse(row.tags) : [],
      locator: row.locator,
      noteText: row.noteText ?? null,
    });
  }
  return [...seen.values()];
}

// ── search_thoughts implementation ─────────────────────────────────────────

async function searchThoughts(
  query: string,
  tag: string,
): Promise<SearchResult[]> {
  const q = query.trim();
  const t = tag.trim();

  // No filters — return the most recent thoughts
  if (!q && !t) {
    const rows = db
      .select()
      .from(thoughts)
      .orderBy(desc(thoughts.createdAt))
      .limit(5)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: 'thought' as const,
      bookId: null,
      bookTitle: null,
      text: row.text,
      tags: row.tags ? JSON.parse(row.tags) : [],
      locator: null,
      noteText: null,
    }));
  }

  const conditions = [];
  if (q) {
    for (const word of q.split(/\s+/).filter(Boolean)) {
      conditions.push(like(thoughts.text, `%${word}%`));
    }
  }
  if (t) conditions.push(like(thoughts.tags, `%"${t}"%`));

  const rows = db
    .select()
    .from(thoughts)
    .where(or(...conditions))
    .orderBy(desc(thoughts.createdAt))
    .limit(5)
    .all();

  return rows.map((row) => ({
    id: row.id,
    type: 'thought' as const,
    bookId: null,
    bookTitle: null,
    text: row.text,
    tags: row.tags ? JSON.parse(row.tags) : [],
    locator: null,
    noteText: null,
  }));
}

// ── tag implementation (shared for highlights and thoughts) ────────────────

async function addTags(
  id: string,
  type: 'highlight' | 'thought',
  newTags: string[],
): Promise<{ success: boolean; tags: string[] }> {
  console.log(`[Samwell] addTags: id=${id}, type=${type}, tags=${JSON.stringify(newTags)}`);
  const table = type === 'highlight' ? highlights : thoughts;
  const row = db
    .select({ tags: table.tags })
    .from(table)
    .where(eq(table.id, id))
    .get();

  if (!row) {
    console.log(`[Samwell] addTags: no row found for id=${id}`);
    return { success: false, tags: [] };
  }

  const existing: string[] = row.tags ? JSON.parse(row.tags) : [];
  const merged = Array.from(new Set([...existing, ...newTags]));
  const tagsJson = JSON.stringify(merged);

  db.update(table)
    .set({ tags: tagsJson })
    .where(eq(table.id, id))
    .run();

  console.log(`[Samwell] addTags: success, merged tags=${tagsJson}`);
  return { success: true, tags: merged };
}

// ── delete implementation (shared for highlights and thoughts) ─────────────

async function deleteEntry(
  id: string,
  type: 'highlight' | 'thought',
): Promise<{ success: boolean }> {
  console.log(`[Samwell] deleteEntry: id=${id}, type=${type}`);
  const table = type === 'highlight' ? highlights : thoughts;
  const row = db.select({ id: table.id }).from(table).where(eq(table.id, id)).get();

  if (!row) {
    console.log(`[Samwell] deleteEntry: no row found for id=${id}`);
    return { success: false };
  }

  if (type === 'highlight') {
    db.delete(notes).where(eq(notes.highlightId, id)).run();
  }
  db.delete(table).where(eq(table.id, id)).run();

  console.log(`[Samwell] deleteEntry: success, id=${id}`);
  return { success: true };
}

// ── search_reading implementation (spoiler-bounded full-text) ──────────────

export interface ReadingSnippet {
  book: string;
  author: string;
  snippet: string;
}

const READING_MAX_SNIPPETS = 8;
const READING_MAX_TOTAL_CHARS = 40_000;
const READING_MAX_FINISHED_BOOKS = 5;
const READING_SNIPPET_WINDOW = 220;

async function searchReading(query: string): Promise<ReadingSnippet[]> {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return [];

  const reading = db.select().from(books).where(eq(books.status, 'reading')).all();
  const finished = db
    .select()
    .from(books)
    .where(eq(books.status, 'archived'))
    .orderBy(desc(books.completedAt))
    .limit(READING_MAX_FINISHED_BOOKS)
    .all();

  const snippets: ReadingSnippet[] = [];
  let totalChars = 0;

  for (const book of [...reading, ...finished]) {
    if (snippets.length >= READING_MAX_SNIPPETS || totalChars >= READING_MAX_TOTAL_CHARS) break;
    if (!book.filePath) continue;

    try {
      // Spoiler boundary: reading books are bounded to their saved locator;
      // a reading book with no progress row is skipped (nothing safely read).
      // Finished (archived) books are fully read → whole text.
      let locator: unknown = null;
      if (book.status === 'reading') {
        const prog = db
          .select({ locator: readingProgress.locator })
          .from(readingProgress)
          .where(eq(readingProgress.bookId, book.id))
          .get();
        if (!prog?.locator) continue;
        locator = JSON.parse(prog.locator);
      }

      const text = await extractReadText(book.filePath, locator as never);
      const lower = text.toLowerCase();
      for (const word of words) {
        const idx = lower.indexOf(word);
        if (idx < 0) continue;
        const start = Math.max(0, idx - READING_SNIPPET_WINDOW);
        const end = Math.min(text.length, idx + READING_SNIPPET_WINDOW);
        const snippet =
          (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
        snippets.push({ book: book.title, author: book.author, snippet });
        totalChars += snippet.length;
        break; // one snippet per book per query
      }
    } catch {
      // Skip unreadable/unparseable books.
    }
  }

  return snippets;
}

export function formatReadingForLLM(snippets: ReadingSnippet[]): string {
  if (snippets.length === 0) {
    return 'No relevant passages found in the parts of your books you have read so far.';
  }
  return snippets
    .map((s, i) => `${i + 1}. From "${s.book}" by ${s.author}:\n   "${s.snippet}"`)
    .join('\n\n');
}

// ── suggest_next_book implementation ───────────────────────────────────────

export interface BookCandidate {
  title: string;
  author: string;
  category: string | null;
  status: string | null;
  percentage: number | null;
  completedAt: string | null;
}

async function suggestNextBook(): Promise<BookCandidate[]> {
  const rows = db
    .select({
      title: books.title,
      author: books.author,
      category: books.category,
      status: books.status,
      completedAt: books.completedAt,
      percentage: readingProgress.percentage,
    })
    .from(books)
    .leftJoin(readingProgress, eq(readingProgress.bookId, books.id))
    .orderBy(desc(books.addedAt))
    .limit(60)
    .all();

  return rows.map((r) => ({
    title: r.title,
    author: r.author,
    category: r.category ?? null,
    status: r.status ?? null,
    percentage: r.percentage ?? null,
    completedAt: r.completedAt ?? null,
  }));
}

export function formatBookCandidatesForLLM(candidates: BookCandidate[]): string {
  const line = (b: BookCandidate) =>
    `- "${b.title}" by ${b.author}` +
    (b.category ? ` (${b.category})` : '') +
    (b.status === 'reading' && b.percentage != null
      ? ` — ${Math.round(b.percentage * 100)}% read`
      : '');

  const group = (label: string, list: BookCandidate[]) =>
    list.length > 0 ? `${label}:\n${list.map(line).join('\n')}` : '';

  const toRead = candidates.filter((c) => c.status === 'queued' || c.status == null);
  const reading = candidates.filter((c) => c.status === 'reading');
  const done = candidates.filter((c) => c.status === 'archived');

  const sections = [
    group('To read (queued / unstarted)', toRead),
    group('Currently reading', reading),
    group('Finished', done),
  ].filter(Boolean);

  return sections.length > 0 ? sections.join('\n\n') : 'The library is empty.';
}

// ── Format tool results for the LLM ────────────────────────────────────────

export function formatSearchResultsForLLM(results: SearchResult[]): string {
  if (results.length === 0) return 'No results found.';

  return results
    .map((r, i) => {
      const lines = [`${i + 1}. "${r.text}"`];
      if (r.bookTitle) lines.push(`   Book: ${r.bookTitle}`);
      if (r.noteText) lines.push(`   Note: ${r.noteText}`);
      if (r.tags.length > 0) lines.push(`   Tags: ${r.tags.join(', ')}`);
      lines.push(`   ID: ${r.id}`);
      lines.push(`   Ref: [[ref:${r.type}:${r.id}]]`);
      return lines.join('\n');
    })
    .join('\n\n');
}
