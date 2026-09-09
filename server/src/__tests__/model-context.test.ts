import { describe, expect, it } from 'vitest';

import { DEFAULT_CLOUD_MODEL_ID } from 'samwell-shared';

import { resolveModelId } from '../db.js';
import {
  mergeModelFacts,
  toCloudModelOption,
  type ModelFacts,
  type OpenRouterModel,
} from '../model-context.js';

const glm: OpenRouterModel = {
  id: 'z-ai/glm-5.3-flash',
  name: 'GLM 5.3 Flash',
  description:
    'GLM 5.3 Flash is a fast, inexpensive model for everyday tasks. It also supports longer reasoning.',
  context_length: 200_000,
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
  supported_parameters: ['tools', 'structured_outputs', 'temperature'],
  // Dollars per TOKEN, which is how OpenRouter publishes them.
  pricing: { prompt: '0.000000075', completion: '0.00000025', input_cache_read: '0.000000015' },
};

describe('toCloudModelOption', () => {
  it('derives every catalog field from OpenRouter metadata', () => {
    const model = toCloudModelOption(glm, 'maester');
    expect(model).toEqual({
      id: 'z-ai/glm-5.3-flash',
      label: 'GLM 5.3 Flash',
      provider: 'Z.ai',
      description: 'GLM 5.3 Flash is a fast, inexpensive model for everyday tasks.',
      capabilities: ['text', 'vision', 'tools'],
      contextTokens: 200_000,
      minPlan: 'maester',
      inputPricePerMillion: 0.075,
      outputPricePerMillion: 0.25,
      cachedInputPricePerMillion: 0.015,
    });
  });

  it('converts prices from per-token to per-million', () => {
    // The unit trap: OpenRouter says 0.000000075, the rest of the system says
    // 0.075 per million, and getting this backwards by a factor of a million
    // is the kind of mistake that only shows up on an invoice.
    const model = toCloudModelOption(glm, 'maester');
    expect(model?.inputPricePerMillion).toBeCloseTo(0.075, 10);
    expect(model?.outputPricePerMillion).toBeCloseTo(0.25, 10);
  });

  it('reads a missing or zero price as unknown rather than free', () => {
    // A zero price would make the model cost nothing to use and never
    // complain. Null refuses the turn instead.
    expect(toCloudModelOption({ ...glm, pricing: null }, 'maester')?.inputPricePerMillion).toBeNull();
    expect(
      toCloudModelOption({ ...glm, pricing: { prompt: '0', completion: '0' } }, 'maester')
        ?.inputPricePerMillion,
    ).toBeNull();
    expect(
      toCloudModelOption({ ...glm, pricing: { prompt: '0.000001', completion: '0.000002' } }, 'maester')
        ?.cachedInputPricePerMillion,
    ).toBeNull();
  });

  it('carries the tier it was given, since OpenRouter cannot know it', () => {
    expect(toCloudModelOption(glm, 'archmaester')?.minPlan).toBe('archmaester');
  });

  it('truncates an overlong first sentence instead of shipping a paragraph', () => {
    const model = toCloudModelOption({
      ...glm,
      description: 'A single unbroken sentence that runs on and on '.repeat(30),
    }, 'maester');
    expect(model?.description.length).toBeLessThanOrEqual(200);
    expect(model?.description.endsWith('...')).toBe(true);
  });

  it('falls back to the label when there is no description', () => {
    const model = toCloudModelOption({ ...glm, description: undefined }, 'maester');
    expect(model?.description).toBe('GLM 5.3 Flash');
  });

  it('maps audio input and treats an empty modality list as text', () => {
    const audio = toCloudModelOption({
      ...glm,
      architecture: { input_modalities: ['text', 'audio'], output_modalities: ['text'] },
    }, 'maester');
    expect(audio?.capabilities).toContain('audio');

    const unknown = toCloudModelOption({ ...glm, architecture: null }, 'maester');
    expect(unknown?.capabilities).toContain('text');
  });

  it('drops tools when OpenRouter does not list them', () => {
    const model = toCloudModelOption({ ...glm, supported_parameters: ['temperature'] }, 'maester');
    expect(model?.capabilities).toEqual(['text', 'vision']);
  });

  it('returns null without an id or a name', () => {
    expect(toCloudModelOption({ ...glm, id: undefined }, 'maester')).toBeNull();
    expect(toCloudModelOption({ ...glm, name: '' }, 'maester')).toBeNull();
  });

  it('ignores a context length that is not a positive number', () => {
    expect(toCloudModelOption({ ...glm, context_length: null }, 'maester')?.contextTokens).toBeNull();
    expect(toCloudModelOption({ ...glm, context_length: 0 }, 'maester')?.contextTokens).toBeNull();
  });
});

describe('mergeModelFacts', () => {
  const stored: ModelFacts = {
    contextTokens: 200_000,
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.25,
    cachedInputPricePerMillion: 0.015,
  };

  it('takes every fresh value when OpenRouter published one', () => {
    const fetched: ModelFacts = {
      contextTokens: 400_000,
      inputPricePerMillion: 0.09,
      outputPricePerMillion: 0.3,
      cachedInputPricePerMillion: 0.02,
    };
    expect(mergeModelFacts(stored, fetched)).toEqual(fetched);
  });

  it('keeps a known price rather than blanking it', () => {
    // A null price cannot be charged, so writing one through would take the
    // model out of service on a partial payload.
    const blank: ModelFacts = {
      contextTokens: null,
      inputPricePerMillion: null,
      outputPricePerMillion: null,
      cachedInputPricePerMillion: null,
    };
    expect(mergeModelFacts(stored, blank)).toEqual(stored);
  });

  it('keeps a known window rather than falling back to the floor', () => {
    const partial: ModelFacts = {
      contextTokens: null,
      inputPricePerMillion: 0.09,
      outputPricePerMillion: 0.3,
      cachedInputPricePerMillion: null,
    };
    const merged = mergeModelFacts(stored, partial);
    expect(merged.contextTokens).toBe(200_000);
    expect(merged.inputPricePerMillion).toBe(0.09);
    // Not every provider caches, and one that stops saying so keeps its last
    // known rate rather than silently becoming ten times dearer.
    expect(merged.cachedInputPricePerMillion).toBe(0.015);
  });

  it('fills in a value the row never had', () => {
    const empty: ModelFacts = {
      contextTokens: null,
      inputPricePerMillion: null,
      outputPricePerMillion: null,
      cachedInputPricePerMillion: null,
    };
    expect(mergeModelFacts(empty, stored)).toEqual(stored);
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
    // Read from the catalogue rather than written out again: this test used to
    // name the id, and naming it is how it started disagreeing with the
    // catalogue the moment the default moved.
    expect(resolveModelId(undefined, [])).toBe(DEFAULT_CLOUD_MODEL_ID);
  });
});
