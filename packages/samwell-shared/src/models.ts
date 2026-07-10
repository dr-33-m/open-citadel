export type CloudModelCapability = 'text' | 'vision' | 'audio' | 'tools';

export interface CloudModelOption {
  id: string;
  label: string;
  provider: string;
  description: string;
  capabilities: CloudModelCapability[];
}

export const CLOUD_MODEL_CATALOG: CloudModelOption[] = [
  {
    id: 'openai/gpt-5.2-chat',
    label: 'GPT-5.2 Chat',
    provider: 'OpenAI',
    description: 'Fast default model for everyday Samwell conversations.',
    capabilities: ['text', 'vision', 'tools'],
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description: 'Strong long-form reasoning and literary analysis.',
    capabilities: ['text', 'vision', 'tools'],
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    description: 'Low-latency fallback for quick answers.',
    capabilities: ['text', 'vision', 'audio', 'tools'],
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
