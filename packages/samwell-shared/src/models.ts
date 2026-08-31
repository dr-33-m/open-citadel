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

export const CLOUD_MODEL_CATALOG: CloudModelOption[] = [
  {
    id: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    provider: 'OpenAI',
    description: 'Fast default model for everyday Samwell conversations.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 128_000,
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description: 'Strong long-form reasoning and literary analysis.',
    capabilities: ['text', 'vision', 'tools'],
    contextTokens: 200_000,
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    description: 'Low-latency fallback for quick answers.',
    capabilities: ['text', 'vision', 'audio', 'tools'],
    contextTokens: 1_000_000,
  },
];

export const DEFAULT_CLOUD_MODEL_ID = CLOUD_MODEL_CATALOG[0].id;

export function isCloudModelId(value: string): boolean {
  return CLOUD_MODEL_CATALOG.some((model) => model.id === value);
}

export function getCloudModel(value: string): CloudModelOption {
  return (
    CLOUD_MODEL_CATALOG.find((model) => model.id === value) ??
    CLOUD_MODEL_CATALOG[0]
  );
}

export function getFallbackModelIds(primaryModelId: string): string[] {
  return CLOUD_MODEL_CATALOG
    .map((model) => model.id)
    .filter((modelId) => modelId !== primaryModelId);
}
