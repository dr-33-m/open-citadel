import { describe, expect, it } from 'vitest';

import { CLOUD_VOICE_CATALOG, listedVoices, type VoiceModelView } from 'samwell-shared';

import {
  cloudChoiceFor,
  cloudCostLines,
  makerChoices,
  modelChoices,
  modelForMaker,
  planShortName,
  resolveCloudSelection,
  selectionKey,
} from '@/features/tts/utils/cloud-voices';

const VIEWS: VoiceModelView[] = CLOUD_VOICE_CATALOG.map((model) => ({
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
  hours: 59.7,
  hoursByPlan: { maester: 59.7 },
}));
const KOKORO = 'hexgrad/kokoro-82m';
const LITE = 'google/gemini-3.8-flash-lite-tts';

describe('resolveCloudSelection', () => {
  it('keeps a stored voice the plan reaches', () => {
    const selection = resolveCloudSelection(`cloud:${LITE}:Puck`, VIEWS, KOKORO);
    expect(selection?.model.id).toBe(LITE);
    expect(selection?.voice).toBe('Puck');
    expect(selection && selectionKey(selection)).toBe(`cloud:${LITE}:Puck`);
  });

  it('falls to the plan default for a model out of reach, and to the model default for a lost voice', () => {
    const maester = VIEWS.filter((model) => model.minPlan === 'maester');
    expect(resolveCloudSelection(`cloud:${LITE}:Puck`, maester, KOKORO)).toMatchObject({ voice: 'af_heart' });
    expect(resolveCloudSelection(`cloud:${KOKORO}:zz_gone`, VIEWS, KOKORO)?.voice).toBe('af_heart');
    expect(resolveCloudSelection(null, VIEWS, LITE)).toMatchObject({ voice: 'Kore' });
    expect(resolveCloudSelection(null, [], LITE)).toBeNull();
  });
});

describe('cloudChoiceFor', () => {
  it('asks for speed only from a maker that takes it, and never at 1x', () => {
    expect(cloudChoiceFor(`cloud:${KOKORO}:af_heart`, VIEWS, 1.25)?.speed).toBe(1.25);
    expect(cloudChoiceFor(`cloud:${KOKORO}:af_heart`, VIEWS, 1)?.speed).toBeNull();
    expect(cloudChoiceFor(`cloud:${LITE}:Kore`, VIEWS, 1.25)?.speed).toBeNull();
  });

  it('reads a rate that came back through a float as the one that was set', () => {
    expect(cloudChoiceFor(`cloud:${KOKORO}:af_heart`, VIEWS, Math.fround(1.1))?.speed).toBe(1.1);
    expect(cloudChoiceFor(`cloud:${KOKORO}:af_heart`, VIEWS, Math.fround(1.0000001))?.speed).toBeNull();
  });

  it('still asks without a catalogue, at the limit every maker takes', () => {
    expect(cloudChoiceFor(`cloud:${LITE}:Kore`, null, 1)).toEqual({
      modelId: LITE,
      voice: 'Kore',
      speed: null,
      maxCharacters: 1_500,
      format: 'pcm',
    });
    expect(cloudChoiceFor(`cloud:${LITE}:Kore`, VIEWS, 1, 'mp3')?.format).toBe('mp3');
    expect(cloudChoiceFor('af_heart', VIEWS, 1)).toBeNull();
  });
});

describe('the chips', () => {
  it('lists each maker once, locked with the plan that opens it', () => {
    expect(makerChoices(VIEWS, 'grand_maester')).toEqual([
      { value: 'Kokoro', label: 'KOKORO', locked: null, minPlan: 'maester' },
      { value: 'Google', label: 'GOOGLE', locked: null, minPlan: 'grand_maester' },
      { value: 'ElevenLabs', label: 'ELEVENLABS', locked: 'ARCHMAESTER', minPlan: 'archmaester' },
    ]);
    expect(makerChoices(VIEWS, null).every((choice) => choice.locked)).toBe(true);
  });

  it('names a plan the way a chip has room for', () => {
    expect(planShortName('grand_maester')).toBe('GRAND MAESTER');
  });

  it('tells a maker models apart by what differs, and offers none for a single model', () => {
    const google = VIEWS.filter((model) => model.maker === 'Google');
    expect(modelChoices(google).map((choice) => choice.label)).toEqual(['FLASH LITE', 'FLASH']);
    const eleven = VIEWS.filter((model) => model.maker === 'ElevenLabs');
    expect(modelChoices(eleven).map((choice) => choice.label)).toEqual(['V4 TURBO', 'V4']);
    expect(modelChoices(VIEWS.filter((model) => model.maker === 'Kokoro'))).toEqual([]);
  });

  it('lands a maker on the voice that lasts', () => {
    expect(modelForMaker(VIEWS, 'Google', LITE)?.id).toBe(LITE);
    expect(modelForMaker(VIEWS, 'ElevenLabs', LITE)?.id).toBe('elevenlabs/eleven-v4-turbo');
    expect(modelForMaker(VIEWS, 'Nobody', LITE)).toBeNull();
  });
});

describe('cloudCostLines', () => {
  it('says a chapter in Neurons and a month in hours, without em dashes', () => {
    const lines = cloudCostLines(VIEWS[0], 59.7);
    expect(lines).toEqual({ chapter: 'About 17 Neurons a chapter', hours: 'About 60 hours a month on your plan' });
    expect(cloudCostLines({ ...VIEWS[0], chapterCredits: 1 }, 4.5)).toEqual({
      chapter: 'About 1 Neuron a chapter',
      hours: 'About 4.5 hours a month on your plan',
    });
    expect(cloudCostLines({ ...VIEWS[0], chapterCredits: null }, null)).toEqual({ chapter: null, hours: null });
  });
});
