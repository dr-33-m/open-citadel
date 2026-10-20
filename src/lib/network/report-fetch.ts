import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';

import { PING_PATH } from './probe';

type Fetch = typeof globalThis.fetch;
type Reporters = { onReached: () => void; onUnreached: () => void };

const WRAPPED = Symbol.for('open-citadel.reportsCloudFetches');

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isCloudRequest(url: string): boolean {
  return (
    SAMWELL_CLOUD_BASE_URL.length > 0 &&
    url.startsWith(SAMWELL_CLOUD_BASE_URL) &&
    !url.startsWith(`${SAMWELL_CLOUD_BASE_URL}${PING_PATH}`)
  );
}

/**
 * Every plain `fetch` to Samwell Cloud reports how it went, from one place.
 *
 * Expensify does the same in a middleware every request passes through: the
 * requests the app is making anyway are the best evidence of whether it is
 * online, and far more of it than a ping. Any answer counts as reached, an
 * error status included, because the server answering is the point. Only a
 * request that got no answer at all counts against, and one the app called
 * off itself (an abort) counts for nothing.
 *
 * Other hosts are left out: a podcast feed whose server is down says nothing
 * about the phone. The chat's stream (XHR) and the cloud voices
 * (`expo/fetch`) do not go through `fetch`, and report for themselves.
 */
export function reportCloudFetches({ onReached, onUnreached }: Reporters): void {
  const original = globalThis.fetch as Fetch & { [WRAPPED]?: true };
  if (original[WRAPPED]) return;

  const reporting: Fetch & { [WRAPPED]?: true } = (input, init) => {
    if (!isCloudRequest(urlOf(input))) return original(input, init);
    return original(input, init).then(
      (response) => {
        onReached();
        return response;
      },
      (error: unknown) => {
        const aborted = init?.signal?.aborted || (error instanceof Error && error.name === 'AbortError');
        if (!aborted) onUnreached();
        throw error;
      },
    );
  };
  reporting[WRAPPED] = true;
  globalThis.fetch = reporting;
}
