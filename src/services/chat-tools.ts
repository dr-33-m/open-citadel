import { and, desc, eq, like, or } from 'drizzle-orm';
import type { ToolDefinition } from '@dr33m/react-native-litert-lm';

import { db } from '@/db/client';
import { books, chatSuggestions, collections, highlights, notes, readingProgress, thoughts } from '@/db/schema';
import { extractReadText } from '@/services/book-context';
import { useBooksStore } from '@/stores/books';
import { useCollectionsStore } from '@/stores/collections';

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
  {
    type: 'function' as const,
    function: {
      name: 'suggest_highlight',
      description:
        "Propose saving a passage the user has already read as a highlight. Only registers a suggestion for the user to review inline and approve/reject; never saves directly. Only within a chat about a specific book, for something that connects meaningfully to the user's journey. Use sparingly. After calling, mention it in your reply with [[suggest:highlight:<suggestionId>]].",
      parameters: {
        type: 'object',
        properties: {
          quote: {
            type: 'string',
            description: 'The passage text, close to word-for-word, that the user has already read',
          },
        },
        required: ['quote'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'suggest_thought',
      description:
        "Propose saving a standalone thought or insight discovered during the conversation. Only registers a suggestion for the user to review inline and approve/reject; never saves directly. Use sparingly, only when it connects meaningfully to the user's journey. After calling, mention it in your reply with [[suggest:thought:<suggestionId>]].",
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The thought text to propose saving',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags for the thought',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_from_currently_reading',
      description:
        "Remove one or more books from Currently Reading, clearing status back to unstarted (not queued, not finished). Use when the user opened a book by mistake or wants to stop reading it without marking it queued or finished. Requires user approval.",
      parameters: {
        type: 'object',
        properties: {
          book_titles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of the books (partial match ok). If omitted, uses the book the current chat is about.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_to_queue',
      description:
        "Add one or more books to the user's reading queue. Requires user approval.",
      parameters: {
        type: 'object',
        properties: {
          book_titles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of the books (partial match ok). If omitted, uses the book the current chat is about.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_from_queue',
      description:
        'Remove one or more books from the reading queue, clearing status back to unstarted. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          book_titles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of the books (partial match ok). If omitted, uses the book the current chat is about.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reorder_queue',
      description:
        "Move one or more books to a new position in the reading queue, as a block, preserving the order given in book_titles: give after_title or before_title to place them relative to another queued book, or position ('top'/'bottom') to send them to an end. Use this after critiquing the queue against the user's goals and journey, to actually put the right books next. Requires user approval.",
      parameters: {
        type: 'object',
        properties: {
          book_titles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of the books to move, in order. If omitted, uses the book the current chat is about.',
          },
          after_title: {
            type: 'string',
            description: 'Title of the book these should come right after in the queue.',
          },
          before_title: {
            type: 'string',
            description: 'Title of the book these should come right before in the queue.',
          },
          position: {
            type: 'string',
            enum: ['top', 'bottom'],
            description: 'Move to the very top or bottom of the queue. Ignored if after_title or before_title is given.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'toggle_favorite',
      description:
        'Add or remove one or more books from Favorites. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          book_titles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of the books (partial match ok). If omitted, uses the book the current chat is about.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'mark_as_finished',
      description:
        'Mark one or more books as finished. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          book_titles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of the books (partial match ok). If omitted, uses the book the current chat is about.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_collection',
      description:
        'Create a new, empty book collection with the given name. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name for the new collection',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_book_to_collection',
      description:
        "Add one or more books to an existing collection. If the collection doesn't exist yet, call create_collection first. Requires user approval.",
      parameters: {
        type: 'object',
        properties: {
          book_titles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of the books (partial match ok). If omitted, uses the book the current chat is about.',
          },
          collection_name: {
            type: 'string',
            description: 'Name of the collection (partial match ok)',
          },
        },
        required: ['collection_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'remove_book_from_collection',
      description:
        'Remove one or more books from a collection. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          book_titles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of the books (partial match ok). If omitted, uses the book the current chat is about.',
          },
          collection_name: {
            type: 'string',
            description: 'Name of the collection (partial match ok)',
          },
        },
        required: ['collection_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_collections',
      description:
        "List the user's collections with how many books are in each.",
      parameters: {
        type: 'object',
        properties: {},
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
  'remove_from_currently_reading',
  'add_to_queue',
  'remove_from_queue',
  'reorder_queue',
  'toggle_favorite',
  'mark_as_finished',
  'create_collection',
  'add_book_to_collection',
  'remove_book_from_collection',
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

export type ToolCallContext = {
  sessionId: string;
  bookId: string | null;
};

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolCallContext,
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
    case 'suggest_highlight':
      return {
        result: await suggestHighlight(args.quote as string, ctx),
        status: 'Noting that down…',
      };
    case 'suggest_thought':
      return {
        result: await suggestThought(args.text as string, (args.tags as string[]) ?? [], ctx),
        status: 'Noting that down…',
      };
    case 'remove_from_currently_reading':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, null, ctx, 'reading'),
        status: 'Updating your library…',
      };
    case 'add_to_queue':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, 'queued', ctx),
        status: 'Updating your queue…',
      };
    case 'remove_from_queue':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, null, ctx, 'queued'),
        status: 'Updating your queue…',
      };
    case 'reorder_queue':
      return {
        result: await reorderQueueForModel(args, ctx),
        status: 'Reordering your queue…',
      };
    case 'toggle_favorite':
      return {
        result: await toggleFavoriteForModel(args.book_titles as string[] | undefined, ctx),
        status: 'Updating favorites…',
      };
    case 'mark_as_finished':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, 'archived', ctx),
        status: 'Marking as finished…',
      };
    case 'create_collection':
      return {
        result: await createCollectionForModel(args.name as string),
        status: 'Creating collection…',
      };
    case 'add_book_to_collection':
      return {
        result: await updateBookCollectionBatch(
          args.book_titles as string[] | undefined,
          args.collection_name as string,
          'add',
          ctx,
        ),
        status: 'Adding to collection…',
      };
    case 'remove_book_from_collection':
      return {
        result: await updateBookCollectionBatch(
          args.book_titles as string[] | undefined,
          args.collection_name as string,
          'remove',
          ctx,
        ),
        status: 'Updating collection…',
      };
    case 'list_collections':
      return {
        result: await listCollectionsForModel(),
        status: 'Looking over your collections…',
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

  // Each filter TYPE the caller supplied must ALL hold (AND) — query, tag,
  // and book_title narrow together, not as alternatives. Within a single
  // type, any of its own words matching is enough (OR): e.g. a two-word
  // query matches either word, but {query, tag} together requires both.
  const conditions = [];
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    conditions.push(or(...words.map((w) => or(like(highlights.text, `%${w}%`), like(books.title, `%${w}%`)))));
  }
  if (b) {
    const words = b.split(/\s+/).filter(Boolean);
    conditions.push(or(...words.map((w) => like(books.title, `%${w}%`))));
  }
  if (t) conditions.push(like(highlights.tags, `%"${t}"%`));

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
    .where(and(...conditions))
    .orderBy(desc(highlights.createdAt))
    .limit(15)
    .all();

  // Dedup by highlight id (a highlight can have multiple notes)
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
  results.push(...seen.values());

  // Also search notes text directly (may surface highlights via note content),
  // still respecting book_title/tag if the caller gave them.
  if (q) {
    const noteConditions = [
      or(...q.split(/\s+/).filter(Boolean).map((w) => like(notes.text, `%${w}%`))),
    ];
    if (b) {
      const words = b.split(/\s+/).filter(Boolean);
      noteConditions.push(or(...words.map((w) => like(books.title, `%${w}%`))));
    }
    if (t) noteConditions.push(like(highlights.tags, `%"${t}"%`));

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
      .where(and(...noteConditions))
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

  // query and tag must both hold when both are given — see the identical
  // fix in searchHighlights above for why this used to be a plain OR.
  const conditions = [];
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    conditions.push(or(...words.map((w) => like(thoughts.text, `%${w}%`))));
  }
  if (t) conditions.push(like(thoughts.tags, `%"${t}"%`));

  const rows = db
    .select()
    .from(thoughts)
    .where(and(...conditions))
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

// ── suggest_highlight / suggest_thought implementation ──────────────────────

function suggestionId(): string {
  return `sugg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function suggestHighlight(
  quote: string,
  ctx: ToolCallContext,
): Promise<{ ok: boolean; suggestionId: string | null; error?: string }> {
  if (!ctx.bookId) {
    return { ok: false, suggestionId: null, error: 'no_book_context' };
  }

  const progress = db
    .select({ locator: readingProgress.locator })
    .from(readingProgress)
    .where(eq(readingProgress.bookId, ctx.bookId))
    .get();

  // Without a saved reading position there's nothing to anchor the highlight
  // to — registering the suggestion anyway would let the user tap Approve
  // and have it silently do nothing. Fail here instead, where the model can
  // react to it.
  if (!progress?.locator) {
    return { ok: false, suggestionId: null, error: 'no_reading_position' };
  }

  const id = suggestionId();
  db.insert(chatSuggestions)
    .values({
      id,
      sessionId: ctx.sessionId,
      kind: 'highlight',
      status: 'pending',
      text: quote,
      tags: null,
      bookId: ctx.bookId,
      locator: progress.locator,
      createdAt: new Date().toISOString(),
    })
    .run();

  return { ok: true, suggestionId: id };
}

async function suggestThought(
  text: string,
  tags: string[],
  ctx: ToolCallContext,
): Promise<{ ok: boolean; suggestionId: string | null; error?: string }> {
  const id = suggestionId();
  db.insert(chatSuggestions)
    .values({
      id,
      sessionId: ctx.sessionId,
      kind: 'thought',
      status: 'pending',
      text,
      tags: tags.length > 0 ? JSON.stringify(tags) : null,
      bookId: null,
      locator: null,
      createdAt: new Date().toISOString(),
    })
    .run();

  return { ok: true, suggestionId: id };
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

// ── Library-management tools ────────────────────────────────────────────────

type Book = typeof books.$inferSelect;

type BookResolution =
  | { ok: true; book: Book }
  | { ok: false; error: 'no_book_specified' | 'book_not_found' | 'ambiguous_book'; matches?: string[] };

/** Resolves a book from a (possibly partial) title, falling back to the book
 * the current chat is about when no title is given — so "add this to my
 * queue" said mid-book-chat just works. */
function resolveBookByTitle(title: string | undefined, ctx: ToolCallContext): BookResolution {
  const trimmed = title?.trim();

  if (!trimmed) {
    if (!ctx.bookId) return { ok: false, error: 'no_book_specified' };
    const book = db.select().from(books).where(eq(books.id, ctx.bookId)).get();
    if (!book) return { ok: false, error: 'book_not_found' };
    return { ok: true, book };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const rows = db
    .select()
    .from(books)
    .where(or(...words.map((w) => like(books.title, `%${w}%`))))
    .all();

  if (rows.length === 0) return { ok: false, error: 'book_not_found' };
  if (rows.length === 1) return { ok: true, book: rows[0] };

  const exact = rows.find((b) => b.title.toLowerCase() === trimmed.toLowerCase());
  if (exact) return { ok: true, book: exact };

  return { ok: false, error: 'ambiguous_book', matches: rows.map((b) => b.title) };
}

type CollectionResolution =
  | { ok: true; collection: { id: string; name: string } }
  | { ok: false; error: 'collection_not_found' };

/** Exact (case-insensitive) match first, then partial. Never auto-creates —
 * a missing collection is reported back so the model can chain
 * create_collection itself if that's what the user wants. */
function resolveCollectionByName(name: string): CollectionResolution {
  const trimmed = (name ?? '').trim().toLowerCase();
  if (!trimmed) return { ok: false, error: 'collection_not_found' };

  const rows = db.select().from(collections).all();
  const exact = rows.find((c) => c.name.toLowerCase() === trimmed);
  if (exact) return { ok: true, collection: exact };

  const partial = rows.find((c) => c.name.toLowerCase().includes(trimmed));
  if (partial) return { ok: true, collection: partial };

  return { ok: false, error: 'collection_not_found' };
}

interface BookActionFailure {
  title: string;
  error: string;
}

interface BookBatchActionResult {
  ok: boolean;
  succeeded: string[];
  failed: BookActionFailure[];
  error?: string;
}

/** Resolves each title independently via resolveBookByTitle, collecting
 * successes and per-title failures separately rather than failing the whole
 * batch over one bad title. Falls back to the book the current chat is about
 * when `titles` is empty/omitted, same as the single-book resolver. */
function resolveBooksByTitles(
  titles: string[] | undefined,
  ctx: ToolCallContext,
): { books: Book[]; failed: BookActionFailure[] } {
  const list = titles && titles.length > 0 ? titles : [undefined];
  const resolved: Book[] = [];
  const failed: BookActionFailure[] = [];

  for (const title of list) {
    const resolution = resolveBookByTitle(title, ctx);
    if (resolution.ok) {
      resolved.push(resolution.book);
    } else {
      failed.push({ title: title ?? '(current book)', error: resolution.error });
    }
  }

  return { books: resolved, failed };
}

/** Shared setter for the queued/archived/null transitions. Delegates to
 * `useBooksStore.getState().updateBookStatus`, which is also where the queue
 * ordering gets stamped, so the UI and chat can never disagree about it.
 * `requireStatus`, when given, guards against acting on the wrong shelf (e.g.
 * calling remove_from_queue on a book that's actually Currently Reading). */
async function setBookStatusBatch(
  bookTitles: string[] | undefined,
  newStatus: 'queued' | 'archived' | null,
  ctx: ToolCallContext,
  requireStatus?: 'reading' | 'queued' | 'archived',
): Promise<BookBatchActionResult> {
  const { books: resolved, failed } = resolveBooksByTitles(bookTitles, ctx);
  const succeeded: string[] = [];

  for (const book of resolved) {
    if (requireStatus && book.status !== requireStatus) {
      failed.push({ title: book.title, error: 'unexpected_status' });
      continue;
    }
    await useBooksStore.getState().updateBookStatus(book.id, newStatus);
    succeeded.push(book.title);
  }

  return { ok: failed.length === 0, succeeded, failed };
}

async function reorderQueueForModel(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<BookBatchActionResult> {
  const { books: resolved, failed } = resolveBooksByTitles(args.book_titles as string[] | undefined, ctx);

  const queued = resolved.filter((b) => b.status === 'queued');
  for (const book of resolved) {
    if (book.status !== 'queued') failed.push({ title: book.title, error: 'not_in_queue' });
  }
  if (queued.length === 0) {
    return { ok: false, succeeded: [], failed };
  }

  const target: { position?: 'top' | 'bottom'; beforeId?: string; afterId?: string } = {};
  const afterTitle = args.after_title as string | undefined;
  const beforeTitle = args.before_title as string | undefined;

  if (afterTitle) {
    const afterResolution = resolveBookByTitle(afterTitle, ctx);
    if (!afterResolution.ok) {
      return { ok: false, succeeded: [], failed, error: `anchor_${afterResolution.error}` };
    }
    target.afterId = afterResolution.book.id;
  } else if (beforeTitle) {
    const beforeResolution = resolveBookByTitle(beforeTitle, ctx);
    if (!beforeResolution.ok) {
      return { ok: false, succeeded: [], failed, error: `anchor_${beforeResolution.error}` };
    }
    target.beforeId = beforeResolution.book.id;
  } else {
    target.position = (args.position as 'top' | 'bottom' | undefined) ?? 'top';
  }

  // One block move, in the given order — not one reorderQueue call per book,
  // which would telescope and reverse their relative order on the second
  // and later moves against a shared anchor/position.
  await useBooksStore.getState().reorderQueue(queued.map((b) => b.id), target);
  return { ok: failed.length === 0, succeeded: queued.map((b) => b.title), failed };
}

async function toggleFavoriteForModel(
  bookTitles: string[] | undefined,
  ctx: ToolCallContext,
): Promise<BookBatchActionResult> {
  const { books: resolved, failed } = resolveBooksByTitles(bookTitles, ctx);
  const succeeded: string[] = [];

  for (const book of resolved) {
    await useBooksStore.getState().toggleFavorite(book.id);
    succeeded.push(book.title);
  }

  return { ok: failed.length === 0, succeeded, failed };
}

interface CreateCollectionResult {
  ok: boolean;
  collectionId?: string;
  error?: string;
}

async function createCollectionForModel(name: string): Promise<CreateCollectionResult> {
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, error: 'name_required' };

  const collectionId = await useCollectionsStore.getState().createCollection(trimmed);
  return { ok: true, collectionId };
}

interface CollectionBatchActionResult {
  ok: boolean;
  collectionName?: string;
  succeeded: string[];
  failed: BookActionFailure[];
  error?: string;
}

async function updateBookCollectionBatch(
  bookTitles: string[] | undefined,
  collectionName: string,
  action: 'add' | 'remove',
  ctx: ToolCallContext,
): Promise<CollectionBatchActionResult> {
  const collectionResolution = resolveCollectionByName(collectionName);
  if (!collectionResolution.ok) {
    return { ok: false, succeeded: [], failed: [], error: collectionResolution.error };
  }
  const { collection } = collectionResolution;

  const { books: resolved, failed } = resolveBooksByTitles(bookTitles, ctx);
  const succeeded: string[] = [];

  for (const book of resolved) {
    if (action === 'add') {
      await useCollectionsStore.getState().addBookToCollection(book.id, collection.id);
    } else {
      await useCollectionsStore.getState().removeBookFromCollection(book.id, collection.id);
    }
    succeeded.push(book.title);
  }

  return { ok: failed.length === 0, collectionName: collection.name, succeeded, failed };
}

export interface CollectionSummary {
  id: string;
  name: string;
  bookCount: number;
}

async function listCollectionsForModel(): Promise<CollectionSummary[]> {
  await useCollectionsStore.getState().loadCollections();
  return useCollectionsStore.getState().collections.map((c) => ({
    id: c.id,
    name: c.name,
    bookCount: c.count,
  }));
}

export function formatCollectionsForLLM(collectionList: CollectionSummary[]): string {
  if (collectionList.length === 0) return 'No collections yet.';
  return collectionList
    .map((c) => `- "${c.name}" (${c.bookCount} book${c.bookCount === 1 ? '' : 's'})`)
    .join('\n');
}
