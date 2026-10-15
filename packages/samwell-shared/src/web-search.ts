import { toolDefinition } from '@tanstack/ai/client';
import { z } from 'zod';

/**
 * Searching the web, for the cloud only.
 *
 * Every other tool Samwell has runs on the device, because everything else he
 * reaches for lives there: the library, the highlights, the goals. This one
 * lives on the server (`server/src/web-search.ts` implements it with
 * `.server()`), because the web is reached from the server and the key that
 * pays for it must never be on a phone. TanStack AI runs a server tool inside
 * its own agent loop, so a search costs no extra round trip to the device: the
 * model asks, the server searches, and the model carries on in the same
 * response.
 *
 * Defined here rather than on the server alone because the app reads what it
 * returns: each result becomes a source under the reply, and the call itself a
 * step in the turn's trail. One schema is what keeps the two from disagreeing
 * about what a result looks like.
 */

export const WEB_SEARCH_TOOL_NAME = 'web_search';

export const WebSearchInputSchema = z.object({
  query: z
    .string()
    .min(2)
    .describe(
      'What to look up, written the way you would type it into a search engine: specific names, titles and terms, not a question to the user.',
    ),
});

export const WebSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  /** What the page says that matched, trimmed. Empty when the engine gave none. */
  snippet: z.string(),
});

export type WebSource = z.infer<typeof WebSourceSchema>;

export const WebSearchOutputSchema = z.object({
  query: z.string(),
  sources: z.array(WebSourceSchema),
  /** Set when the search could not be made, so the model can say so plainly. */
  error: z.string().optional(),
});

export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;

export const webSearchTool = toolDefinition({
  name: WEB_SEARCH_TOOL_NAME,
  description:
    "Search the web for current, factual information: who an author is and what else they wrote, what a concept, movement or term means, what has happened recently, or whether a claim holds up. Returns pages with their titles, addresses and the passages that matched. Use it to fact-check yourself before stating something you are not sure of, and whenever the answer depends on anything that may have changed. Never use it for what the user's own library, highlights or notes hold (the other tools do that), and never to look up what happens in a book the user is reading beyond the point they have reached.",
  inputSchema: WebSearchInputSchema,
  outputSchema: WebSearchOutputSchema,
});

/**
 * The paragraph that tells him the tool is there, on the cloud routes alone.
 *
 * Separate from the persona for the same reason the journey and app guide
 * paragraphs are: the persona is shared with the on-device engine, which has
 * no web, and describing a tool a model was never given is how it burns a turn
 * calling something that does not exist.
 */
export const SAMWELL_WEB_SEARCH_TOOL_PROMPT = `You can search the web with web_search. Use it when the answer depends on facts you might have wrong or that may have changed: an author's life and other work, what a concept or school of thought actually holds, recent events, numbers, dates, or a claim the user wants checked. Search before you answer rather than after, search again with sharper terms if the first results are thin, and say plainly when the sources disagree or say nothing useful. Ground what you say in what the results returned and do not add detail they do not support. The sources are shown to the user under your reply, so you do not need to list addresses yourself. Two limits hold whatever is asked: the spoiler boundary applies to the web as much as to the book, so never search for what happens in a book the user is reading beyond the point they have reached, and their library, highlights and notes are only ever read with your other tools, never searched for online.`;
