import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';

/** Long enough for a slow mobile network, short enough to try again soon. */
const PING_TIMEOUT_MS = 10_000;

/** The ping's own path, so request reporting (`report-fetch.ts`) leaves it out. */
export const PING_PATH = '/health';

/** Whether there is a server to ping. A build without one cannot ask. */
export function canPing(): boolean {
  return SAMWELL_CLOUD_BASE_URL.length > 0;
}

/**
 * Whether Samwell Cloud answers right now.
 *
 * A real request, not the OS's guess: the server answering is the only proof
 * that a request would. `AbortController` plus a timer rather than
 * `AbortSignal.timeout`, which Hermes does not have.
 */
export async function pingCloud(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    await fetch(`${SAMWELL_CLOUD_BASE_URL}${PING_PATH}`, {
      signal: controller.signal,
      // Never an answer from a cache: the point is to reach the server.
      headers: { 'Cache-Control': 'no-cache' },
    });
    // Any answer, an error status included, as every other cloud request is
    // counted (`report-fetch.ts`): /health reads the catalogue and the
    // database, and a 500 from it kept the whole app offline while the
    // server was plainly there.
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
