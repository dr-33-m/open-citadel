/**
 * Where each model's real context window comes from.
 *
 * Not hardcoded. Providers widen windows over time and OpenRouter adds models
 * continuously, so a table of numbers written into the catalogue is wrong the
 * month after it is written — and being wrong in the optimistic direction here
 * means failed requests for the reader. OpenRouter publishes the authoritative
 * number per model, so that is what is used; the catalogue's own values are a
 * conservative floor for before the first refresh lands.
 *
 * A plain `fetch` rather than `@openrouter/sdk`: this is one unauthenticated
 * GET against a documented public endpoint, and the SDK is a dependency of the
 * app, not of this server. Adding it here to read one integer is not a trade
 * worth making.
 *
 * Refreshed on boot and then on a long timer, never in front of a chat turn —
 * a slow or failing provider must not be able to delay a reply, so every path
 * here fails soft and leaves the last known value in place.
 */
import { listCloudModels, setCloudModelContextTokens } from './db.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** Long enough that this is background work, short enough to catch a widening. */
export const MODEL_CONTEXT_REFRESH_MS = 12 * 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 10_000;

interface OpenRouterModel {
  id?: unknown;
  context_length?: unknown;
}

/**
 * Read `id -> context_length` from OpenRouter.
 *
 * Returns an empty map on any failure. The caller treats "no data" and "the
 * request failed" identically, because the response to both is the same: keep
 * whatever is already stored.
 */
async function fetchContextLengths(): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[ModelContext] OpenRouter models request failed: ${response.status}`);
      return out;
    }

    const body = (await response.json()) as { data?: unknown };
    if (!Array.isArray(body.data)) {
      console.warn('[ModelContext] OpenRouter models response had no data array');
      return out;
    }

    for (const entry of body.data as OpenRouterModel[]) {
      const id = entry?.id;
      const length = entry?.context_length;
      if (typeof id !== 'string') continue;
      // Explicitly null for some models; only a positive number is usable.
      if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) continue;
      out.set(id, Math.floor(length));
    }
  } catch (err) {
    console.warn('[ModelContext] Could not reach OpenRouter for model metadata:', err);
  }

  return out;
}

/**
 * Bring stored context windows in line with OpenRouter's.
 *
 * Only writes when the number actually changed, so a refresh that finds
 * nothing new touches no rows.
 */
export async function refreshModelContextWindows(): Promise<void> {
  const lengths = await fetchContextLengths();
  if (lengths.size === 0) return;

  const models = await listCloudModels();
  let updated = 0;

  for (const model of models) {
    const next = lengths.get(model.id);
    if (next == null || next === model.contextTokens) continue;
    await setCloudModelContextTokens(model.id, next);
    updated += 1;
  }

  if (updated > 0) {
    console.log(`[ModelContext] Updated context windows for ${updated} model(s).`);
  }
}

/**
 * Start the background refresh.
 *
 * `unref` so a pending timer never keeps the process alive on shutdown.
 */
export function startModelContextRefresh(): void {
  void refreshModelContextWindows();
  const timer = setInterval(() => {
    void refreshModelContextWindows();
  }, MODEL_CONTEXT_REFRESH_MS);
  timer.unref?.();
}
