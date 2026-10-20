/**
 * How long to wait before trying a failed request again.
 *
 * Jittered and doubling, as Expensify's `RequestThrottle` does: the first
 * wait is a random half second to a second, so phones that lost the same
 * network do not all come back in the same instant, and each one after that
 * doubles up to a ceiling. Longer to start than theirs (10-100ms), because
 * what is retried here is a stream that dropped, usually on a network
 * hand-over, and the new network needs a moment to be usable.
 *
 * `attempt` counts from 1.
 */
export const FIRST_RETRY_MIN_MS = 500;
export const FIRST_RETRY_MAX_MS = 1_000;
export const MAX_RETRY_WAIT_MS = 10_000;

export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const first = FIRST_RETRY_MIN_MS + Math.floor(random() * (FIRST_RETRY_MAX_MS - FIRST_RETRY_MIN_MS));
  return Math.min(first * 2 ** Math.max(0, attempt - 1), MAX_RETRY_WAIT_MS);
}
