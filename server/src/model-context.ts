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
import {
  type CloudModelCapability,
  type CloudModelOption,
} from 'samwell-shared';

import { listCloudModels, setCloudModelContextTokens } from './db.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** Long enough that this is background work, short enough to catch a widening. */
export const MODEL_CONTEXT_REFRESH_MS = 12 * 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 10_000;

export interface OpenRouterModel {
  id?: unknown;
  context_length?: unknown;
  name?: unknown;
  description?: unknown;
  created?: unknown;
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  } | null;
  supported_parameters?: unknown;
}

/**
 * Model IDs are `author/slug` and are interpolated into a URL path, so they
 * are held to a strict shape: this both rejects typos early and makes path
 * traversal impossible. The slug half may carry variant suffixes (`:free`)
 * and dotted versions.
 */
const OPENROUTER_MODEL_ID_RE = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._:-]+$/;

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

/*
 * Everything below turns OpenRouter's published metadata into a catalog row,
 * so an admin adds a model by identifier alone: label, provider, context
 * window, and capabilities are all derived server-side from the same payload
 * the context refresh already reads.
 */

export type FetchModelResult =
  | { kind: 'found'; model: CloudModelOption; canonicalId: string }
  | { kind: 'unknown_id' }
  | { kind: 'unreachable' };

/** Display names for the provider prefixes OpenRouter actually routes. */
const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'z-ai': 'Z.ai',
  'meta-llama': 'Meta',
  mistralai: 'Mistral AI',
  'x-ai': 'xAI',
  deepseek: 'DeepSeek',
  moonshotai: 'Moonshot AI',
  qwen: 'Qwen',
  microsoft: 'Microsoft',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
};

function providerLabel(prefix: string): string {
  const known = PROVIDER_LABELS[prefix];
  if (known) return known;
  // Title-case the prefix ("some-lab" -> "Some-lab"); good enough for a
  // provider OpenRouter has added since this table was written.
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

function firstSentence(text: string): string {
  const match = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  const sentence = (match?.[0] ?? text).trim();
  return sentence.length > 0 && sentence.length <= 200
    ? sentence
    : `${sentence.slice(0, 197).trimEnd()}...`;
}

function deriveCapabilities(entry: OpenRouterModel): CloudModelCapability[] {
  const out: CloudModelCapability[] = [];
  const input = Array.isArray(entry.architecture?.input_modalities)
    ? (entry.architecture?.input_modalities as unknown[])
    : [];
  if (input.length === 0 || input.includes('text')) out.push('text');
  if (input.includes('image')) out.push('vision');
  if (input.includes('audio')) out.push('audio');
  const params = Array.isArray(entry.supported_parameters)
    ? (entry.supported_parameters as unknown[])
    : [];
  if (params.includes('tools')) out.push('tools');
  return out.length > 0 ? out : ['text'];
}

/**
 * Build a catalog row from one OpenRouter model object.
 *
 * The single-model endpoint resolves aliases before responding, so
 * `entry.id` is the canonical identifier to store. Nothing here is guessed:
 * every field comes from OpenRouter's data or is a mechanical mapping of it.
 */
export function toCloudModelOption(entry: OpenRouterModel): CloudModelOption | null {
  const id = typeof entry.id === 'string' ? entry.id : null;
  const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null;
  const contextLength = entry.context_length;
  if (!id || !name) return null;

  const prefix = id.split('/')[0] ?? '';
  const description =
    typeof entry.description === 'string' && entry.description.trim()
      ? firstSentence(entry.description)
      : name;

  return {
    id,
    label: name,
    provider: providerLabel(prefix),
    description,
    capabilities: deriveCapabilities(entry),
    contextTokens:
      typeof contextLength === 'number' && Number.isFinite(contextLength) && contextLength > 0
        ? Math.floor(contextLength)
        : null,
  };
}

/**
 * Look up one model on OpenRouter and derive its catalog row.
 *
 * Uses the single-model endpoint rather than the full list: it is small,
 * resolves aliases (so `anthropic/claude-3-5-sonnet` lands on the canonical
 * row), and answers 404 for an identifier that does not exist, which is the
 * typo guardrail - an unroutable ID can never enter the fallback chain.
 */
export async function fetchOpenRouterModel(modelId: string): Promise<FetchModelResult> {
  if (!OPENROUTER_MODEL_ID_RE.test(modelId)) return { kind: 'unknown_id' };

  const [author, ...slugParts] = modelId.split('/');
  let response: Response;
  try {
    response = await fetch(
      `https://openrouter.ai/api/v1/model/${author}/${slugParts.join('/')}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
  } catch (err) {
    console.warn(`[ModelContext] OpenRouter lookup for ${modelId} failed:`, err);
    return { kind: 'unreachable' };
  }

  if (response.status === 404) return { kind: 'unknown_id' };
  if (!response.ok) {
    console.warn(`[ModelContext] OpenRouter lookup for ${modelId} returned ${response.status}`);
    return { kind: 'unreachable' };
  }

  const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    return { kind: 'unreachable' };
  }

  const model = toCloudModelOption(body.data as OpenRouterModel);
  if (!model) return { kind: 'unreachable' };
  return { kind: 'found', model, canonicalId: model.id };
}
