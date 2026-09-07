import { and, desc, eq, like, or } from 'drizzle-orm';
import type { ToolDefinition } from '@dr33m/react-native-litert-lm';
import {
  OPEN_CITADEL_GUIDE,
  SAMWELL_SYSTEM_PROMPT,
  SAMWELL_SYSTEM_PROMPT_COMPACT,
} from 'samwell-shared';

import { db } from '@/db/client';
import { books, chatSuggestions, collections, highlights, notes, readingProgress, thoughts } from '@/db/schema';
import { extractReadSections } from '@/services/book-context';
import { formatJourneyNotes, searchJourneyNotes } from '@/services/journey';
import { CHARS_PER_TOKEN, estimateTokens } from '@/services/context-budget';
import {
  READING_LIMITS,
  SEARCH_LIMITS,
  TOOL_RESULT_TOKEN_BUDGET,
  type ToolRuntime,
} from '@/services/tool-limits';
import { useBooksStore } from '@/stores/books';
import { useCollectionsStore } from '@/stores/collections';
import { useReaderStore } from '@/stores/reader';
import { useTimelineStore } from '@/stores/timeline';

// ── Tool definitions ────────────────────────────────────────────────────────

/*
 * The tool catalogue in the on-device engine's format.
 *
 * `search_journey` is deliberately absent, and absent from here rather than
 * merely absent from `DEVICE_TOOL_NAMES`: this array is what a device with a
 * large enough window loads in full, so leaving it out of the allowlist alone
 * would still hand the journey to any on-device model past
 * `FULL_TOOLSET_MIN_CONTEXT_TOKENS`. Journey memory is cloud-only, so it is
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
        "List the chapters of one of the user's books that they have already reached, with rough lengths. Use before read_chapter to see what is actually there. Never lists chapters ahead of the user's reading position.",
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
        'Read the full text of one chapter the user has already read, by number (from list_chapters) or title. Use when a keyword search is too narrow and you need the whole argument of a chapter.',
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

const toLiteRT = (t: (typeof SAMWELL_TOOLS)[number]): ToolDefinition => ({
  name: t.function.name,
  description: t.function.description,
  parametersJson: JSON.stringify(t.function.parameters),
});

/** Every tool, for windows large enough to afford the full catalogue. */
export const SAMWELL_TOOLS_LITERT: ToolDefinition[] = SAMWELL_TOOLS.map(toLiteRT);

/** The on-device subset. See {@link DEVICE_TOOL_NAMES}. */
export const SAMWELL_TOOLS_LITERT_DEVICE: ToolDefinition[] = SAMWELL_TOOLS.filter((t) =>
  DEVICE_TOOL_NAMES.has(t.function.name),
).map(toLiteRT);

/**
 * Context window at which the full catalogue stops crowding out the
 * conversation. At 8192 the schemas cost roughly a third of the usable window
 * instead of overrunning it outright.
 */
const FULL_TOOLSET_MIN_CONTEXT_TOKENS = 8192;

/**
 * Tools to load for a given context window.
 *
 * The subset is a consequence of the budget rather than a permanent
 * downgrade: raise `contextSize` past
 * {@link FULL_TOOLSET_MIN_CONTEXT_TOKENS} and the full catalogue comes back
 * on its own.
 */
export function toolsForContext(maxContextTokens: number): ToolDefinition[] {
  return maxContextTokens >= FULL_TOOLSET_MIN_CONTEXT_TOKENS
    ? SAMWELL_TOOLS_LITERT
    : SAMWELL_TOOLS_LITERT_DEVICE;
}

/**
 * The system prompt that matches that toolset.
 *
 * Same threshold, deliberately in the same function-pair as `toolsForContext`:
 * the compact prompt names only the tools in `DEVICE_TOOL_NAMES`, so a window
 * that loads the full catalogue must get the full prompt or Samwell will not
 * know he has half his tools. Two thresholds in two files is how they drift.
 */
export function systemPromptForContext(maxContextTokens: number): string {
  return maxContextTokens >= FULL_TOOLSET_MIN_CONTEXT_TOKENS
    ? SAMWELL_SYSTEM_PROMPT
    : SAMWELL_SYSTEM_PROMPT_COMPACT;
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
      return {
        result: await searchReading((args.query as string) ?? '', ctx.runtime),
        status: toolStatus(name),
      };
    case 'search_journey':
      return {
        result: formatJourneyNotes(searchJourneyNotes((args.query as string) ?? '')),
        status: toolStatus(name),
      };
    case 'list_chapters':
      return {
        result: await listChapters(args.book_title as string | undefined, ctx),
        status: toolStatus(name),
      };
    case 'read_chapter':
      return {
        result: await readChapter(
          args.book_title as string | undefined,
          (args.chapter as string) ?? '',
          ctx,
        ),
        status: toolStatus(name),
      };
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
        result: await suggestHighlight(args.quote as string, ctx),
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
        result: await updateNoteForModel(
          args.note_id as string,
          args.highlight_id as string,
          args.text as string,
        ),
        status: toolStatus(name),
      };
    case 'delete_note':
      return {
        result: await deleteNoteForModel(
          args.note_id as string,
          args.highlight_id as string,
        ),
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
        result: await listCollectionsForModel(),
        status: toolStatus(name),
      };
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
    .limit(limits.matched)
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
      .limit(limits.notes)
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

  return results.slice(0, limits.matched);
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
    .limit(limits.matched)
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
  /** Chapter or section the passage came from, where the book names one. */
  section: string | null;
  snippet: string;
}

/** Below this, too little has been read for a search to say anything useful. */
const READING_MIN_READ_CHARS = 2_000;


export interface ReadingSearchResult {
  snippets: ReadingSnippet[];
  /**
   * Titles of the read sections that were searched.
   *
   * Returned so a search that finds nothing is still informative: Samwell
   * learns what is actually in reach and can requery in the book's own
   * language, instead of concluding the library is empty or asking the reader
   * to supply the passage himself.
   */
  chapters: string[];
}

/**
 * The spoiler boundary for one book: how far the reader has got.
 *
 * `null` means the book is finished and fully readable. `undefined` means
 * nothing is safely readable — a book marked as reading with no saved
 * position, which must fail closed rather than default to the whole text.
 */
function readLocatorFor(book: Book): unknown | undefined {
  if (book.status !== 'reading') return null;
  const prog = db
    .select({ locator: readingProgress.locator })
    .from(readingProgress)
    .where(eq(readingProgress.bookId, book.id))
    .get();
  if (!prog?.locator) return undefined;
  return JSON.parse(prog.locator);
}

async function searchReading(query: string, runtime: ToolRuntime): Promise<ReadingSearchResult> {
  const limits = READING_LIMITS[runtime];
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return { snippets: [], chapters: [] };

  const reading = db.select().from(books).where(eq(books.status, 'reading')).all();
  const finished = db
    .select()
    .from(books)
    .where(eq(books.status, 'archived'))
    .orderBy(desc(books.completedAt))
    .limit(limits.finishedBooks)
    .all();

  const snippets: ReadingSnippet[] = [];
  const chapters: string[] = [];
  let totalChars = 0;

  for (const book of [...reading, ...finished]) {
    if (snippets.length >= limits.maxSnippets || totalChars >= limits.totalChars) break;
    if (!book.filePath) continue;

    try {
      const locator = readLocatorFor(book);
      if (locator === undefined) continue;

      // Sections rather than one blob: the book's own structure says which
      // parts are jacket copy and what each chapter is called, and both are
      // lost the moment it is flattened.
      const sections = await extractReadSections(book.filePath, locator as never);
      const body = sections.filter((sec) => !sec.frontMatter);
      const readChars = body.reduce((n, sec) => n + sec.text.length, 0);
      if (readChars < READING_MIN_READ_CHARS) continue;

      for (const section of body) {
        if (section.title && !chapters.includes(section.title)) chapters.push(section.title);
      }

      let perBook = 0;

      for (const section of body) {
        if (perBook >= limits.maxPerBook) break;
        if (snippets.length >= limits.maxSnippets) break;

        const lower = section.text.toLowerCase();
        const takenAt: number[] = [];

        for (const word of words) {
          if (perBook >= limits.maxPerBook) break;

          const idx = lower.indexOf(word);
          if (idx < 0) continue;
          // Two query words landing in the same paragraph would otherwise
          // return near-identical snippets and spend the budget twice.
          if (takenAt.some((t) => Math.abs(t - idx) < limits.window * 2)) continue;

          const start = Math.max(0, idx - limits.window);
          const end = Math.min(section.text.length, idx + limits.window);
          const snippet =
            (start > 0 ? '…' : '') +
            section.text.slice(start, end).trim() +
            (end < section.text.length ? '…' : '');

          snippets.push({
            book: book.title,
            author: book.author,
            section: section.title,
            snippet,
          });
          takenAt.push(idx);
          perBook++;
          totalChars += snippet.length;
        }
      }
    } catch {
      // Skip unreadable/unparseable books.
    }
  }

  return { snippets, chapters };
}

/**
 * Share of the result budget the fallback chapter list may spend. It is a
 * consolation prize for a failed search, not the answer, so it takes a slice
 * rather than the whole allowance.
 */
const CHAPTER_LIST_BUDGET_SHARE = 0.4;

// ── Book browsing (list_chapters / read_chapter) ────────────────────────────

export interface ChapterEntry {
  /** Spine position, and the handle `read_chapter` takes. */
  index: number;
  title: string | null;
  /** Roughly how long the section is, so a caller can judge before reading it. */
  approxWords: number;
  /** The section the reader is partway through. */
  current: boolean;
}

export interface ChapterListing {
  book: string;
  author: string;
  chapters: ChapterEntry[];
}

/**
 * The chapters of a book the reader has actually reached.
 *
 * Deliberately stops at the reading position rather than listing the whole
 * table of contents. Chapter titles ahead of the reader give away plot as
 * readily as the text does, so the spoiler boundary applies to the map as
 * well as the territory.
 */
async function listChapters(
  bookTitle: string | undefined,
  ctx: ToolCallContext,
): Promise<ChapterListing | { error: string }> {
  const resolved = resolveBookByTitle(bookTitle, ctx);
  if (!resolved.ok) return { error: resolved.error };
  const book = resolved.book;
  if (!book.filePath) return { error: 'book_file_missing' };

  const locator = readLocatorFor(book);
  if (locator === undefined) return { error: 'nothing_read_yet' };

  const sections = await extractReadSections(book.filePath, locator as never);
  const body = sections.filter((sec) => !sec.frontMatter);

  return {
    book: book.title,
    author: book.author,
    chapters: body.map((sec) => ({
      index: sec.index,
      title: sec.title,
      approxWords: Math.round(sec.text.split(/\s+/).length / 10) * 10,
      current: sec.partial,
    })),
  };
}

export interface ChapterText {
  book: string;
  title: string | null;
  index: number;
  text: string;
  /** True when the reader has not finished this chapter and it was cut short. */
  partial: boolean;
  /** True when the text was trimmed to fit the caller's budget. */
  truncated: boolean;
}

/**
 * The full text of one already-read chapter.
 *
 * The counterpart to {@link listChapters}: having seen what is there, read
 * the one that matters instead of matching keywords blindly. Only offered
 * where the context window can hold a chapter, which on device it cannot.
 */
async function readChapter(
  bookTitle: string | undefined,
  chapter: string,
  ctx: ToolCallContext,
): Promise<ChapterText | { error: string }> {
  const resolved = resolveBookByTitle(bookTitle, ctx);
  if (!resolved.ok) return { error: resolved.error };
  const book = resolved.book;
  if (!book.filePath) return { error: 'book_file_missing' };

  const locator = readLocatorFor(book);
  if (locator === undefined) return { error: 'nothing_read_yet' };

  const sections = await extractReadSections(book.filePath, locator as never);
  const body = sections.filter((sec) => !sec.frontMatter);
  if (body.length === 0) return { error: 'nothing_read_yet' };

  const wanted = chapter.trim().toLowerCase();
  const asIndex = Number.parseInt(wanted, 10);
  const section =
    body.find((sec) => sec.index === asIndex) ??
    body.find((sec) => sec.title?.toLowerCase() === wanted) ??
    body.find((sec) => sec.title?.toLowerCase().includes(wanted));

  if (!section) return { error: 'chapter_not_found_or_not_read_yet' };

  const maxChars = TOOL_RESULT_TOKEN_BUDGET[ctx.runtime] * Math.floor(CHARS_PER_TOKEN);
  const truncated = section.text.length > maxChars;

  return {
    book: book.title,
    title: section.title,
    index: section.index,
    text: truncated ? `${section.text.slice(0, maxChars)}…` : section.text,
    partial: section.partial,
    truncated,
  };
}

export function formatChapterListingForLLM(listing: ChapterListing | { error: string }): string {
  if ('error' in listing) return `Could not list chapters: ${listing.error}.`;
  if (listing.chapters.length === 0) {
    return `The reader has not started "${listing.book}" yet, so there is nothing to browse.`;
  }
  const lines = listing.chapters.map(
    (c) =>
      `${c.index}. ${c.title ?? '(untitled section)'} — ~${c.approxWords} words` +
      `${c.current ? ' (currently reading, partially read)' : ''}`,
  );
  return (
    `Chapters of "${listing.book}" the reader has reached. Use read_chapter with the number or title to read one in full.\n\n` +
    lines.join('\n')
  );
}

export function formatChapterTextForLLM(chapter: ChapterText | { error: string }): string {
  if ('error' in chapter) return `Could not read that chapter: ${chapter.error}.`;
  const header = `"${chapter.book}", ${chapter.title ?? `section ${chapter.index}`}`;
  const notes = [
    chapter.partial ? 'the reader is partway through this chapter, so it stops at their position' : null,
    chapter.truncated ? 'the text was trimmed to fit' : null,
  ].filter(Boolean);
  const suffix = notes.length > 0 ? `\n\n(Note: ${notes.join('; ')}.)` : '';
  return `From ${header}:\n\n${chapter.text}${suffix}`;
}

export function formatReadingForLLM(
  result: ReadingSearchResult,
  tokenBudget: number,
): string {
  const { snippets, chapters } = result;

  if (snippets.length === 0) {
    // A failed search still hands back the map. Naming the sections that were
    // searched lets Samwell try again in the book's own words, which is the
    // difference between a dead end and a second attempt.
    const base =
      'No passage matched in the parts of these books the reader has reached. Only text up to their current position is searchable.';
    if (chapters.length === 0) {
      return `${base} Try asking about their highlights instead.`;
    }
    const listBudget = tokenBudget * CHAPTER_LIST_BUDGET_SHARE;
    const listed: string[] = [];
    let spent = 0;
    for (const title of chapters) {
      const cost = estimateTokens(title);
      if (listed.length > 0 && spent + cost > listBudget) break;
      spent += cost;
      listed.push(title);
    }
    const more = chapters.length - listed.length;
    return (
      `${base} Sections read so far: ${listed.join('; ')}` +
      `${more > 0 ? ` (and ${more} more)` : ''}.` +
      ' Search again with wording drawn from these, or ask about their highlights.'
    );
  }

  const blocks: string[] = [];
  let spent = 0;

  for (const [i, s] of snippets.entries()) {
    const from = s.section ? `"${s.book}", ${s.section}` : `"${s.book}"`;
    const block = `${i + 1}. From ${from} by ${s.author}:\n   "${s.snippet}"`;
    const cost = estimateTokens(block);
    if (blocks.length > 0 && spent + cost > tokenBudget) break;
    spent += cost;
    blocks.push(block);
  }

  const omitted = snippets.length - blocks.length;
  if (omitted > 0) {
    blocks.push(`(${omitted} more passage${omitted === 1 ? '' : 's'} not shown.)`);
  }

  return blocks.join('\n\n');
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
      ? ` — ${Math.round(b.percentage * 100)}% read`
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
    if (r.noteText) lines.push(`   Note: ${clampText(r.noteText)}`);
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
        ? formatCollectionsForLLM(result as CollectionSummary[], tokenBudget)
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

  const row = db
    .select({ id: highlights.id })
    .from(highlights)
    .where(eq(highlights.id, highlightId))
    .get();
  if (!row) return { ok: false, error: 'highlight_not_found' };

  await useReaderStore.getState().addNote(highlightId, trimmed);
  return { ok: true };
}

/** Rewrite a note. */
async function updateNoteForModel(
  noteId: string,
  highlightId: string,
  text: string,
): Promise<NoteResult> {
  const trimmed = text?.trim();
  if (!trimmed) return { ok: false, error: 'text_required' };

  await useReaderStore.getState().updateNote(noteId, highlightId, trimmed);
  return { ok: true, noteId };
}

/** Delete a note, leaving its highlight. */
async function deleteNoteForModel(
  noteId: string,
  highlightId: string,
): Promise<NoteResult> {
  await useReaderStore.getState().deleteNote(noteId, highlightId);
  return { ok: true, noteId };
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
  const tags: string[] = row.tags ? JSON.parse(row.tags) : [];
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

export function formatCollectionsForLLM(
  collectionList: CollectionSummary[],
  tokenBudget: number,
): string {
  if (collectionList.length === 0) return 'No collections yet.';

  const lines: string[] = [];
  let spent = 0;
  for (const c of collectionList) {
    const line = `- "${c.name}" (${c.bookCount} book${c.bookCount === 1 ? '' : 's'})`;
    const cost = estimateTokens(line);
    if (lines.length > 0 && spent + cost > tokenBudget) break;
    spent += cost;
    lines.push(line);
  }

  const omitted = collectionList.length - lines.length;
  return omitted > 0
    ? `${lines.join('\n')}\n(${omitted} more not shown.)`
    : lines.join('\n');
}
