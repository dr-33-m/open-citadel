/**
 * Samwell's web search: a TanStack AI server tool.
 *
 * ## Why a server tool of our own, and not OpenRouter's built-in one handed to the model
 *
 * `@tanstack/ai-openrouter` ships `webSearchTool()`, which lets the turn's own
 * model search through OpenRouter. It works, but what it found never reaches
 * the app: OpenRouter returns the sources as `url_citation` annotations on the
 * message, and the adapter does not carry annotations into the stream. The
 * reader would get an answer with nothing to check it against, and the search
 * would not show up as a step in the turn at all.
 *
 * A `toolDefinition().server()` tool is the framework's own answer. The model
 * calls `web_search`, TanStack runs this function inside its agent loop, and
 * the call and its result stream to the app as an ordinary tool call with an
 * output. The app draws the call as a step and the results as sources, and the
 * model reads the same results to write its answer, all in one response.
 *
 * ## How the search itself is made
 *
 * One small completion on a cheap model with OpenRouter's Exa search attached,
 * asked for one sentence, kept only for its annotations: the pages Exa found,
 * each with the passage that matched. Exa rather than a provider's native
 * search so the results are the same whichever model is answering, and so
 * every result comes back with its passage. Zero retention is asked for here
 * as on every call (`PROVIDER_PREFERENCES`); Exa keeps the query under its own
 * policy, which is the price of a search engine at all.
 *
 * ## Paid for by the reader, at cost
 *
 * The completion's `usage.cost` (the search fee and the small model's tokens)
 * is handed to `onCost`, and the chat route adds it to the turn it settles.
 * A search whose cost OpenRouter does not report is charged at a cautious
 * estimate rather than given away.
 */
import { webSearchTool, type WebSearchOutput } from 'samwell-shared';

import { PROVIDER_PREFERENCES } from './openrouter.js';
import { WEB_SEARCH_MAX_SOURCES, readCostUsd, readWebSources } from './web-search-results.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * The model that runs the search. Its words are thrown away, so the cheapest
 * capable model with a zero-retention endpoint will do; overridable without a
 * deploy of code.
 */
const SEARCH_MODEL = process.env.WEB_SEARCH_MODEL ?? 'anthropic/claude-haiku-5.5';

/** A search that has not answered by now is not going to be worth waiting for. */
const SEARCH_TIMEOUT_MS = 20_000;

/**
 * What a search is charged when OpenRouter does not say what it cost: Exa's
 * $0.007 a request plus the small model's tokens over six results, rounded up.
 */
export const WEB_SEARCH_FALLBACK_COST_USD = 0.015;

const SEARCH_INSTRUCTION =
  'Search the web for the query you are given and answer it in one short sentence from what you find.';

/**
 * Two ways of attaching Exa, tried in order: the `web` plugin, which searches
 * exactly once with the query as written, then the `openrouter:web_search`
 * server tool that OpenRouter is moving the plugin's users to. The plugin is
 * deprecated but deterministic; the second keeps search working the day it
 * is switched off.
 */
const SEARCH_ATTACHMENTS = [
  { plugins: [{ id: 'web', engine: 'exa', max_results: WEB_SEARCH_MAX_SOURCES }] },
  {
    tools: [
      { type: 'openrouter:web_search', parameters: { engine: 'exa', max_results: WEB_SEARCH_MAX_SOURCES } },
    ],
  },
] as const;

type SearchAttempt = { output: WebSearchOutput; costUsd: number | null; failed: boolean };

async function attemptSearch(
  query: string,
  attachment: (typeof SEARCH_ATTACHMENTS)[number],
  signal: AbortSignal,
): Promise<SearchAttempt> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
      'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      messages: [
        { role: 'system', content: SEARCH_INSTRUCTION },
        { role: 'user', content: query },
      ],
      ...attachment,
      provider: PROVIDER_PREFERENCES,
      max_tokens: 120,
      usage: { include: true },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    console.warn(`[Web search] OpenRouter answered ${response.status}: ${detail}`);
    return { output: { query, sources: [], error: 'search_unavailable' }, costUsd: null, failed: true };
  }
  const json = (await response.json()) as {
    choices?: { message?: { annotations?: unknown } }[];
    usage?: unknown;
  };
  const sources = readWebSources(json.choices?.[0]?.message?.annotations);
  return { output: { query, sources }, costUsd: readCostUsd(json.usage), failed: sources.length === 0 };
}

/**
 * Search the web for `query`. Never throws: a search that could not be made
 * comes back as an `error` the model can say plainly, since one failed lookup
 * is not a reason to lose the whole turn.
 */
export async function searchWeb(
  query: string,
  { signal, onCost }: { signal?: AbortSignal; onCost: (usd: number) => void },
): Promise<WebSearchOutput> {
  const trimmed = query.trim();
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let last: WebSearchOutput = { query: trimmed, sources: [], error: 'no_results' };

  for (const attachment of SEARCH_ATTACHMENTS) {
    try {
      const attempt = await attemptSearch(trimmed, attachment, combined);
      // A request that was answered was billed, whatever it found.
      if (!attempt.output.error) onCost(attempt.costUsd ?? WEB_SEARCH_FALLBACK_COST_USD);
      if (!attempt.failed) return attempt.output;
      last = attempt.output.error ? attempt.output : { query: trimmed, sources: [], error: 'no_results' };
    } catch (error) {
      if (signal?.aborted) return { query: trimmed, sources: [], error: 'cancelled' };
      console.warn('[Web search] Request failed:', error);
      last = { query: trimmed, sources: [], error: timeout.aborted ? 'timed_out' : 'search_unavailable' };
      break;
    }
  }
  return last;
}

/**
 * The tool for one request. Built per request so the cost it reports lands on
 * that request's bill and nobody else's.
 */
export function createWebSearchTool(onCost: (usd: number) => void) {
  return webSearchTool.server(async ({ query }, context) => searchWeb(query, { signal: context?.abortSignal, onCost }));
}
