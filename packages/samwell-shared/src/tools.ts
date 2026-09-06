import { toolDefinition } from '@tanstack/ai/client';
import { z } from 'zod';

export const SearchResultSchema = z.object({
  id: z.string(),
  type: z.enum(['highlight', 'thought']),
  bookId: z.string().nullable(),
  bookTitle: z.string().nullable(),
  text: z.string(),
  tags: z.array(z.string()),
  locator: z.string().nullable(),
  noteText: z.string().nullable(),
});

export type SamwellSearchResult = z.infer<typeof SearchResultSchema>;

export const SearchToolOutputSchema = z.object({
  results: z.array(SearchResultSchema),
  formatted: z.string(),
});

export const SearchHighlightsInputSchema = z.object({
  query: z.string().optional(),
  book_title: z.string().optional(),
  tag: z.string().optional(),
});

export const SearchThoughtsInputSchema = z.object({
  query: z.string().optional(),
  tag: z.string().optional(),
});

export const TagInputSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()).min(1),
});

export const TagResultSchema = z.object({
  ok: z.boolean(),
  id: z.string().optional(),
  type: z.enum(['highlight', 'thought']).optional(),
  tags: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export const DeleteInputSchema = z.object({
  id: z.string(),
});

export const DeleteResultSchema = z.object({
  ok: z.boolean(),
  id: z.string().optional(),
  type: z.enum(['highlight', 'thought']).optional(),
  error: z.string().optional(),
});

export const ReadingSnippetSchema = z.object({
  book: z.string(),
  author: z.string(),
  /** Chapter the passage came from, where the book names one. */
  section: z.string().nullable(),
  snippet: z.string(),
});

export const SearchReadingInputSchema = z.object({
  query: z.string(),
});

export const ChapterEntrySchema = z.object({
  index: z.number(),
  title: z.string().nullable(),
  approxWords: z.number(),
  current: z.boolean(),
});

export const ListChaptersInputSchema = z.object({
  book_title: z.string().optional(),
});

export const ListChaptersOutputSchema = z.object({
  chapters: z.array(ChapterEntrySchema),
  formatted: z.string(),
});

export const ReadChapterInputSchema = z.object({
  book_title: z.string().optional(),
  chapter: z.string(),
});

export const ReadChapterOutputSchema = z.object({
  formatted: z.string(),
});

export const SearchReadingOutputSchema = z.object({
  results: z.array(ReadingSnippetSchema),
  formatted: z.string(),
});

export const BookCandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  category: z.string().nullable(),
  status: z.string().nullable(),
  percentage: z.number().nullable(),
  completedAt: z.string().nullable(),
});

export const SuggestNextBookInputSchema = z.object({});

export const SuggestNextBookOutputSchema = z.object({
  candidates: z.array(BookCandidateSchema),
  formatted: z.string(),
});

export const SuggestHighlightInputSchema = z.object({
  quote: z.string().min(1),
});

export const SuggestThoughtInputSchema = z.object({
  text: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export const SuggestionResultSchema = z.object({
  ok: z.boolean(),
  suggestionId: z.string().nullable(),
  error: z.string().optional(),
});

export const BookTitlesInputSchema = z.object({
  book_titles: z
    .array(z.string())
    .optional()
    .describe(
      'Titles of the books to act on (partial match ok). If omitted, uses the book the current chat is about. Pass multiple titles to act on several books in one call.',
    ),
});

export const BookActionFailureSchema = z.object({
  title: z.string(),
  error: z.string(),
});

export const BookBatchActionResultSchema = z.object({
  ok: z.boolean(),
  succeeded: z.array(z.string()),
  failed: z.array(BookActionFailureSchema),
  /** Set only when the whole batch couldn't proceed (e.g. an anchor book for
   * reorder_queue didn't resolve) — distinct from per-title failures. */
  error: z.string().optional(),
});

export const ReorderQueueInputSchema = z.object({
  book_titles: z
    .array(z.string())
    .optional()
    .describe(
      'Titles of the books to move, in the order they should end up. If omitted, uses the book the current chat is about.',
    ),
  after_title: z.string().optional(),
  before_title: z.string().optional(),
  position: z.enum(['top', 'bottom']).optional(),
});

export const CreateCollectionInputSchema = z.object({
  name: z.string().min(1),
});

export const CreateCollectionResultSchema = z.object({
  ok: z.boolean(),
  collectionId: z.string().optional(),
  error: z.string().optional(),
});

export const DeleteCollectionInputSchema = z.object({
  collection_name: z
    .string()
    .min(1)
    .describe('The name of the collection to delete (partial match ok).'),
});

export const DeleteCollectionResultSchema = z.object({
  ok: z.boolean(),
  name: z.string().optional(),
  /** How many books it held. The user is told before it goes. */
  bookCount: z.number().optional(),
  error: z.string().optional(),
});

export const RenameBookInputSchema = z.object({
  book_title: z
    .string()
    .optional()
    .describe('Title of the book to rename (partial match ok). Omit for the book this chat is about.'),
  new_title: z.string().min(1).describe('The corrected title.'),
});

export const RenameBookResultSchema = z.object({
  ok: z.boolean(),
  from: z.string().optional(),
  to: z.string().optional(),
  error: z.string().optional(),
});

export const NoteInputSchema = z.object({
  highlight_id: z.string().describe('The highlight the note belongs to.'),
  text: z.string().min(1).describe("The note, in the user's own framing."),
});

export const UpdateNoteInputSchema = z.object({
  note_id: z.string(),
  highlight_id: z.string(),
  text: z.string().min(1),
});

export const NoteResultSchema = z.object({
  ok: z.boolean(),
  noteId: z.string().optional(),
  error: z.string().optional(),
});

export const UpdateThoughtInputSchema = z.object({
  id: z.string(),
  text: z.string().min(1).describe('The rewritten thought. Replaces the text entirely.'),
});

export const CollectionBooksInputSchema = z.object({
  book_titles: z
    .array(z.string())
    .optional()
    .describe(
      'Titles of the books to act on (partial match ok). If omitted, uses the book the current chat is about. Pass multiple titles to act on several books in one call.',
    ),
  collection_name: z.string().min(1),
});

export const CollectionBatchActionResultSchema = z.object({
  ok: z.boolean(),
  collectionName: z.string().optional(),
  succeeded: z.array(z.string()),
  failed: z.array(BookActionFailureSchema),
  error: z.string().optional(),
});

export const SearchJourneyInputSchema = z.object({
  query: z.string().min(1),
});

export const SearchJourneyOutputSchema = z.object({
  formatted: z.string(),
});

export const ListCollectionsInputSchema = z.object({});

export const CollectionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  bookCount: z.number(),
});

export const ListCollectionsOutputSchema = z.object({
  collections: z.array(CollectionSummarySchema),
  formatted: z.string(),
});

export const searchHighlightsTool = toolDefinition({
  name: 'search_highlights',
  description:
    "Search the user's book highlights and notes. Can search by keyword in highlight/note text, by book title, or by tag. Call with no arguments to get the most recent highlights.",
  inputSchema: SearchHighlightsInputSchema,
  outputSchema: SearchToolOutputSchema,
});

export const searchReadingTool = toolDefinition({
  name: 'search_reading',
  description:
    "Search the FULL TEXT of the books the user is currently reading or has finished, for passages relevant to a topic or question. Only ever returns text the user has ALREADY read — never content ahead of their current reading position. Use this mid-conversation to ground your points in what the user's own authors actually say, citing the book.",
  inputSchema: SearchReadingInputSchema,
  outputSchema: SearchReadingOutputSchema,
});

export const listChaptersTool = toolDefinition({
  name: 'list_chapters',
  description:
    "List the chapters of one of the user's books that they have ALREADY reached, with rough lengths. Use this before read_chapter to see what is actually in the book rather than guessing at search terms. Never lists chapters ahead of the user's reading position, since a chapter title gives away plot as readily as the text does.",
  inputSchema: ListChaptersInputSchema,
  outputSchema: ListChaptersOutputSchema,
});

export const readChapterTool = toolDefinition({
  name: 'read_chapter',
  description:
    'Read the FULL text of one chapter the user has already read, by number (from list_chapters) or by title. Use when a keyword search is too narrow and you need the whole argument of a chapter to discuss it properly. Stops at the user\u2019s reading position if they are partway through.',
  inputSchema: ReadChapterInputSchema,
  outputSchema: ReadChapterOutputSchema,
});

export const suggestNextBookTool = toolDefinition({
  name: 'suggest_next_book',
  description:
    "List the user's library — books queued to read, currently reading, and finished — so you can recommend what they should read next given where they are in their journey. Only recommend titles that appear in this list (the user's own library); never invent books they don't own.",
  inputSchema: SuggestNextBookInputSchema,
  outputSchema: SuggestNextBookOutputSchema,
});

export const searchThoughtsTool = toolDefinition({
  name: 'search_thoughts',
  description:
    "Search the user's standalone thoughts (not tied to any book). Can search by keyword or by tag. Call with no arguments to get the most recent thoughts.",
  inputSchema: SearchThoughtsInputSchema,
  outputSchema: SearchToolOutputSchema,
});

export const tagHighlightTool = toolDefinition({
  name: 'tag_highlight',
  description:
    'Add one or more tags to a highlight for future reference and organization. Requires user approval.',
  inputSchema: TagInputSchema,
  outputSchema: TagResultSchema,
  needsApproval: true,
});

export const tagThoughtTool = toolDefinition({
  name: 'tag_thought',
  description:
    'Add one or more tags to a thought for future reference and organization. Requires user approval.',
  inputSchema: TagInputSchema,
  outputSchema: TagResultSchema,
  needsApproval: true,
});

export const deleteHighlightTool = toolDefinition({
  name: 'delete_highlight',
  description:
    'Permanently delete a highlight (and its note) from the user\'s library. Only call this when the user explicitly asks to delete or remove a highlight. This cannot be undone. Requires user approval.',
  inputSchema: DeleteInputSchema,
  outputSchema: DeleteResultSchema,
  needsApproval: true,
});

export const deleteThoughtTool = toolDefinition({
  name: 'delete_thought',
  description:
    'Permanently delete a standalone thought from the user\'s library. Only call this when the user explicitly asks to delete or remove a thought. This cannot be undone. Requires user approval.',
  inputSchema: DeleteInputSchema,
  outputSchema: DeleteResultSchema,
  needsApproval: true,
});

export const suggestHighlightTool = toolDefinition({
  name: 'suggest_highlight',
  description:
    "Propose saving a passage the user has ALREADY read as a highlight. This only registers a suggestion for the user to review inline in the chat, approve, or reject; it never saves anything directly. Only call this within a chat about a specific book, for a passage that connects meaningfully to the user's journey (their goals, recurring themes, or something they're actively working through), not just anything that seems interesting in isolation. Use sparingly. `quote` must be text the user has actually read, close to word-for-word. After calling this, mention it in your reply using the marker [[suggest:highlight:<suggestionId>]] so it renders for the user.",
  inputSchema: SuggestHighlightInputSchema,
  outputSchema: SuggestionResultSchema,
});

export const suggestThoughtTool = toolDefinition({
  name: 'suggest_thought',
  description:
    "Propose saving a standalone thought or insight discovered during the conversation (not tied to a specific book passage). This only registers a suggestion for the user to review inline in the chat, approve, or reject; it never saves anything directly. Use sparingly, only when something connects meaningfully to the user's journey. After calling this, mention it in your reply using the marker [[suggest:thought:<suggestionId>]] so it renders for the user.",
  inputSchema: SuggestThoughtInputSchema,
  outputSchema: SuggestionResultSchema,
});

export const removeFromCurrentlyReadingTool = toolDefinition({
  name: 'remove_from_currently_reading',
  description:
    "Remove one or more books from Currently Reading, clearing status back to unstarted (not queued, not finished). Use when the user opened a book by mistake or wants to stop reading it without marking it queued or finished. If book_titles is omitted, applies to the book the current chat is about. Requires user approval.",
  inputSchema: BookTitlesInputSchema,
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const addToQueueTool = toolDefinition({
  name: 'add_to_queue',
  description:
    "Add one or more books to the user's reading queue. If book_titles is omitted, applies to the book the current chat is about. Requires user approval.",
  inputSchema: BookTitlesInputSchema,
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const removeFromQueueTool = toolDefinition({
  name: 'remove_from_queue',
  description:
    'Remove one or more books from the reading queue, clearing status back to unstarted. If book_titles is omitted, applies to the book the current chat is about. Requires user approval.',
  inputSchema: BookTitlesInputSchema,
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const reorderQueueTool = toolDefinition({
  name: 'reorder_queue',
  description:
    "Move one or more books to a new position in the reading queue, as a block, preserving the order given in book_titles: give after_title or before_title to place them relative to another queued book, or position ('top'/'bottom') to send them to an end. Use this after critiquing the queue against the user's goals and journey, to actually put the right books next. If book_titles is omitted, applies to the book the current chat is about. Requires user approval.",
  inputSchema: ReorderQueueInputSchema,
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const toggleFavoriteTool = toolDefinition({
  name: 'toggle_favorite',
  description:
    'Add or remove one or more books from Favorites. If book_titles is omitted, applies to the book the current chat is about. Requires user approval.',
  inputSchema: BookTitlesInputSchema,
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const markAsFinishedTool = toolDefinition({
  name: 'mark_as_finished',
  description:
    'Mark one or more books as finished. If book_titles is omitted, applies to the book the current chat is about. Requires user approval.',
  inputSchema: BookTitlesInputSchema,
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const createCollectionTool = toolDefinition({
  name: 'create_collection',
  description: 'Create a new, empty book collection with the given name. Requires user approval.',
  inputSchema: CreateCollectionInputSchema,
  outputSchema: CreateCollectionResultSchema,
  needsApproval: true,
});

export const addBookToCollectionTool = toolDefinition({
  name: 'add_book_to_collection',
  description:
    "Add one or more books to an existing collection. If book_titles is omitted, applies to the book the current chat is about. If the collection doesn't exist yet, call create_collection first. Requires user approval.",
  inputSchema: CollectionBooksInputSchema,
  outputSchema: CollectionBatchActionResultSchema,
  needsApproval: true,
});

export const removeBookFromCollectionTool = toolDefinition({
  name: 'remove_book_from_collection',
  description:
    'Remove one or more books from a collection. If book_titles is omitted, applies to the book the current chat is about. Requires user approval.',
  inputSchema: CollectionBooksInputSchema,
  outputSchema: CollectionBatchActionResultSchema,
  needsApproval: true,
});

export const deleteCollectionTool = toolDefinition({
  name: 'delete_collection',
  description:
    'Permanently delete a collection. The books in it are NOT deleted, only the grouping. Only call this when the user explicitly asks to delete or remove a collection. Requires user approval.',
  inputSchema: DeleteCollectionInputSchema,
  outputSchema: DeleteCollectionResultSchema,
  needsApproval: true,
});

export const renameBookTool = toolDefinition({
  name: 'rename_book',
  description:
    "Correct a book's title in the library. For fixing a title that imported badly, not for renaming a book to something it is not. Requires user approval.",
  inputSchema: RenameBookInputSchema,
  outputSchema: RenameBookResultSchema,
  needsApproval: true,
});

export const deleteBookTool = toolDefinition({
  name: 'delete_book',
  description:
    "Permanently remove a book from the library, along with its highlights, notes and reading progress. Only call this when the user explicitly asks to delete a book. This cannot be undone. Requires user approval.",
  inputSchema: BookTitlesInputSchema,
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const clearQueueTool = toolDefinition({
  name: 'clear_queue',
  description:
    'Empty the reading queue completely. The books stay in the library. Requires user approval.',
  inputSchema: z.object({}),
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const startReadingTool = toolDefinition({
  name: 'start_reading',
  description:
    'Move one or more books into Currently Reading. If book_titles is omitted, applies to the book the current chat is about. Requires user approval.',
  inputSchema: BookTitlesInputSchema,
  outputSchema: BookBatchActionResultSchema,
  needsApproval: true,
});

export const addNoteToHighlightTool = toolDefinition({
  name: 'add_note_to_highlight',
  description:
    "Write a note on a highlight. ASK FIRST: if the user has not already said what the note should say, ask them what they want it to say and wait for their answer before calling this. Their note is their thinking about the passage, and a note you composed for them is worth nothing to them later. Once they have told you, write it in their words and framing, tidied but not rewritten. Only compose it yourself when they explicitly ask you to. Requires user approval.",
  inputSchema: NoteInputSchema,
  outputSchema: NoteResultSchema,
  needsApproval: true,
});

export const updateNoteTool = toolDefinition({
  name: 'update_note',
  description:
    "Rewrite an existing note on a highlight, replacing its text entirely. ASK FIRST: read the current note back to the user and ask what they want it to say instead, unless they have already told you. Never quietly reword something they wrote. Requires user approval.",
  inputSchema: UpdateNoteInputSchema,
  outputSchema: NoteResultSchema,
  needsApproval: true,
});

export const deleteNoteTool = toolDefinition({
  name: 'delete_note',
  description:
    'Permanently delete a note from a highlight. The highlight itself stays. Requires user approval.',
  inputSchema: UpdateNoteInputSchema.omit({ text: true }),
  outputSchema: NoteResultSchema,
  needsApproval: true,
});

export const updateThoughtTool = toolDefinition({
  name: 'update_thought',
  description:
    "Rewrite a thought's text, replacing it entirely, so include everything that should remain. ASK FIRST: read the thought back and ask what they want it to say, unless they have already told you. These are the user's own words about their own life — only ever change them on their instruction, and keep their voice rather than improving it into yours. Requires user approval.",
  inputSchema: UpdateThoughtInputSchema,
  outputSchema: DeleteResultSchema,
  needsApproval: true,
});

export const listCollectionsTool = toolDefinition({
  name: 'list_collections',
  description: "List the user's collections with how many books are in each.",
  inputSchema: ListCollectionsInputSchema,
  outputSchema: ListCollectionsOutputSchema,
});

/**
 * The notes Samwell has written down over time, searchable.
 *
 * On both surfaces, because a reflection from a Compass conversation is worth
 * as much in a book chat as in the one that produced it. That crossing over is
 * the point of keeping one journey rather than two.
 */
export const searchJourneyTool = toolDefinition({
  name: 'search_journey',
  description:
    "Search the notes you have written down about the user over time: reflections distilled from past conversations, books they finished, goals they closed. Use this when continuity matters — when something they are saying now rhymes with something you noticed months ago, or when they ask what has changed. These are your own words about them, not theirs, so weigh them as memory rather than evidence.",
  inputSchema: SearchJourneyInputSchema,
  outputSchema: SearchJourneyOutputSchema,
});

export const SAMWELL_TOOL_DEFINITIONS = [
  searchHighlightsTool,
  searchThoughtsTool,
  searchReadingTool,
  listChaptersTool,
  readChapterTool,
  suggestNextBookTool,
  tagHighlightTool,
  tagThoughtTool,
  deleteHighlightTool,
  deleteThoughtTool,
  suggestHighlightTool,
  suggestThoughtTool,
  removeFromCurrentlyReadingTool,
  addToQueueTool,
  removeFromQueueTool,
  reorderQueueTool,
  toggleFavoriteTool,
  markAsFinishedTool,
  createCollectionTool,
  addBookToCollectionTool,
  removeBookFromCollectionTool,
  deleteCollectionTool,
  listCollectionsTool,
  renameBookTool,
  deleteBookTool,
  clearQueueTool,
  startReadingTool,
  addNoteToHighlightTool,
  updateNoteTool,
  deleteNoteTool,
  updateThoughtTool,
  searchJourneyTool,
] as const;

export const SAMWELL_CLIENT_TOOL_DEFINITIONS = SAMWELL_TOOL_DEFINITIONS.map((tool) =>
  tool.client(),
);

export type SamwellClientToolDefinition =
  (typeof SAMWELL_CLIENT_TOOL_DEFINITIONS)[number];
