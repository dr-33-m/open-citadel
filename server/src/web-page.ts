/**
 * `read_web_page`: the words of one page a search just returned, so that who
 * someone is can be judged from more than a passage.
 *
 * This is the one place the server fetches an address a model chose, so it is
 * fenced four ways: only pages this request's `web_search` returned; only http
 * and https on the usual ports; every hop, redirects included, checked to
 * resolve to public addresses only; and a cap on time and size. A page's words
 * go back to the model marked as a page's words (see the tool's description).
 *
 * What is not closed: a host could answer differently between the check and
 * the fetch. It would first have to be returned by the search engine as a
 * result, and the worst of it is bounded by what the fetch hands back, which
 * is text only and only to the model.
 */
import { lookup } from 'node:dns/promises';

import { readWebPageTool, type ReadWebPageOutput } from 'samwell-shared';

import { isPublicAddress, pageKey, pageText, readablePageUrl } from './web-page-text.js';

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2_000_000;
/** About 3,000 tokens: a biography or an interview, not a whole site. */
const MAX_CHARS = 12_000;

type Resolve = (host: string) => Promise<string[]>;

const resolveHost: Resolve = async (host) => (await lookup(host, { all: true })).map((found) => found.address);

async function hostIsPublic(url: URL, resolve: Resolve): Promise<boolean> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await resolve(host);
  return addresses.length > 0 && addresses.every(isPublicAddress);
}

/** The body, up to the cap, however long the page says it is. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8');
}

export async function readWebPage(
  raw: string,
  {
    allowed,
    signal,
    resolve = resolveHost,
    request = fetch,
  }: {
    /** The pages this request's searches returned (`pageKey`). */
    allowed: ReadonlySet<string>;
    signal?: AbortSignal;
    resolve?: Resolve;
    request?: typeof fetch;
  },
): Promise<ReadWebPageOutput> {
  const failed = (error: string): ReadWebPageOutput => ({ url: raw, title: null, text: '', cut: false, error });
  const asked = readablePageUrl(raw);
  if (!asked) return failed('not_a_web_page');
  if (!allowed.has(pageKey(asked))) return failed('only_pages_from_your_search_can_be_read');
  let url: URL = asked;

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!(await hostIsPublic(url, resolve))) return failed('page_not_reachable');
      const response: Response = await request(url, {
        signal: combined,
        redirect: 'manual',
        headers: { 'User-Agent': 'OpenCitadel/1.0 (reading companion)', Accept: 'text/html,text/plain' },
      });
      if (response.status >= 300 && response.status < 400) {
        const next: string | null = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        const target: URL | null = next ? readablePageUrl(new URL(next, url).href) : null;
        if (!target) return failed('page_not_reachable');
        url = target;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return failed('page_not_reachable');
      }
      if (!/text\/(html|plain)|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) {
        await response.body?.cancel().catch(() => {});
        return failed('not_a_web_page');
      }
      return { url: url.href, ...pageText(await readCapped(response), MAX_CHARS) };
    }
    return failed('page_not_reachable');
  } catch (error) {
    if (signal?.aborted) return failed('cancelled');
    console.warn('[Web page] Read failed:', error instanceof Error ? error.message : error);
    return failed(timeout.aborted ? 'timed_out' : 'page_not_reachable');
  }
}

/** The tool for one request, limited to the pages that request's searches found. */
export function createReadWebPageTool(allowed: ReadonlySet<string>) {
  return readWebPageTool.server(async ({ url }, context) => readWebPage(url, { allowed, signal: context?.abortSignal }));
}
