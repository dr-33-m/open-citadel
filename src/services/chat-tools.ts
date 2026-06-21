import { desc, eq, like, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { books, highlights, notes, thoughts } from '@/db/schema';

// ── Tool definitions (llama.rn native tool-calling format) ──────────────────

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
];

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
