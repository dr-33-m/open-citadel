import { describe, expect, it } from 'vitest';

import { CLOUD_VOICE_CATALOG, CREDIT_PLANS, listedVoices, type PlanId, type VoiceFigures } from 'samwell-shared';

import { planBrains, planVoices } from '../plan-spend';

const BRAINS = [
  { id: 'z-ai/glm', label: 'Z.ai: GLM 5.3 Flash', provider: 'Z.ai', minPlan: 'maester' as PlanId, forecastCredits: 2 },
  { id: 'openai/luna', label: 'OpenAI: GPT-5.6 Luna', provider: 'OpenAI', minPlan: 'maester' as PlanId, forecastCredits: null },
  { id: 'anthropic/sonnet-5', label: 'Anthropic: Claude Sonnet 5', provider: 'Anthropic', minPlan: 'grand_maester' as PlanId, forecastCredits: 14 },
  { id: 'x-ai/grok-46', label: 'X.ai: Grok 4.6', provider: 'X.ai', minPlan: 'grand_maester' as PlanId, forecastCredits: 16 },
  { id: 'anthropic/opus-5', label: 'Anthropic: Claude Opus 5', provider: 'Anthropic', minPlan: 'archmaester' as PlanId, forecastCredits: 35 },
];

/** Hours a month by model and plan, as the server would send them. */
const HOURS: Record<string, Partial<Record<PlanId, number>>> = {
  'hexgrad/kokoro-82m': { maester: 59.7, grand_maester: 238.8, archmaester: 716.4 },
  'google/gemini-3.8-flash-lite-tts': { grand_maester: 15.2, archmaester: 45.6 },
  'google/gemini-3.8-flash-tts': { grand_maester: 7.6, archmaester: 22.8 },
  'elevenlabs/eleven-v4-turbo': { archmaester: 22.2 },
  'elevenlabs/eleven-v4': { archmaester: 1 },
};

const VOICES: VoiceFigures = {
  defaultModelId: null,
  models: CLOUD_VOICE_CATALOG.map((model) => ({
    id: model.id,
    label: model.label,
    maker: model.maker,
    description: model.description,
    minPlan: model.minPlan,
    speedSupported: model.speedSupported,
    maxCharacters: model.maxCharacters,
    voices: listedVoices(model),
    defaultVoice: model.defaultVoice,
    chapterCredits: 17,
    hours: null,
    hoursByPlan: HOURS[model.id] ?? {},
  })),
  byPlan: {
    maester: { makers: ['Kokoro'], defaultModelId: 'hexgrad/kokoro-82m', hours: 59.7 },
    grand_maester: { makers: ['Kokoro', 'Google'], defaultModelId: 'google/gemini-3.8-flash-lite-tts', hours: 15.2 },
    archmaester: { makers: ['Kokoro', 'Google', 'ElevenLabs'], defaultModelId: 'elevenlabs/eleven-v4-turbo', hours: 22.2 },
  },
};

describe('planBrains', () => {
  it('opens on the dearest brain, whose estimate is the floor', () => {
    const side = planBrains(CREDIT_PLANS.grand_maester, BRAINS, 4);
    expect(side.defaultValue).toBe('x-ai/grok-46');
    expect(side.figures['x-ai/grok-46']).toEqual({ value: '≈ 600', unit: 'conversations' });
  });

  it('browses its own tier first, then the tiers beneath under their names', () => {
    const side = planBrains(CREDIT_PLANS.grand_maester, BRAINS, 4);
    expect(side.groups.map((group) => group.label)).toEqual([null, 'Maester']);
    expect(side.groups[0].options.map((option) => option.label)).toEqual(['Claude Sonnet 5', 'Grok 4.6']);
    // A brain with no price has no estimate, so there is nothing to browse to.
    expect(side.groups[1].options.map((option) => option.value)).toEqual(['z-ai/glm']);
  });

  it('lists the brains new at its tier and folds the rest into a line', () => {
    const side = planBrains(CREDIT_PLANS.archmaester, BRAINS, 5);
    expect(side.rows).toEqual([{ key: 'anthropic/opus-5', kicker: 'Anthropic', name: 'Claude Opus 5' }]);
    expect(side.more).toBe('Plus the 4 Grand Maester and Maester brains');
    expect(side.total).toBe('5 total');
    expect(planBrains(CREDIT_PLANS.maester, BRAINS, 2).more).toBeNull();
  });

  it('keeps to the count against a server with no catalogue', () => {
    const side = planBrains(CREDIT_PLANS.maester, [], 3);
    expect(side.groups).toEqual([]);
    expect(side.defaultValue).toBeNull();
    expect(side.rows).toEqual([]);
    expect(side.fallback).toEqual({ value: '3', unit: 'brains to think with' });
    expect(side.more).toBe('3 brains are open to this plan.');
  });
});

describe('planVoices', () => {
  it('is absent when the server sent no cloud voices', () => {
    expect(planVoices(CREDIT_PLANS.maester, null)).toBeNull();
    expect(planVoices(CREDIT_PLANS.maester, { ...VOICES, models: [] })).toBeNull();
  });

  it("opens on the plan's own default voice, the figure its card quotes", () => {
    const side = planVoices(CREDIT_PLANS.archmaester, VOICES)!;
    expect(side.defaultValue).toBe('elevenlabs/eleven-v4-turbo');
    expect(side.figures['elevenlabs/eleven-v4-turbo']).toEqual({ value: '≈ 22', unit: 'hours read aloud' });
    expect(side.figures['hexgrad/kokoro-82m'].value).toBe('≈ 716');
    expect(side.figures['elevenlabs/eleven-v4'].unit).toBe('hour read aloud');
  });

  it('browses every voice the plan reaches, under its voice box', () => {
    const side = planVoices(CREDIT_PLANS.grand_maester, VOICES)!;
    expect(side.groups).toEqual([
      { label: 'Kokoro', options: [{ value: 'hexgrad/kokoro-82m', label: 'Kokoro' }] },
      {
        label: 'Google',
        options: [
          { value: 'google/gemini-3.8-flash-lite-tts', label: 'Gemini Flash Lite' },
          { value: 'google/gemini-3.8-flash-tts', label: 'Gemini Flash' },
        ],
      },
    ]);
    expect(side.figures['elevenlabs/eleven-v4']).toBeUndefined();
  });

  it('lists the voice boxes the plan opens, and only those', () => {
    const maester = planVoices(CREDIT_PLANS.maester, VOICES)!;
    expect(maester.rows).toEqual([{ key: 'Kokoro', kicker: null, name: 'Kokoro' }]);
    expect(maester.total).toBe('1 total');
    expect(maester.more).toBeNull();

    const arch = planVoices(CREDIT_PLANS.archmaester, VOICES)!;
    expect(arch.rows.map((row) => row.name)).toEqual(['Kokoro', 'Google', 'ElevenLabs']);
    expect(arch.total).toBe('3 total');
    expect(arch.more).toBeNull();
  });

  it('falls back to a count when no voice has a price', () => {
    const unpriced = { ...VOICES, models: VOICES.models.map((model) => ({ ...model, hoursByPlan: {} })) };
    const side = planVoices(CREDIT_PLANS.grand_maester, unpriced)!;
    expect(side.groups).toEqual([]);
    expect(side.defaultValue).toBeNull();
    expect(side.fallback).toEqual({ value: '2', unit: 'voice boxes to read with' });
  });
});
