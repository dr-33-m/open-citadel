import { describe, expect, it } from 'vitest';

import { CREDIT_PLANS, PLAN_ORDER, creditValueUsd, planRank } from '../billing';
import {
    CHAPTER_CHARACTERS,
    CHARACTERS_PER_HOUR,
    CLOUD_VOICE_CATALOG,
    CLOUD_VOICE_MAX_CHARACTERS,
    cloudVoiceKey,
    defaultVoiceModelId,
    listedVoices,
    listeningHours,
    parseCloudVoiceKey,
    pricePerMillionCharactersFromTokens,
    ttsCostUsd,
    ttsCreditsEstimate,
    voicesForPlan,
    speechFormatFor,
    withPcm,
} from '../voices';

const byId = (id: string) => {
  const model = CLOUD_VOICE_CATALOG.find((m) => m.id === id);
  if (!model) throw new Error(`no ${id} in the catalogue`);
  return model;
};

describe('reach', () => {
  it('gives every plan at least one voice', () => {
    for (const plan of PLAN_ORDER) {
      expect(voicesForPlan(CLOUD_VOICE_CATALOG, plan).length).toBeGreaterThan(0);
    }
  });

  it('is cumulative: a dearer plan reaches everything a cheaper one does', () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lower = voicesForPlan(CLOUD_VOICE_CATALOG, PLAN_ORDER[i - 1]).map((m) => m.id);
      const higher = voicesForPlan(CLOUD_VOICE_CATALOG, PLAN_ORDER[i]).map((m) => m.id);
      for (const id of lower) expect(higher).toContain(id);
      expect(higher.length).toBeGreaterThan(lower.length);
    }
  });

  it('places the makers where the plans say', () => {
    expect(voicesForPlan(CLOUD_VOICE_CATALOG, 'maester').map((m) => m.id)).toEqual([
      'hexgrad/kokoro-82m',
    ]);
    expect(voicesForPlan(CLOUD_VOICE_CATALOG, 'grand_maester').map((m) => m.maker)).toEqual([
      'Kokoro',
      'Google',
      'Google',
    ]);
    expect(new Set(voicesForPlan(CLOUD_VOICE_CATALOG, 'archmaester').map((m) => m.maker))).toEqual(
      new Set(['Kokoro', 'Google', 'ElevenLabs']),
    );
  });

  it('leaves Grok Voice and Fish Audio out of this version', () => {
    const ids = CLOUD_VOICE_CATALOG.map((m) => m.id).join(' ');
    expect(ids).not.toMatch(/grok|x-ai|fish/);
  });
});

describe('the default voice', () => {
  it('is the one that lasts in each band, not the dearest', () => {
    expect(defaultVoiceModelId(CLOUD_VOICE_CATALOG, 'maester')).toBe('hexgrad/kokoro-82m');
    expect(defaultVoiceModelId(CLOUD_VOICE_CATALOG, 'grand_maester')).toBe(
      'google/gemini-3.8-flash-lite-tts',
    );
    expect(defaultVoiceModelId(CLOUD_VOICE_CATALOG, 'archmaester')).toBe(
      'elevenlabs/eleven-v4-turbo',
    );
  });

  it('skips unpriced models, and still answers when nothing is priced', () => {
    const unpriced = CLOUD_VOICE_CATALOG.map((m) => ({ ...m, pricePerMillionCharacters: null }));
    expect(defaultVoiceModelId(unpriced, 'grand_maester')).toBe('hexgrad/kokoro-82m');
    const lite = CLOUD_VOICE_CATALOG.map((m) =>
      m.id === 'google/gemini-3.8-flash-lite-tts' ? { ...m, pricePerMillionCharacters: null } : m,
    );
    expect(defaultVoiceModelId(lite, 'grand_maester')).toBe('google/gemini-3.8-flash-tts');
  });

  it('names a voice the model has', () => {
    for (const model of CLOUD_VOICE_CATALOG) expect(model.voices).toContain(model.defaultVoice);
  });
});

describe('cost', () => {
  it('converts Gemini token prices to about ten and fifteen dollars a million characters', () => {
    // 25 audio tokens a second and 15 characters a second, plus the text in.
    expect(pricePerMillionCharactersFromTokens(0.0000005, 0.000006)).toBeCloseTo(10.125, 6);
    expect(pricePerMillionCharactersFromTokens(0.0000005, 0.000009)).toBeCloseTo(15.125, 6);
  });

  it('knows nothing about a voice whose audio price is unknown', () => {
    expect(pricePerMillionCharactersFromTokens(0.0000005, null)).toBeNull();
    expect(pricePerMillionCharactersFromTokens(0.0000005, 0)).toBeNull();
  });

  it('prices characters linearly and never below zero', () => {
    const kokoro = byId('hexgrad/kokoro-82m');
    expect(ttsCostUsd(1_000_000, kokoro)).toBeCloseTo(0.62, 10);
    expect(ttsCostUsd(0, kokoro)).toBe(0);
    expect(ttsCostUsd(-50, kokoro)).toBe(0);
    expect(ttsCostUsd(100, { pricePerMillionCharacters: null })).toBeNull();
  });

  it('estimates a chapter in Neurons, never as nothing', () => {
    const kokoro = byId('hexgrad/kokoro-82m');
    // 22,500 characters at $0.62/M is $0.01395, about 17 Neurons at $0.0008.
    expect(ttsCreditsEstimate(CHAPTER_CHARACTERS, kokoro, 'maester')).toBe(17);
    expect(ttsCreditsEstimate(1, kokoro, 'maester')).toBe(1);
  });

  it('derives the Neuron from the plan, never from a literal', () => {
    const turbo = byId('elevenlabs/eleven-v4-turbo');
    const cost = ttsCostUsd(CHAPTER_CHARACTERS, turbo) as number;
    expect(ttsCreditsEstimate(CHAPTER_CHARACTERS, turbo, 'archmaester')).toBe(
      Math.round(cost / creditValueUsd(CREDIT_PLANS.archmaester)),
    );
  });
});

describe('hours of listening', () => {
  // The spec's figures, with a floor a little under each so a seed price
  // moving by a cent does not fail the build, while a default voice that
  // would leave a plan with a weekend of listening does.
  const floors = {
    maester: { model: 'hexgrad/kokoro-82m', atLeast: 55 },
    grand_maester: { model: 'google/gemini-3.8-flash-lite-tts', atLeast: 14 },
    archmaester: { model: 'elevenlabs/eleven-v4-turbo', atLeast: 20 },
  } as const;

  it('gives no plan less than its floor on its default voice', () => {
    for (const plan of PLAN_ORDER) {
      const defaultId = defaultVoiceModelId(CLOUD_VOICE_CATALOG, plan) as string;
      expect(defaultId).toBe(floors[plan].model);
      const hours = listeningHours(plan, byId(defaultId)) as number;
      expect(hours).toBeGreaterThanOrEqual(floors[plan].atLeast);
    }
  });

  it('matches the spec: about 60, 14.6 and 22 hours', () => {
    expect(listeningHours('maester', byId('hexgrad/kokoro-82m'))).toBeCloseTo(59.7, 1);
    expect(listeningHours('grand_maester', byId('google/gemini-3.8-flash-lite-tts'))).toBeCloseTo(
      14.6,
      1,
    );
    expect(listeningHours('archmaester', byId('elevenlabs/eleven-v4-turbo'))).toBeCloseTo(22.2, 1);
  });

  it('spends exactly the AI budget over those hours', () => {
    const kokoro = byId('hexgrad/kokoro-82m');
    const hours = listeningHours('maester', kokoro) as number;
    expect((ttsCostUsd(CHARACTERS_PER_HOUR, kokoro) as number) * hours).toBeCloseTo(
      CREDIT_PLANS.maester.aiBudgetUsd,
      10,
    );
  });

  it('is null for a voice with no price', () => {
    expect(listeningHours('maester', { pricePerMillionCharacters: null })).toBeNull();
  });

  it('keeps every seeded model priced, within the piece limit, and ordered by plan', () => {
    let rank = 0;
    for (const model of CLOUD_VOICE_CATALOG) {
      expect(model.pricePerMillionCharacters).toBeGreaterThan(0);
      expect(model.maxCharacters).toBeLessThanOrEqual(CLOUD_VOICE_MAX_CHARACTERS);
      expect(planRank(model.minPlan)).toBeGreaterThanOrEqual(rank);
      rank = planRank(model.minPlan);
    }
  });
});

describe('stored voice keys', () => {
  it('round-trips a model and voice', () => {
    const key = cloudVoiceKey('google/gemini-3.8-flash-tts', 'Kore');
    expect(key).toBe('cloud:google/gemini-3.8-flash-tts:Kore');
    expect(parseCloudVoiceKey(key)).toEqual({ modelId: 'google/gemini-3.8-flash-tts', voice: 'Kore' });
  });

  it('splits on the last colon, so a variant id survives', () => {
    expect(parseCloudVoiceKey('cloud:fish-audio/s2.1-pro-free:free:abc')).toEqual({
      modelId: 'fish-audio/s2.1-pro-free:free',
      voice: 'abc',
    });
  });

  it('refuses anything that is not a cloud voice', () => {
    expect(parseCloudVoiceKey('af_heart')).toBeNull();
    expect(parseCloudVoiceKey(null)).toBeNull();
    expect(parseCloudVoiceKey('cloud:')).toBeNull();
    expect(parseCloudVoiceKey('cloud:hexgrad/kokoro-82m:')).toBeNull();
    expect(parseCloudVoiceKey('cloud::af_heart')).toBeNull();
  });
});

describe('listed voices', () => {
  it('offers Kokoro in English accents only, and everyone else whole', () => {
    const kokoro = listedVoices(byId('hexgrad/kokoro-82m'));
    expect(kokoro).toContain('af_heart');
    expect(kokoro).toContain('bm_george');
    expect(kokoro.every((voice) => /^[ab]/.test(voice))).toBe(true);
    expect(kokoro.length).toBe(28);
    const gemini = byId('google/gemini-3.8-flash-tts');
    expect(listedVoices(gemini)).toEqual(gemini.voices);
  });

  it('keeps every default voice on the list a reader sees', () => {
    for (const model of CLOUD_VOICE_CATALOG) expect(listedVoices(model)).toContain(model.defaultVoice);
  });
});

describe('speech formats', () => {
  it('asks for MP3 only from a maker that takes it', () => {
    const byId = (id: string) => CLOUD_VOICE_CATALOG.find((model) => model.id === id)!;
    expect(speechFormatFor(byId('hexgrad/kokoro-82m'), 'mp3')).toBe('mp3');
    expect(speechFormatFor(byId('elevenlabs/eleven-v4'), 'mp3')).toBe('mp3');
    // Gemini refuses anything but PCM, and refuses the whole piece.
    expect(speechFormatFor(byId('google/gemini-3.8-flash-lite-tts'), 'mp3')).toBe('pcm');
    expect(speechFormatFor(byId('google/gemini-3.8-flash-tts'), 'mp3')).toBe('pcm');
    expect(speechFormatFor(byId('hexgrad/kokoro-82m'), 'pcm')).toBe('pcm');
  });

  it('gives every model PCM', () => {
    for (const model of CLOUD_VOICE_CATALOG) expect(model.formats).toContain('pcm');
    expect(withPcm(['mp3'])).toEqual(['pcm', 'mp3']);
    expect(withPcm(['mp3', 'pcm', 'ogg'])).toEqual(['pcm', 'mp3']);
    expect(withPcm(null)).toEqual(['pcm']);
  });
});
