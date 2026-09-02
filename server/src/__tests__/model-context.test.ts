import { describe, expect, it } from 'vitest';

import { resolveModelId } from '../db.js';
import { toCloudModelOption, type OpenRouterModel } from '../model-context.js';

const glm: OpenRouterModel = {
  id: 'z-ai/glm-5.3-flash',
  name: 'GLM 5.3 Flash',
  description:
    'GLM 5.3 Flash is a fast, inexpensive model for everyday tasks. It also supports longer reasoning.',
  context_length: 200_000,
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
  supported_parameters: ['tools', 'structured_outputs', 'temperature'],
};

describe('toCloudModelOption', () => {
  it('derives every catalog field from OpenRouter metadata', () => {
    const model = toCloudModelOption(glm);
    expect(model).toEqual({
      id: 'z-ai/glm-5.3-flash',
      label: 'GLM 5.3 Flash',
      provider: 'Z.ai',
      description: 'GLM 5.3 Flash is a fast, inexpensive model for everyday tasks.',
      capabilities: ['text', 'vision', 'tools'],
      contextTokens: 200_000,
    });
  });

  it('truncates an overlong first sentence instead of shipping a paragraph', () => {
    const model = toCloudModelOption({
      ...glm,
      description: 'A single unbroken sentence that runs on and on '.repeat(30),
    });
    expect(model?.description.length).toBeLessThanOrEqual(200);
    expect(model?.description.endsWith('...')).toBe(true);
  });

  it('falls back to the label when there is no description', () => {
    const model = toCloudModelOption({ ...glm, description: undefined });
    expect(model?.description).toBe('GLM 5.3 Flash');
  });

  it('maps audio input and treats an empty modality list as text', () => {
    const audio = toCloudModelOption({
      ...glm,
      architecture: { input_modalities: ['text', 'audio'], output_modalities: ['text'] },
    });
    expect(audio?.capabilities).toContain('audio');

    const unknown = toCloudModelOption({ ...glm, architecture: null });
    expect(unknown?.capabilities).toContain('text');
  });

  it('drops tools when OpenRouter does not list them', () => {
    const model = toCloudModelOption({ ...glm, supported_parameters: ['temperature'] });
    expect(model?.capabilities).toEqual(['text', 'vision']);
  });

  it('returns null without an id or a name', () => {
    expect(toCloudModelOption({ ...glm, id: undefined })).toBeNull();
    expect(toCloudModelOption({ ...glm, name: '' })).toBeNull();
  });

  it('ignores a context length that is not a positive number', () => {
    expect(toCloudModelOption({ ...glm, context_length: null })?.contextTokens).toBeNull();
    expect(toCloudModelOption({ ...glm, context_length: 0 })?.contextTokens).toBeNull();
  });
});

describe('resolveModelId', () => {
  const known = ['z-ai/glm-5.3-flash', 'google/gemini-2.5-flash'];

  it('keeps a requested model the server knows', () => {
    expect(resolveModelId('google/gemini-2.5-flash', known)).toBe('google/gemini-2.5-flash');
  });

  it('falls back to the first known row for a retired or unknown ID', () => {
    expect(resolveModelId('openai/gpt-5.6-luna', known)).toBe('z-ai/glm-5.3-flash');
    expect(resolveModelId(undefined, known)).toBe('z-ai/glm-5.3-flash');
  });

  it('answers with the shared default when the table is empty', () => {
    expect(resolveModelId(undefined, [])).toBe('openai/gpt-5.6-luna');
  });
});
