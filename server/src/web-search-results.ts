/**
 * What a web search returned, read out of an OpenRouter completion.
 *
 * Pure and dependency-free so the reading can be tested against both shapes
 * the annotations arrive in, without a network.
 */
import type { WebSource } from 'samwell-shared';

/** How many sources one search hands back. Enough to cross-check, few enough to read. */
export const WEB_SEARCH_MAX_SOURCES = 6;

/**
 * How much of each page's matched passage is kept.
 *
 * Exa sends a couple of thousand characters a result. Six of those is a long
 * tool result the model then re-reads on every later step of the turn, so it
 * is trimmed to the part that carries the facts.
 */
export const WEB_SNIPPET_MAX_CHARS = 700;

type RawAnnotation = {
  type?: unknown;
  url?: unknown;
  title?: unknown;
  content?: unknown;
  url_citation?: { url?: unknown; title?: unknown; content?: unknown };
};

/**
 * The sources in a completion's `annotations`.
 *
 * OpenRouter documents the chat completions shape as
 * `{ type: 'url_citation', url_citation: { url, title, content } }`, while its
 * Responses API puts the same fields on the annotation itself. Both are read,
 * so a change of shape on their side degrades to fewer sources rather than to
 * none. Only http(s) addresses are kept, each once, in the order given.
 */
export function readWebSources(annotations: unknown): WebSource[] {
  if (!Array.isArray(annotations)) return [];
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const raw of annotations as RawAnnotation[]) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.type !== undefined && raw.type !== 'url_citation') continue;
    const fields = raw.url_citation ?? raw;
    const url = typeof fields.url === 'string' ? fields.url.trim() : '';
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const title = typeof fields.title === 'string' && fields.title.trim() ? fields.title.trim() : hostOf(url);
    const content = typeof fields.content === 'string' ? fields.content : '';
    sources.push({ title, url, snippet: trimSnippet(content) });
    if (sources.length >= WEB_SEARCH_MAX_SOURCES) break;
  }
  return sources;
}

/** A page's passage on one line, cut at a word near the cap. */
export function trimSnippet(text: string, max = WEB_SNIPPET_MAX_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** The host of an address, by pattern so a malformed one cannot throw. */
export function hostOf(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return (match?.[1] ?? url).replace(/^www\./i, '');
}

/** What OpenRouter says the call cost, in dollars, or null when it did not say. */
export function readCostUsd(usage: unknown): number | null {
  const cost = (usage as { cost?: unknown } | null | undefined)?.cost;
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null;
}
