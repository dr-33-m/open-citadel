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
  type PlanId,
} from 'samwell-shared';

import { listCloudModels, setCloudModelFacts } from './db.js';

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
  /**
   * Prices, as decimal strings in dollars PER TOKEN.
   *
   * Per token, not per million, which is how every other part of this system
   * talks about them: `0.000002` here is `$2.00 / 1M`. Converted once, in
   * `readPricing`, so the awkward unit never leaves this module.
   */
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
    input_cache_read?: unknown;
  } | null;
}

/** What a refresh reads back for one model. Null fields are "not published". */
export interface ModelFacts {
  contextTokens: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  cachedInputPricePerMillion: number | null;
}

const PER_MILLION = 1_000_000;

/**
 * One published price, as dollars per million tokens.
 *
 * OpenRouter sends these as strings, and sends `"0"` for a model that is free
 * as well as omitting the field entirely for one whose price it does not know.
 * Both come back as null rather than zero: a zero price would silently make a
 * model cost nothing to use, which is the one wrong answer that never
 * complains.
 */
function perMillion(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value * PER_MILLION;
}

function readPricing(entry: OpenRouterModel): Omit<ModelFacts, 'contextTokens'> {
  const pricing = entry.pricing ?? null;
  return {
    inputPricePerMillion: perMillion(pricing?.prompt),
    outputPricePerMillion: perMillion(pricing?.completion),
    cachedInputPricePerMillion: perMillion(pricing?.input_cache_read),
  };
}

/**
 * Model IDs are `author/slug` and are interpolated into a URL path, so they
 * are held to a strict shape: this both rejects typos early and makes path
 * traversal impossible. The slug half may carry variant suffixes (`:free`)
 * and dotted versions.
 */
const OPENROUTER_MODEL_ID_RE = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._:-]+$/;

/**
 * Read every fact we store about a model, keyed by id.
 *
 * One pass over one payload. Context window and prices arrive in the same
 * response and change for the same reason - the provider changed something -
 * so fetching them separately would mean two requests that could disagree.
 *
 * Returns an empty map on any failure. The caller treats "no data" and "the
 * request failed" identically, because the response to both is the same: keep
 * whatever is already stored.
 */
async function fetchModelFacts(): Promise<Map<string, ModelFacts>> {
  const out = new Map<string, ModelFacts>();

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
      if (typeof id !== 'string') continue;
      const length = entry?.context_length;
      out.set(id, {
        // Explicitly null for some models; only a positive number is usable.
        contextTokens:
          typeof length === 'number' && Number.isFinite(length) && length > 0
            ? Math.floor(length)
            : null,
        ...readPricing(entry),
      });
    }
  } catch (err) {
    console.warn('[ModelContext] Could not reach OpenRouter for model metadata:', err);
  }

  return out;
}

/**
 * What to store, given what is on the row and what OpenRouter just said.
 *
 * Never trades a value we have for one we do not. OpenRouter omits
 * `context_length` for some models and `pricing` for others, and a partial
 * payload is indistinguishable here from a provider that has genuinely stopped
 * publishing. Writing the null through would quietly blank a window that was
 * correct (sending requests back to the 32k floor) or a price that was correct
 * (which refuses the turn outright, since a null price cannot be charged).
 * Both are worse than a stale number, and this module's whole contract is that
 * a bad answer from OpenRouter leaves the last known one in place.
 *
 * Pure, so the rule can be tested without a database in front of it.
 */
export function mergeModelFacts(stored: ModelFacts, fetched: ModelFacts): ModelFacts {
  return {
    contextTokens: fetched.contextTokens ?? stored.contextTokens,
    inputPricePerMillion: fetched.inputPricePerMillion ?? stored.inputPricePerMillion,
    outputPricePerMillion: fetched.outputPricePerMillion ?? stored.outputPricePerMillion,
    cachedInputPricePerMillion:
      fetched.cachedInputPricePerMillion ?? stored.cachedInputPricePerMillion,
  };
}

/**
 * Bring stored context windows and prices in line with OpenRouter's.
 *
 * Prices matter here as much as windows now: a credit is charged from them,
 * so a stale price is a reader charged the wrong amount. Still background
 * work on a long timer rather than anything in front of a chat turn - a usage
 * record snapshots the prices it was charged at, so a turn served between two
 * refreshes is charged consistently even if the published price has moved.
 *
 * Only writes when something actually changed, so a refresh that finds nothing
 * new touches no rows.
 */
export async function refreshModelMetadata(): Promise<void> {
  const facts = await fetchModelFacts();
  if (facts.size === 0) return;

  const models = await listCloudModels();
  let updated = 0;

  for (const model of models) {
    const next = facts.get(model.id);
    if (!next) continue;

    const merged = mergeModelFacts(model, next);

    const unchanged =
      merged.contextTokens === model.contextTokens &&
      merged.inputPricePerMillion === model.inputPricePerMillion &&
      merged.outputPricePerMillion === model.outputPricePerMillion &&
      merged.cachedInputPricePerMillion === model.cachedInputPricePerMillion;
    if (unchanged) continue;

    if (
      model.inputPricePerMillion !== null &&
      merged.inputPricePerMillion !== model.inputPricePerMillion
    ) {
      // Worth a line in the log rather than a silent write: this is the event
      // that changes what a conversation costs a reader.
      console.log(
        `[ModelContext] ${model.id} input price ${model.inputPricePerMillion} -> ` +
          `${merged.inputPricePerMillion} per million.`,
      );
    }

    await setCloudModelFacts(model.id, merged);
    updated += 1;
  }

  if (updated > 0) {
    console.log(`[ModelContext] Refreshed metadata for ${updated} model(s).`);
  }
}

/**
 * Start the background refresh.
 *
 * `unref` so a pending timer never keeps the process alive on shutdown.
 */
export function startModelContextRefresh(): void {
  void refreshModelMetadata();
  const timer = setInterval(() => {
    void refreshModelMetadata();
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
 *
 * `minPlan` is the one exception, and it has to be: which tier a model belongs
 * to is a pricing decision Open Citadel makes, not a fact OpenRouter
 * publishes. The caller supplies it, so an admin adding a model has to say
 * where it sits rather than having a tier guessed from a price.
 */
export function toCloudModelOption(
  entry: OpenRouterModel,
  minPlan: PlanId,
): CloudModelOption | null {
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
    minPlan,
    ...readPricing(entry),
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
export async function fetchOpenRouterModel(
  modelId: string,
  minPlan: PlanId,
): Promise<FetchModelResult> {
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

  const model = toCloudModelOption(body.data as OpenRouterModel, minPlan);
  if (!model) return { kind: 'unreachable' };
  return { kind: 'found', model, canonicalId: model.id };
}
