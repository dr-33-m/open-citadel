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
  snippet: z.string(),
});

export const SearchReadingInputSchema = z.object({
  query: z.string(),
});

export const SearchReadingOutputSchema = z.object({
  results: z.array(ReadingSnippetSchema),
  formatted: z.string(),
});

export const BookCandidateSchema = z.object({
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

export const SAMWELL_TOOL_DEFINITIONS = [
  searchHighlightsTool,
  searchThoughtsTool,
  searchReadingTool,
  suggestNextBookTool,
  tagHighlightTool,
  tagThoughtTool,
  deleteHighlightTool,
  deleteThoughtTool,
] as const;

export const SAMWELL_CLIENT_TOOL_DEFINITIONS = SAMWELL_TOOL_DEFINITIONS.map((tool) =>
  tool.client(),
);

export type SamwellClientToolDefinition =
  (typeof SAMWELL_CLIENT_TOOL_DEFINITIONS)[number];
