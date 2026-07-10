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

export const searchHighlightsTool = toolDefinition({
  name: 'search_highlights',
  description:
    "Search the user's book highlights and notes. Can search by keyword in highlight/note text, by book title, or by tag. Call with no arguments to get the most recent highlights.",
  inputSchema: SearchHighlightsInputSchema,
  outputSchema: SearchToolOutputSchema,
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

export const SAMWELL_TOOL_DEFINITIONS = [
  searchHighlightsTool,
  searchThoughtsTool,
  tagHighlightTool,
  tagThoughtTool,
] as const;

export const SAMWELL_CLIENT_TOOL_DEFINITIONS = SAMWELL_TOOL_DEFINITIONS.map((tool) =>
  tool.client(),
);

export type SamwellClientToolDefinition =
  (typeof SAMWELL_CLIENT_TOOL_DEFINITIONS)[number];
