/**
 * `fetch` with a deadline.
 *
 * React Native's fetch has no default timeout, so a request to a host that
 * accepts the connection and then goes quiet never settles. That is not
 * theoretical here: model capability lookups run after a multi-hundred-megabyte
 * download but before the model is marked usable, so one hung request left the
 * progress bar at 100% and the brain permanently unavailable, with no error
 * because the caller treats a failed lookup as "unknown" rather than fatal.
 *
 * The rest of the app already reaches for AbortController per call site
 * (`cloud-chat`, `chat-title`, `tag-suggest`, `goal-takeaway`). This is the
 * same move with the boilerplate in one place.
 */

/** Long enough for a slow mobile connection, short enough to fail usefully. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
