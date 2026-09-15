import { planIncludes, type PlanId } from './billing';

export type CloudModelCapability = 'text' | 'vision' | 'audio' | 'tools';

export interface CloudModelOption {
  id: string;
  label: string;
  provider: string;
  description: string;
  capabilities: CloudModelCapability[];
  /**
   * The model's context window in tokens, or null when it is not known yet.
   *
   * Filled from OpenRouter's own model metadata rather than hardcoded here —
   * providers widen these over time and the catalogue below would rot. The
   * values in the catalogue are a conservative floor used before the first
   * refresh lands, and on a device that has never reached the server.
   *
   * Null means "assume the floor": see `resolveContextTokens`.
   */
  contextTokens: number | null;
  /**
   * The cheapest plan that may reach this model.
   *
   * Access is cumulative, so this is a floor and not a band membership: a
   * reader on Archmaester sees every model whose `minPlan` they meet or
   * exceed. The column lives in the database beside the rest of the catalogue,
   * so moving a model between tiers is an admin call rather than a deploy.
   */
  minPlan: PlanId;
  /**
   * What OpenRouter charges for this model, per million tokens.
   *
   * Null until the first metadata refresh lands. The catalogue values below
   * are a seed for a fresh database, not a source of truth: prices change, and
   * a table of them written into application code is wrong the month after it
   * is written. `model-context.ts` pulls the live numbers on a timer, and a
   * usage record snapshots the two it was charged at so history stays honest
   * across a price change.
   */
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  /**
   * What a cached input token costs, where the provider caches at all.
   *
   * Worth its own field rather than being folded into the input price.
   * Samwell re-sends a persona, a book grounding and thirty-three tool schemas
   * on every turn, and real traffic puts the median call at 95% cached, so
   * charging everything at the fresh rate would overstate a conversation by
   * about two and a half times.
   */
  cachedInputPricePerMillion: number | null;
}

/**
 * What to assume when a model's real window is unknown.
 *
 * Deliberately small. Every model in the catalogue is far larger than this, so
 * guessing low costs an unnecessary compaction on a very long chat, while
 * guessing high costs a failed request — and the failure is the one the reader
 * sees.
 */
export const FALLBACK_CONTEXT_TOKENS = 32_000;

export function resolveContextTokens(model: Pick<CloudModelOption, 'contextTokens'>): number {
  return model.contextTokens && model.contextTokens > 0
    ? model.contextTokens
    : FALLBACK_CONTEXT_TOKENS;
}

/**
 * The models each plan opens up, and the prices they were seeded with.
 *
 * Three per tier, chosen so a plan is a step up in what Samwell can think
 * with rather than in how much of the same thing you get. The prices here are
 * only a seed for an empty database; see `inputPricePerMillion` above.
 */
export const CLOUD_MODEL_CATALOG: CloudModelOption[] = [
  {
    id: 'z-ai/glm-5.3-flash',
    label: 'GLM 5.3 Flash',
    provider: 'Z.ai',
    description: 'Fast, with a very large window for long conversations.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 1_310_720,
    minPlan: 'maester',
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.25,
    cachedInputPricePerMillion: 0.015,
  },
  {
    id: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    provider: 'OpenAI',
    description: 'Quick and even-handed. The model that introduces Samwell.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 1_050_000,
    minPlan: 'maester',
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 1.2,
    cachedInputPricePerMillion: 0.02,
  },
  {
    id: 'deepseek/deepseek-v4-flash-0731',
    label: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    description: 'Steady reasoning at the lowest price here. Text only.',
    capabilities: ['text', 'tools'],
    contextTokens: 1_310_720,
    minPlan: 'maester',
    inputPricePerMillion: 0.065,
    outputPricePerMillion: 0.18,
    cachedInputPricePerMillion: 0.016,
  },
  {
    id: 'anthropic/claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'Anthropic',
    description: 'Careful literary reading and long-form argument.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 1_000_000,
    minPlan: 'grand_maester',
    inputPricePerMillion: 2,
    outputPricePerMillion: 10,
    cachedInputPricePerMillion: 0.2,
  },
  {
    id: 'openai/gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    provider: 'OpenAI',
    description: 'Broad general reasoning with a very large window.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 1_050_000,
    minPlan: 'grand_maester',
    inputPricePerMillion: 2,
    outputPricePerMillion: 12,
    cachedInputPricePerMillion: 0.2,
  },
  {
    id: 'deepseek/deepseek-v4-pro-0813',
    label: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    description: 'Deep reasoning at a fraction of the tier price. Text only.',
    capabilities: ['text', 'tools'],
    contextTokens: 1_048_576,
    minPlan: 'grand_maester',
    inputPricePerMillion: 0.57948,
    outputPricePerMillion: 1.73844,
    cachedInputPricePerMillion: 0.018438,
  },
  {
    id: 'anthropic/claude-opus-5',
    label: 'Claude Opus 5',
    provider: 'Anthropic',
    description: 'The deepest reading in the app, and the dearest.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 1_000_000,
    minPlan: 'archmaester',
    inputPricePerMillion: 5,
    outputPricePerMillion: 25,
    cachedInputPricePerMillion: 0.5,
  },
  {
    id: 'openai/gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    provider: 'OpenAI',
    description: 'Frontier reasoning, and the cheapest of this tier.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 1_050_000,
    minPlan: 'archmaester',
    inputPricePerMillion: 2,
    outputPricePerMillion: 10,
    cachedInputPricePerMillion: 0.2,
  },
  {
    id: 'moonshotai/kimi-k3',
    label: 'Kimi K3',
    provider: 'Moonshot AI',
    description: 'Frontier reasoning over very long context.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 1_048_576,
    minPlan: 'archmaester',
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    cachedInputPricePerMillion: 0.3,
  },
];

export const DEFAULT_CLOUD_MODEL_ID = CLOUD_MODEL_CATALOG[0].id;

/**
 * Everything a reader on this plan may reach, cheapest tier first.
 *
 * The one place that answers "which models can this account use". It matters
 * for more than the picker: the fallback chain a chat turn hands OpenRouter is
 * built from this too, because a Maester turn rerouted to an Archmaester model
 * is inference the house pays for.
 */
export function modelsForPlan<T extends Pick<CloudModelOption, 'minPlan'>>(
  models: T[],
  plan: PlanId,
): T[] {
  return models.filter((model) => planIncludes(plan, model.minPlan));
}
