import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import {
  OPEN_CITADEL_GUIDE,
  SAMWELL_SYSTEM_PROMPT,
  SAMWELL_SYSTEM_PROMPT_COMPACT,
  SAMWELL_SYSTEM_PROMPT_NO_TOOLS,
} from 'samwell-shared';

import { db } from '@/db/client';
import { books, chatSuggestions, collections, highlights, notes, readingProgress, thoughts } from '@/db/schema';
import { formatJourneyNotes, searchJourneyNotes } from '@/services/journey';
import {
  formatChapterListingForLLM,
  formatChapterTextForLLM,
  formatReadingForLLM,
  listChapters,
  readChapter,
  searchReading,
  type ChapterListing,
  type ChapterText,
  type ReadingSearchResult,
} from '@/services/reading-tools';
import {
  formatBookDetails,
  formatCollections,
  formatLibrarySearch,
  type CollectionListing,
  type LibraryStatus,
} from '@/services/library-format';
import {
  listCollectionsWithBooks,
  readBookDetails,
  resolveLibraryBook,
  searchLibrary,
  type BookResolution,
} from '@/services/library-lookup';
import { locatePassage } from '@/services/book-text/locate-passage';
import { estimateTokens, usableTokens } from '@/services/context-budget';
import { SEARCH_LIMITS, type ToolRuntime } from '@/services/tool-limits';
import { useBooksStore } from '@/stores/books';
import { useCollectionsStore } from '@/stores/collections';
import { useReaderStore } from '@/stores/reader';
import { useTimelineStore } from '@/stores/timeline';
import { filterTerms, isEmptyQuery, parseSearchQuery, rankByMatch, type SearchQuery } from '@/utils/search-terms';

// ── Tool definitions ────────────────────────────────────────────────────────

/*
 * The on-device tool catalogue, in the OpenAI function shape ExecuTorch takes
 * and renders into the model's chat template.
 *
 * `search_journey` is deliberately absent, and absent from here rather than
 * merely absent from `DEVICE_TOOL_NAMES`: this array is what a device with a
 * large enough window loads in full, so leaving it out of the allowlist alone
 * would still hand the journey to any on-device model with a window large
 * enough for the full set (see `promptAndToolsFor`). Journey memory is cloud-only, so it is
 * defined once, in the cloud tool definitions, and there is no path from here
 * to the engine.
 */
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
      name: 'list_chapters',
      description:
        "List the chapters of one of the user's books or blog posts that they have already reached: number, title, words, paragraphs. Use before read_chapter. Never lists chapters ahead of the user's reading position.",
      parameters: {
        type: 'object',
        properties: {
          book_title: {
            type: 'string',
            description: 'Book title (partial match). Defaults to the book this chat is about.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_chapter',
      description:
        'Read a chapter the user has already read, by number (from list_chapters or a search hit) or title, paragraphs numbered. from_paragraph starts partway: before a search hit, or to continue where the last read stopped.',
      parameters: {
        type: 'object',
        properties: {
          book_title: {
            type: 'string',
            description: 'Book title (partial match). Defaults to the book this chat is about.',
          },
          chapter: {
            type: 'string',
            description: 'Chapter number from list_chapters, or its title.',
          },
          from_paragraph: {
            type: 'number',
            description: 'Paragraph to start at, from 1.',
          },
        },
        required: ['chapter'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_reading',
      description:
        "Search the full text of what the user has read (books, opened blog posts), best passages first, each with its chapter and paragraph. Never past their position. Quote exact phrases.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Words or a "quoted phrase" to find',
          },
          book_title: {
            type: 'string',
            description: 'Search only this book or post',
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
            description: "The passage, in the book's exact words, that the user has already read",
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
        "Remove one or more books from Continue Reading (the shelf once called Currently Reading), clearing status back to unstarted (not queued, not finished). Use when the user opened a book by mistake or wants to stop reading it without marking it queued or finished. Requires user approval.",
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

// ── The on-device toolset ───────────────────────────────────────────────────

/**
 * The tools Samwell carries when running on-device.
 *
 * Tool schemas are charged against the engine's KV cache on every single
 * conversation, before a word is exchanged, and that baseline can never be
 * compacted away later — unlike conversation history, it is re-applied every
 * time the engine rebuilds. All 22 tools serialize to ~2.8k tokens; adding
 * the persona's ~1.3k system prompt puts the baseline at 122% of the
 * 4096-token window's usable space before a single message, which is exactly
 * the overflow that used to crash the app mid-conversation.
 *
 * The cut here is not about capability. It is a pure budget decision: which
 * tools earn their ~100-300 recurring tokens. Compass's own tools are absent
 * for a harder reason than budget: Compass is cloud-only, so they are never
 * offered to the on-device engine at all. Search (the core of "reading companion") and the
 * cheapest, most-requested library actions make the cut; collections,
 * suggest_*, and reorder_queue (by far the priciest single schema) stay
 * cloud-only, where the window is orders of magnitude larger. Included
 * destructive/mutating tools were already gated behind an approval dialog
 * (`APPROVAL_REQUIRED_TOOLS`) before this change, so adding them back is a
 * budget call, not a new safety surface.
 *
 * Kept below 75% of the usable window (`COMPACT_AT_RATIO` in
 * context-budget.ts — the same line the compaction system itself uses to
 * decide a conversation needs trimming) so the very first real turn doesn't
 * immediately trigger compaction before any conversation has happened.
 */
// `list_chapters` and `read_chapter` are absent for a different reason than
// budget: a chapter's worth of text is thousands of tokens on its own, which
// no on-device window could hold regardless of schema cost.
export const DEVICE_TOOL_NAMES: ReadonlySet<string> = new Set([
  // Search — the core of a reading companion.
  'search_highlights',
  'search_thoughts',
  'search_reading',
  'suggest_next_book',
  'list_collections',
  // Tagging.
  'tag_highlight',
  'tag_thought',
  // Library management. All approval-gated already; added by user request
  // once search+tagging headroom was measured (~73% of usable window).
  'add_to_queue',
  'remove_from_currently_reading',
  'delete_highlight',
  'delete_thought',
]);

/** One tool's schema, without the code that runs it. */
export type SamwellToolSchema = (typeof SAMWELL_TOOLS)[number];

/** The on-device subset. See {@link DEVICE_TOOL_NAMES}. */
export const SAMWELL_DEVICE_TOOLS: readonly SamwellToolSchema[] = SAMWELL_TOOLS.filter((t) =>
  DEVICE_TOOL_NAMES.has(t.function.name),
);

/**
 * Room a conversation needs past its baseline to be worth having: a few
 * exchanges before the first compaction.
 */
const MIN_CONVERSATION_TOKENS = 384;

/** What a prompt and its tool schemas cost before a word is exchanged. */
export function baselineTokens(systemPrompt: string, tools: readonly SamwellToolSchema[]): number {
  return tools.reduce((n, t) => n + estimateTokens(JSON.stringify(t.function)), estimateTokens(systemPrompt));
}

export interface PromptAndTools {
  systemPrompt: string;
  tools: readonly SamwellToolSchema[];
}

/**
 * The system prompt and the tools for a window, decided together.
 *
 * One decision rather than two functions, because the prompt describes the
 * tools and the two used to be chosen apart: the toolset honoured
 * `enableToolCalling` and the prompt did not, so a model with tools switched off
 * was still told it had them, and a window too small for the schemas was given
 * them anyway. Both are settled here from the same inputs, so the prompt can
 * never promise a tool the engine was not handed.
 *
 * The richest set that still leaves room to talk wins. Measured against the
 * window rather than keyed to fixed sizes, because exports come in whatever
 * window they were built with: Gemma 4 E2B's is 4048, just short of the 4096
 * the toolset used to be gated on.
 */
export function promptAndToolsFor(
  maxContextTokens: number,
  enableToolCalling: boolean,
  /** Anything else the system turn carries, such as a book's context. */
  extraTokens = 0,
): PromptAndTools {
  const choices: PromptAndTools[] = enableToolCalling
    ? [
        { systemPrompt: SAMWELL_SYSTEM_PROMPT, tools: SAMWELL_TOOLS },
        { systemPrompt: SAMWELL_SYSTEM_PROMPT_COMPACT, tools: SAMWELL_DEVICE_TOOLS },
      ]
    : [];
  const room = usableTokens(maxContextTokens) - MIN_CONVERSATION_TOKENS - extraTokens;
  return (
    choices.find((c) => baselineTokens(c.systemPrompt, c.tools) <= room) ?? {
      systemPrompt: SAMWELL_SYSTEM_PROMPT_NO_TOOLS,
      tools: [],
    }
  );
}

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
  /** Each note on a highlight with its id, which update_note and delete_note take. */
  notes?: { id: string; text: string }[];
}

// ── Tool executor ───────────────────────────────────────────────────────────

export type ToolCallContext = {
  sessionId: string;
  bookId: string | null;
  /**
   * Which Samwell is asking. The same tools serve both, but what counts as a
   * reasonable amount of material differs by three orders of magnitude
   * between a 4096-token on-device window and a frontier cloud model.
   */
  runtime: ToolRuntime;
};

/**
 * What to show the reader while a tool runs.
 *
 * Kept as a table rather than inline in the switch because the indicator has
 * to be shown *before* the tool is executed, while `executeToolCall` can only
 * report its status after. Two places needing the same string is exactly how
 * the indicator ended up claiming every unrecognised tool was searching
 * highlights.
 */
export const TOOL_STATUS: Record<string, string> = {
  search_highlights: 'Searching through highlights…',
  search_thoughts: 'Searching through thoughts…',
  search_reading: 'Checking your books…',
  list_chapters: 'Opening the book…',
  read_chapter: 'Reading the chapter…',
  suggest_next_book: 'Looking over your library…',
  tag_highlight: 'Organizing tags…',
  tag_thought: 'Organizing tags…',
  delete_highlight: 'Deleting highlight…',
  delete_thought: 'Deleting thought…',
  suggest_highlight: 'Noting that down…',
  suggest_thought: 'Noting that down…',
  remove_from_currently_reading: 'Updating your library…',
  add_to_queue: 'Updating your queue…',
  remove_from_queue: 'Updating your queue…',
  reorder_queue: 'Reordering your queue…',
  toggle_favorite: 'Updating favorites…',
  mark_as_finished: 'Marking as finished…',
  create_collection: 'Creating collection…',
  add_book_to_collection: 'Adding to collection…',
  remove_book_from_collection: 'Updating collection…',
  delete_collection: 'Removing that collection…',
  list_collections: 'Looking over your collections…',
  search_library: 'Looking through your library…',
  get_book_details: 'Looking that book up…',
  // Runs on the server, not here, but the status line is the same question.
  web_search: 'Searching the web…',
  start_reading: 'Opening that up…',
  clear_queue: 'Clearing your queue…',
  rename_book: 'Fixing that title…',
  delete_book: 'Removing that from your library…',
  add_note_to_highlight: 'Writing that down…',
  update_note: 'Rewriting that note…',
  delete_note: 'Removing that note…',
  update_thought: 'Rewriting that…',

  // Compass. Same table as the library tools, because the status line is the
  // same question ("what is he doing right now") whichever surface is asking.
  get_compass_status: 'Looking at where you are…',
  get_today: 'Checking what is due today…',
  get_trackable_history: 'Reading back your logs…',
  log_trackable: 'Writing that down…',
  propose_goal: 'Putting a plan together…',
  propose_adjustments: 'Working out what to change…',
  finish_goal: 'Closing that goal out…',
  stop_goal: 'Retiring that goal…',
  set_primary_goal: 'Moving your main goal…',
  pause_trackable: 'Pausing that…',
  resume_trackable: 'Starting that again…',
  search_journey: 'Remembering…',

  // The app explaining itself, and the first run. Same table again: what he is
  // doing right now is one question, whichever surface is asking it.
  explain_app: 'Checking how that works…',
  set_up_library: 'Setting up your library…',
  find_free_books: 'Looking through Project Gutenberg…',
  download_free_books: 'Downloading your books…',
  find_podcasts: 'Looking for podcasts…',
  follow_podcasts: 'Following those shows…',
  list_blogs: 'Looking through the blogs…',
  follow_blogs: 'Following those blogs…',
  finish_onboarding: 'Wrapping up…',
};

/**
 * The app guide, for `explain_app`.
 *
 * No I/O and no database: it is a constant in the shared package, so the whole
 * executor is a hand-off. It lives here rather than beside the onboarding
 * executors because reading chat is where it is actually reached for; the one
 * thing onboarding does with it is carry the same tool.
 */
export function runExplainApp(): { formatted: string } {
  return { formatted: OPEN_CITADEL_GUIDE };
}

/** Falls back to a neutral line rather than naming the wrong tool. */
export function toolStatus(name: string): string {
  return TOOL_STATUS[name] ?? 'Working on it…';
}

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
          ctx.runtime,
        ),
        status: toolStatus(name),
      };
    case 'search_thoughts':
      return {
        result: await searchThoughts(
          (args.query as string) ?? '',
          (args.tag as string) ?? '',
          ctx.runtime,
        ),
        status: toolStatus(name),
      };
    case 'search_reading':
      return { result: await searchReading(args, ctx), status: toolStatus(name) };
    case 'search_journey':
      return {
        result: formatJourneyNotes(searchJourneyNotes((args.query as string) ?? '')),
        status: toolStatus(name),
      };
    case 'list_chapters':
      return { result: await listChapters(args, ctx), status: toolStatus(name) };
    case 'read_chapter':
      return { result: await readChapter(args, ctx), status: toolStatus(name) };
    case 'suggest_next_book':
      return {
        result: await suggestNextBook(ctx.runtime),
        status: toolStatus(name),
      };
    case 'tag_highlight':
      return {
        result: await addTags(args.id as string, 'highlight', args.tags as string[]),
        status: toolStatus(name),
      };
    case 'tag_thought':
      return {
        result: await addTags(args.id as string, 'thought', args.tags as string[]),
        status: toolStatus(name),
      };
    case 'delete_highlight':
      return {
        result: await deleteEntry(args.id as string, 'highlight'),
        status: toolStatus(name),
      };
    case 'delete_thought':
      return {
        result: await deleteEntry(args.id as string, 'thought'),
        status: toolStatus(name),
      };
    case 'suggest_highlight':
      return {
        result: await suggestHighlight(args.quote as string, args.book_title as string | undefined, ctx),
        status: toolStatus(name),
      };
    case 'suggest_thought':
      return {
        result: await suggestThought(args.text as string, (args.tags as string[]) ?? [], ctx),
        status: toolStatus(name),
      };
    case 'remove_from_currently_reading':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, null, ctx, 'reading'),
        status: toolStatus(name),
      };
    case 'add_to_queue':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, 'queued', ctx),
        status: toolStatus(name),
      };
    case 'remove_from_queue':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, null, ctx, 'queued'),
        status: toolStatus(name),
      };
    case 'reorder_queue':
      return {
        result: await reorderQueueForModel(args, ctx),
        status: toolStatus(name),
      };
    case 'toggle_favorite':
      return {
        result: await toggleFavoriteForModel(args.book_titles as string[] | undefined, ctx),
        status: toolStatus(name),
      };
    case 'mark_as_finished':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, 'archived', ctx),
        status: toolStatus(name),
      };
    case 'delete_collection':
      return {
        result: await deleteCollectionForModel(args.collection_name as string),
        status: toolStatus(name),
      };
    case 'rename_book':
      return {
        result: await renameBookForModel(
          args.book_title as string | undefined,
          args.new_title as string,
          ctx,
        ),
        status: toolStatus(name),
      };
    case 'delete_book':
      return {
        result: await deleteBooksForModel(args.book_titles as string[] | undefined, ctx),
        status: toolStatus(name),
      };
    case 'clear_queue':
      return { result: await clearQueueForModel(), status: toolStatus(name) };
    case 'start_reading':
      return {
        result: await setBookStatusBatch(args.book_titles as string[] | undefined, 'reading', ctx),
        status: toolStatus(name),
      };
    case 'add_note_to_highlight':
      return {
        result: await addNoteForModel(args.highlight_id as string, args.text as string),
        status: toolStatus(name),
      };
    case 'update_note':
      return {
        result: await updateNoteForModel(args.note_id as string, args.text as string),
        status: toolStatus(name),
      };
    case 'delete_note':
      return {
        result: await deleteNoteForModel(args.note_id as string),
        status: toolStatus(name),
      };
    case 'update_thought':
      return {
        result: await updateThoughtForModel(args.id as string, args.text as string),
        status: toolStatus(name),
      };
    case 'create_collection':
      return {
        result: await createCollectionForModel(args.name as string),
        status: toolStatus(name),
      };
    case 'add_book_to_collection':
      return {
        result: await updateBookCollectionBatch(
          args.book_titles as string[] | undefined,
          args.collection_name as string,
          'add',
          ctx,
        ),
        status: toolStatus(name),
      };
    case 'remove_book_from_collection':
      return {
        result: await updateBookCollectionBatch(
          args.book_titles as string[] | undefined,
          args.collection_name as string,
          'remove',
          ctx,
        ),
        status: toolStatus(name),
      };
    case 'list_collections':
      return {
        result: listCollectionsWithBooks(args.collection_name as string | undefined) ?? { error: 'collection_not_found' },
        status: toolStatus(name),
      };
    case 'search_library':
      return {
        result: searchLibrary(
          {
            query: args.query as string | undefined,
            status: args.status as LibraryStatus | undefined,
            collection: args.collection as string | undefined,
            favorites: args.favorites as boolean | undefined,
          },
          ctx.runtime,
        ),
        status: toolStatus(name),
      };
    case 'get_book_details': {
      const resolved = resolveBookByTitle(args.book_title as string | undefined, ctx);
      return {
        result: resolved.ok ? await readBookDetails(resolved.book) : resolutionError(resolved),
        status: toolStatus(name),
      };
    }
    default:
      return { result: { error: `Unknown tool: ${name}` }, status: toolStatus(name) };
  }
}

// ── search_highlights implementation ────────────────────────────────────────

async function searchHighlights(
  query: string,
  bookTitle: string,
  tag: string,
  runtime: ToolRuntime,
): Promise<SearchResult[]> {
  const limits = SEARCH_LIMITS[runtime];
  const q = query.trim();
  const b = bookTitle.trim();
  const t = tag.trim();

  // No filters — return the most recent highlights
  if (!q && !b && !t) {
    return getRecentHighlights(limits.recent);
  }

  const results: SearchResult[] = [];
  // Read the way every library search reads a query (`search-terms`): quoted
  // phrases whole, words by their stem, the filler of a question dropped.
  const parsed = parseSearchQuery(q);
  const words = queryWords(q, parsed);

  // Each filter TYPE the caller supplied must ALL hold (AND) — query, tag,
  // and book_title narrow together, not as alternatives. Within a single
  // type, any of its own words matching is enough (OR); the ranking below
  // then puts the highlights holding more of them first.
  const conditions = [];
  if (q) {
    conditions.push(
      or(...words.map((w) => or(like(highlights.text, `%${w}%`), like(books.title, `%${w}%`), like(notes.text, `%${w}%`)))),
    );
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
      noteId: notes.id,
      noteText: notes.text,
    })
    .from(highlights)
    .innerJoin(books, eq(highlights.bookId, books.id))
    .leftJoin(notes, eq(notes.highlightId, highlights.id))
    .where(and(...conditions))
    .orderBy(desc(highlights.createdAt))
    // A wider net than is returned, so the ranking has something to choose from.
    .limit(q ? limits.matched * RANK_POOL : limits.matched)
    .all();

  results.push(...highlightResults(rows));

  // Also search notes text directly (may surface highlights via note content),
  // still respecting book_title/tag if the caller gave them.
  if (q) {
    const noteConditions = [or(...words.map((w) => like(notes.text, `%${w}%`)))];
    if (b) {
      const words = b.split(/\s+/).filter(Boolean);
      noteConditions.push(or(...words.map((w) => like(books.title, `%${w}%`))));
    }
    if (t) noteConditions.push(like(highlights.tags, `%"${t}"%`));

    // The highlights whose notes matched, with every note they carry.
    const noted = db
      .selectDistinct({ id: notes.highlightId })
      .from(notes)
      .innerJoin(highlights, eq(notes.highlightId, highlights.id))
      .innerJoin(books, eq(highlights.bookId, books.id))
      .where(and(...noteConditions))
      .limit(limits.notes)
      .all()
      .map((row) => row.id)
      .filter((id): id is string => !!id && !results.some((r) => r.id === id));

    if (noted.length > 0) {
      const noteRows = db
        .select({
          id: highlights.id,
          text: highlights.text,
          tags: highlights.tags,
          locator: highlights.locator,
          bookId: highlights.bookId,
          bookTitle: books.title,
          noteId: notes.id,
          noteText: notes.text,
        })
        .from(highlights)
        .innerJoin(books, eq(highlights.bookId, books.id))
        .leftJoin(notes, eq(notes.highlightId, highlights.id))
        .where(inArray(highlights.id, noted))
        .all();
      results.push(...highlightResults(noteRows));
    }
  }

  return rankWhenAsked(results, parsed, (r) => `${r.text} ${r.noteText ?? ''} ${r.bookTitle ?? ''}`).slice(0, limits.matched);
}

/** How many times more rows are fetched than returned, for the ranking to choose from. */
const RANK_POOL = 4;

/** The words to look for: the query's meaningful terms, or its raw words when it had nothing but filler. */
function queryWords(raw: string, parsed: SearchQuery): string[] {
  const terms = filterTerms(parsed);
  return terms.length > 0 ? terms : raw.split(/\s+/).filter(Boolean);
}

/** Best match first when the query had something to rank by; newest first otherwise. */
function rankWhenAsked<T>(rows: T[], parsed: SearchQuery, textOf: (row: T) => string): T[] {
  if (isEmptyQuery(parsed)) return rows;
  const ranked = rankByMatch(rows, parsed, textOf);
  return ranked.length > 0 ? ranked : rows;
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
      noteId: notes.id,
      noteText: notes.text,
    })
    .from(highlights)
    .innerJoin(books, eq(highlights.bookId, books.id))
    .leftJoin(notes, eq(notes.highlightId, highlights.id))
    // The newest highlights first, then all their notes: limiting the joined
    // rows instead let one highlight with many notes crowd out the rest.
    .where(
      inArray(
        highlights.id,
        db.select({ id: highlights.id }).from(highlights).orderBy(desc(highlights.createdAt)).limit(limit),
      ),
    )
    .orderBy(desc(highlights.createdAt))
    .all();

  return highlightResults(rows);
}

/** A highlight joined to its notes, one row a note, as one result a highlight with every note and its id. */
function highlightResults(
  rows: readonly {
    id: string;
    text: string;
    tags: string | null;
    locator: string | null;
    bookId: string;
    bookTitle: string;
    noteId: string | null;
    noteText: string | null;
  }[],
): SearchResult[] {
  const seen = new Map<string, SearchResult & { notes: { id: string; text: string }[] }>();
  for (const row of rows) {
    let entry = seen.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        type: 'highlight',
        bookId: row.bookId,
        bookTitle: row.bookTitle,
        text: row.text,
        tags: parseTags(row.tags),
        locator: row.locator,
        noteText: null,
        notes: [],
      };
      seen.set(row.id, entry);
    }
    if (row.noteId && row.noteText && !entry.notes.some((note) => note.id === row.noteId)) {
      entry.notes.push({ id: row.noteId, text: row.noteText });
      entry.noteText = entry.noteText ? `${entry.noteText} | ${row.noteText}` : row.noteText;
    }
  }
  return [...seen.values()];
}

/** Tags as stored (a JSON array), or none when the column is empty or not JSON. */
function parseTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const tags: unknown = JSON.parse(json);
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

// ── search_thoughts implementation ─────────────────────────────────────────

async function searchThoughts(
  query: string,
  tag: string,
  runtime: ToolRuntime,
): Promise<SearchResult[]> {
  const limits = SEARCH_LIMITS[runtime];
  const q = query.trim();
  const t = tag.trim();

  // No filters — return the most recent thoughts
  if (!q && !t) {
    const rows = db
      .select()
      .from(thoughts)
      .orderBy(desc(thoughts.createdAt))
      .limit(limits.recent)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: 'thought' as const,
      bookId: null,
      bookTitle: null,
      text: row.text,
      tags: parseTags(row.tags),
      locator: null,
      noteText: null,
    }));
  }

  // query and tag must both hold when both are given — see the identical
  // fix in searchHighlights above for why this used to be a plain OR.
  const parsed = parseSearchQuery(q);
  const conditions = [];
  if (q) conditions.push(or(...queryWords(q, parsed).map((w) => like(thoughts.text, `%${w}%`))));
  if (t) conditions.push(like(thoughts.tags, `%"${t}"%`));

  const pool = db
    .select()
    .from(thoughts)
    .where(and(...conditions))
    .orderBy(desc(thoughts.createdAt))
    .limit(q ? limits.matched * RANK_POOL : limits.matched)
    .all();
  const rows = rankWhenAsked(pool, parsed, (row) => row.text).slice(0, limits.matched);

  return rows.map((row) => ({
    id: row.id,
    type: 'thought' as const,
    bookId: null,
    bookTitle: null,
    text: row.text,
    tags: parseTags(row.tags),
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

  const existing = parseTags(row.tags);
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

/**
 * A highlight Samwell proposes, anchored where the passage is in the book.
 *
 * It used to be anchored at the reader's position when he suggested it: the
 * timeline showed the highlight and the book never drew it, since the reader
 * draws a highlight by finding its text on the page it points at. Now the
 * quote is found in what has been read (`locatePassage`), and what the card
 * shows and approving saves is the book's own wording at its own place. A
 * quote that cannot be found is said back to him to correct, rather than
 * saved somewhere it is not.
 */
async function suggestHighlight(
  quote: string,
  bookTitle: string | undefined,
  ctx: ToolCallContext,
): Promise<{ ok: boolean; suggestionId: string | null; passage?: string; error?: string }> {
  if (!quote?.trim()) return { ok: false, suggestionId: null, error: 'quote_required' };
  const resolved = resolveLibraryBook(bookTitle, ctx.bookId, { includePosts: true });
  if (!resolved.ok) {
    const error = resolved.error === 'no_book_specified' ? 'no_book_context' : resolved.error;
    return { ok: false, suggestionId: null, error };
  }
  const book = resolved.book;

  const located = await locatePassage(book, quote);
  if ('error' in located) return { ok: false, suggestionId: null, error: located.error };

  const id = suggestionId();
  db.insert(chatSuggestions)
    .values({
      id,
      sessionId: ctx.sessionId,
      kind: 'highlight',
      status: 'pending',
      text: located.text,
      tags: null,
      bookId: book.id,
      locator: JSON.stringify(located.locator),
      createdAt: new Date().toISOString(),
    })
    .run();

  return { ok: true, suggestionId: id, passage: located.text };
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

// ── suggest_next_book implementation ───────────────────────────────────────

export interface BookCandidate {
  /** Needed so a recommendation can be rendered as the book itself, not a name. */
  id: string;
  title: string;
  author: string;
  category: string | null;
  status: string | null;
  percentage: number | null;
  completedAt: string | null;
}

async function suggestNextBook(runtime: ToolRuntime): Promise<BookCandidate[]> {
  const rows = db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      category: books.category,
      status: books.status,
      completedAt: books.completedAt,
      percentage: readingProgress.percentage,
    })
    .from(books)
    .leftJoin(readingProgress, eq(readingProgress.bookId, books.id))
    .where(eq(books.kind, 'book'))
    .orderBy(desc(books.addedAt))
    .limit(SEARCH_LIMITS[runtime].library)
    .all();

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    category: r.category ?? null,
    status: r.status ?? null,
    percentage: r.percentage ?? null,
    completedAt: r.completedAt ?? null,
  }));
}

export function formatBookCandidatesForLLM(
  candidates: BookCandidate[],
  tokenBudget: number,
): string {
  // Two lines per book, with the marker on its own labelled line. The model
  // reliably reproduces `Ref:` markers for highlights, which are formatted
  // exactly this way, and reliably dropped them when the book marker was
  // tacked onto the end of a prose line instead.
  const line = (b: BookCandidate) =>
    `- "${b.title}" by ${b.author}` +
    (b.category ? ` (${b.category})` : '') +
    (b.status === 'reading' && b.percentage != null
      ? `, ${Math.round(b.percentage * 100)}% read`
      : '') +
    `\n  Ref: [[book:${b.id}]]`;

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

  if (sections.length === 0) return 'The library is empty.';

  // A large library would otherwise be an unbounded dump. Trimming the tail
  // and saying so beats silently handing over a wall of titles. Trimming is
  // per book, so a title never survives without the marker that renders it.
  const out = sections.join('\n\n');
  if (estimateTokens(out) <= tokenBudget) return out;

  const kept: string[] = [];
  let spent = 0;
  for (const block of out.split('\n\n')) {
    for (const entry of block.split('\n- ')) {
      const text = entry.startsWith('- ') || !entry.includes('Ref:') ? entry : `- ${entry}`;
      const cost = estimateTokens(text);
      if (spent + cost > tokenBudget) {
        return `${kept.join('\n')}\n\n(Library list trimmed to fit. Ask for a narrower slice if you need more.)`;
      }
      spent += cost;
      kept.push(text);
    }
  }
  return kept.join('\n');
}

// ── Format tool results for the LLM ────────────────────────────────────────

/** Longest verbatim excerpt of a single highlight or note fed back to the model. */
const MAX_RESULT_TEXT_CHARS = 320;


function clampText(text: string, max = MAX_RESULT_TEXT_CHARS): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}…`;
}

/**
 * Serialize search results for the model, bounded by a token budget.
 *
 * Results are emitted newest/most-relevant first and cut off once the budget
 * is spent, with an explicit tally of what was withheld — the model needs to
 * know the list was truncated so it can offer to narrow the search rather
 * than assert it has seen everything. Ids and `[[ref:...]]` markers are never
 * truncated; the reader UI resolves reference cards from them.
 */
export function formatSearchResultsForLLM(
  results: SearchResult[],
  tokenBudget: number,
): string {
  if (results.length === 0) return 'No results found.';

  const blocks: string[] = [];
  let spent = 0;

  for (const [i, r] of results.entries()) {
    const lines = [`${i + 1}. "${clampText(r.text)}"`];
    if (r.bookTitle) lines.push(`   Book: ${r.bookTitle}`);
    if (r.notes && r.notes.length > 0) {
      for (const note of r.notes) lines.push(`   Note (note_id ${note.id}): ${clampText(note.text)}`);
    } else if (r.noteText) {
      lines.push(`   Note: ${clampText(r.noteText)}`);
    }
    if (r.tags.length > 0) lines.push(`   Tags: ${r.tags.join(', ')}`);
    lines.push(`   ID: ${r.id}`);
    lines.push(`   Ref: [[ref:${r.type}:${r.id}]]`);

    const block = lines.join('\n');
    const cost = estimateTokens(block);
    // Always emit at least one result, even an oversized one, so a search
    // never comes back looking empty when it did find something.
    if (blocks.length > 0 && spent + cost > tokenBudget) break;
    spent += cost;
    blocks.push(block);
  }

  const omitted = results.length - blocks.length;
  if (omitted > 0) {
    blocks.push(
      `(${omitted} more result${omitted === 1 ? '' : 's'} not shown. Ask the user to narrow the search if you need them.)`,
    );
  }

  return blocks.join('\n\n');
}



/** Most cards to attach when the model named books but emitted no markers. */
const MAX_RECOVERED_BOOK_MARKERS = 3;

/**
 * Attach book markers the model named in prose but failed to emit.
 *
 * A small on-device model follows the marker protocol unevenly — it will
 * recommend a book by name and leave out the `[[book:...]]` that renders it.
 * Rather than depend on the model getting it right, any book from this turn's
 * own suggestions whose title appears in the reply gets its marker appended.
 * Only titles the tool actually returned are considered, so this cannot
 * invent a card for a book Samwell was not offered.
 */
export function ensureBookMarkers(reply: string, candidates: BookCandidate[]): string {
  if (candidates.length === 0 || !reply.trim()) return reply;

  const haystack = reply.toLowerCase();
  const missing = candidates
    .filter((b) => {
      // Short titles ("It", "Us") match far too much ordinary prose to be
      // safe to detect this way.
      if (b.title.trim().length < 4) return false;
      if (reply.includes(`[[book:${b.id}]]`)) return false;
      return haystack.includes(b.title.toLowerCase());
    })
    .slice(0, MAX_RECOVERED_BOOK_MARKERS);

  if (missing.length === 0) return reply;

  // Appended rather than spliced in beside the title: injecting mid-sentence
  // risks breaking markdown the model has already formatted.
  return `${reply.trimEnd()}\n\n${missing.map((b) => `[[book:${b.id}]]`).join('\n')}`;
}

/**
 * Turn any tool's result into the text the model sees.
 *
 * Both runtimes go through here. The offline path used to inline its own
 * subset of this and fall through to `JSON.stringify` for everything it did
 * not name, which is why on-device Samwell never saw the `[[book:...]]`
 * markers that make a recommendation render with its cover — the formatter
 * that adds them was only ever reached by the cloud path.
 */
export function formatToolResultForLLM(
  name: string,
  result: unknown,
  tokenBudget: number,
): string {
  switch (name) {
    case 'search_highlights':
    case 'search_thoughts':
      return Array.isArray(result)
        ? formatSearchResultsForLLM(result as SearchResult[], tokenBudget)
        : JSON.stringify(result);
    case 'search_reading':
      return formatReadingForLLM(result as ReadingSearchResult, tokenBudget);
    case 'suggest_next_book':
      return Array.isArray(result)
        ? formatBookCandidatesForLLM(result as BookCandidate[], tokenBudget)
        : JSON.stringify(result);
    case 'list_collections':
      return Array.isArray(result)
        ? formatCollections(result as CollectionListing[], tokenBudget)
        : 'No collection by that name. Call list_collections without a name to see them all.';
    case 'search_library': {
      const found = result as Parameters<typeof formatLibrarySearch>[0];
      return formatLibrarySearch(found, undefined, tokenBudget);
    }
    case 'get_book_details':
      return result && typeof result === 'object' && 'book' in result
        ? formatBookDetails(result as Parameters<typeof formatBookDetails>[0])
        : JSON.stringify(result);
    case 'list_chapters':
      return formatChapterListingForLLM(result as ChapterListing | { error: string });
    case 'read_chapter':
      return formatChapterTextForLLM(result as ChapterText | { error: string });
    default:
      // Action tools return small ok/error records; their shape is the message.
      return JSON.stringify(result);
  }
}

// ── Library-management tools ────────────────────────────────────────────────

type Book = typeof books.$inferSelect;

/** Which book a title means: one decision, in `library-lookup.ts`, for every tool. */
function resolveBookByTitle(title: string | undefined, ctx: ToolCallContext): BookResolution {
  return resolveLibraryBook(title, ctx.bookId);
}

/** A failed lookup as the model should read it: near matches named, so it can ask which. */
function resolutionError(resolution: Extract<BookResolution, { ok: false }>): { error: string; matches?: string[] } {
  return resolution.matches ? { error: resolution.error, matches: resolution.matches } : { error: resolution.error };
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
 * calling remove_from_queue on a book that's actually in Continue Reading). */
async function setBookStatusBatch(
  bookTitles: string[] | undefined,
  newStatus: 'reading' | 'queued' | 'archived' | null,
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

interface DeleteCollectionResult {
  ok: boolean;
  name?: string;
  bookCount?: number;
  error?: string;
}

interface RenameBookResult {
  ok: boolean;
  from?: string;
  to?: string;
  error?: string;
}

interface NoteResult {
  ok: boolean;
  noteId?: string;
  error?: string;
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

/**
 * Delete a collection, leaving its books alone.
 *
 * The count goes back in the result because the approval dialog says it out
 * loud: "3 books" is the difference between a grouping somebody forgot about
 * and one they have been filling for a month, and it is the only fact that
 * makes the confirmation worth reading.
 */
async function deleteCollectionForModel(
  collectionName: string,
): Promise<DeleteCollectionResult> {
  const resolution = resolveCollectionByName(collectionName);
  if (!resolution.ok) return { ok: false, error: resolution.error };

  const { collection } = resolution;
  const bookCount = (await useCollectionsStore.getState().getCollectionBooks(collection.id)).length;
  await useCollectionsStore.getState().deleteCollection(collection.id);
  return { ok: true, name: collection.name, bookCount };
}

/** Correct one book's title. */
async function renameBookForModel(
  bookTitle: string | undefined,
  newTitle: string,
  ctx: ToolCallContext,
): Promise<RenameBookResult> {
  const trimmed = newTitle?.trim();
  if (!trimmed) return { ok: false, error: 'title_required' };

  const { books: resolved, failed } = resolveBooksByTitles(
    bookTitle ? [bookTitle] : undefined,
    ctx,
  );
  const book = resolved[0];
  if (!book) return { ok: false, error: failed[0]?.error ?? 'book_not_found' };

  await useBooksStore.getState().updateBookTitle(book.id, trimmed);
  return { ok: true, from: book.title, to: trimmed };
}

/**
 * Delete books from the library.
 *
 * Takes everything with them — highlights, notes, progress — which is why the
 * tool description says so and the approval copy repeats it. The UI puts this
 * behind its own confirm for the same reason.
 */
async function deleteBooksForModel(
  bookTitles: string[] | undefined,
  ctx: ToolCallContext,
): Promise<BookBatchActionResult> {
  const { books: resolved, failed } = resolveBooksByTitles(bookTitles, ctx);
  const succeeded: string[] = [];

  for (const book of resolved) {
    await useBooksStore.getState().deleteBook(book.id);
    succeeded.push(book.title);
  }

  return { ok: succeeded.length > 0, succeeded, failed };
}

/** Empty the queue. The books stay in the library. */
async function clearQueueForModel(): Promise<BookBatchActionResult> {
  const queued = useBooksStore
    .getState()
    .books.filter((book) => book.status === 'queued')
    .map((book) => book.title);

  await useBooksStore.getState().clearQueue();
  return { ok: true, succeeded: queued, failed: [] };
}

/** Write a note on a highlight. */
async function addNoteForModel(highlightId: string, text: string): Promise<NoteResult> {
  const trimmed = text?.trim();
  if (!trimmed) return { ok: false, error: 'text_required' };
  if (!highlightId) return { ok: false, error: 'highlight_not_found' };

  const noteId = await useReaderStore.getState().addNote(highlightId, trimmed);
  return noteId ? { ok: true, noteId } : { ok: false, error: 'highlight_not_found' };
}

/**
 * The note an id names, and its highlight. The highlight is read off the
 * note rather than taken from the call: the id is what is unique, and a model
 * that pairs a note with the wrong highlight should still change the note it
 * named, not report success on a write that matched nothing.
 */
function findNote(noteId: string): { id: string; highlightId: string | null } | null {
  if (!noteId) return null;
  return db.select({ id: notes.id, highlightId: notes.highlightId }).from(notes).where(eq(notes.id, noteId)).get() ?? null;
}

/** Rewrite a note. */
async function updateNoteForModel(
  noteId: string,
  text: string,
): Promise<NoteResult> {
  const trimmed = text?.trim();
  if (!trimmed) return { ok: false, error: 'text_required' };
  const note = findNote(noteId);
  if (!note) return { ok: false, error: 'note_not_found' };

  await useReaderStore.getState().updateNote(note.id, note.highlightId ?? '', trimmed);
  return { ok: true, noteId: note.id };
}

/** Delete a note, leaving its highlight. */
async function deleteNoteForModel(noteId: string): Promise<NoteResult> {
  const note = findNote(noteId);
  if (!note) return { ok: false, error: 'note_not_found' };

  await useReaderStore.getState().deleteNote(note.id, note.highlightId ?? '');
  return { ok: true, noteId: note.id };
}

/**
 * Rewrite a thought.
 *
 * Colour and tags are left exactly as they were: the model is changing words,
 * and silently resetting the rest because it did not pass them would lose work
 * the user did by hand.
 */
async function updateThoughtForModel(
  id: string,
  text: string,
): Promise<{ ok: boolean; id?: string; type?: 'thought'; error?: string }> {
  const trimmed = text?.trim();
  if (!trimmed) return { ok: false, error: 'text_required' };

  const row = db
    .select({ id: thoughts.id, color: thoughts.color, tags: thoughts.tags })
    .from(thoughts)
    .where(eq(thoughts.id, id))
    .get();
  if (!row) return { ok: false, error: 'thought_not_found' };

  // Colour and tags read back off the row and handed straight through, so the
  // update touches only the text. `updateThought` takes all four and would
  // otherwise blank the two the model never mentioned.
  const tags = parseTags(row.tags);
  // `color` is nullable on the row; the store wants a string. An untinted
  // thought stays untinted.
  await useTimelineStore.getState().updateThought(id, trimmed, row.color ?? '', tags);
  return { ok: true, id, type: 'thought' };
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
