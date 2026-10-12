import { describe, expect, it } from 'vitest';

import { CLOUD_VOICE_CATALOG, listedVoices, type VoiceModelView } from 'samwell-shared';

import { boxContents, cloudFigures, versionInfo, voiceBoxes, voiceVersions } from '@/features/tts/utils/cloud-voice-cards';

const VIEWS: VoiceModelView[] = CLOUD_VOICE_CATALOG.map((model, at) => ({
  id: model.id,
  label: model.label,
  maker: model.maker,
  description: model.description,
  minPlan: model.minPlan,
  speedSupported: model.speedSupported,
  maxCharacters: model.maxCharacters,
  voices: listedVoices(model),
  defaultVoice: model.defaultVoice,
  chapterCredits: 17 * (at + 1),
  hours: 60 / (at + 1),
  hoursByPlan: { archmaester: 90 / (at + 1) },
}));
const of = (maker: string) => VIEWS.filter((model) => model.maker === maker);

describe('voiceBoxes', () => {
  it('lists each box once, locked with the plan that opens it', () => {
    expect(voiceBoxes(VIEWS, 'grand_maester')).toEqual([
      { maker: 'Kokoro', label: 'KOKORO', locked: null, minPlan: 'maester' },
      { maker: 'Google', label: 'GOOGLE', locked: null, minPlan: 'grand_maester' },
      { maker: 'ElevenLabs', label: 'ELEVENLABS', locked: 'ARCHMAESTER', minPlan: 'archmaester' },
    ]);
  });

  it('locks every box for a reader with no plan', () => {
    expect(voiceBoxes(VIEWS, null).every((box) => box.locked !== null)).toBe(true);
  });
});

describe('boxContents', () => {
  const FLASH = of('Google')[1];
  const TURBO = of('ElevenLabs')[0];

  it('gives the chosen box the selection, and every other box where its tab would land', () => {
    const contents = boxContents(VIEWS, { model: FLASH, voice: 'Puck' }, TURBO.id);
    expect(contents.map((content) => content.maker)).toEqual(['Kokoro', 'Google', 'ElevenLabs']);
    // The box in hand: the version and voice the reader chose.
    expect(contents[1]).toMatchObject({ model: FLASH, voice: 'Puck' });
    expect(contents[1].versions.map((choice) => choice.label)).toEqual(['FLASH LITE', 'FLASH']);
    // The plan's default is one of ElevenLabs': its tab lands there, on its own default voice.
    expect(contents[2]).toMatchObject({ model: TURBO, voice: TURBO.defaultVoice });
    // No default among Kokoro's: its first version, which has no versions to choose between.
    expect(contents[0]).toMatchObject({ model: of('Kokoro')[0], versions: [] });
  });

  it('has a pane only for the boxes the plan opens', () => {
    const reached = VIEWS.filter((model) => model.maker !== 'ElevenLabs');
    expect(boxContents(reached, null, null).map((content) => content.maker)).toEqual(['Kokoro', 'Google']);
    expect(boxContents([], null, null)).toEqual([]);
  });
});

describe('voiceVersions', () => {
  it('tells a box versions apart by what differs, and offers none for a single version', () => {
    expect(voiceVersions(of('Google')).map((choice) => choice.label)).toEqual(['FLASH LITE', 'FLASH']);
    expect(voiceVersions(of('ElevenLabs'))).toEqual([
      { value: 'elevenlabs/eleven-v4-turbo', label: 'V4 TURBO' },
      { value: 'elevenlabs/eleven-v4', label: 'V4' },
    ]);
    expect(voiceVersions(of('Kokoro'))).toEqual([]);
  });
});

describe('cloudFigures', () => {
  it('says a month in hours and a chapter in Neurons, as estimates', () => {
    expect(cloudFigures(VIEWS[0], 'maester')).toEqual([
      { key: 'hours', value: '≈ 60', unit: 'hours', label: 'A MONTH' },
      { key: 'chapter', value: '≈ 17', unit: 'Neurons', label: 'A CHAPTER' },
    ]);
  });

  it('reads the hours for the plan held, where the server sent them', () => {
    expect(cloudFigures(of('ElevenLabs')[0], 'archmaester')[0]).toMatchObject({ value: '≈ 23' });
    expect(cloudFigures(of('ElevenLabs')[0], 'maester')[0]).toMatchObject({ value: '≈ 15' });
  });

  it('keeps a tenth under ten hours, and says one of a thing as one', () => {
    expect(cloudFigures({ ...VIEWS[0], hours: 4.46, hoursByPlan: {}, chapterCredits: 1_125 }, null)).toMatchObject([
      { value: '≈ 4.5' },
      { value: '≈ 1,125' },
    ]);
    expect(cloudFigures({ ...VIEWS[0], hours: 1, hoursByPlan: {}, chapterCredits: 1 }, null)).toMatchObject([
      { unit: 'hour' },
      { unit: 'Neuron' },
    ]);
  });

  it('draws nothing for a voice with no price', () => {
    expect(cloudFigures({ ...VIEWS[0], hours: null, hoursByPlan: {}, chapterCredits: null }, 'maester')).toEqual([]);
  });
});

describe('versionInfo', () => {
  it('names the box and the version, with its figures and how to read them', () => {
    const info = versionInfo(of('Google')[0], 'grand_maester');
    expect(info).toMatchObject({ label: 'GOOGLE', title: 'Gemini Flash Lite', line: 'Clear and natural, and it lasts.' });
    expect(info.figures).toHaveLength(2);
    expect(info.points).toEqual([
      'Hours are what a whole month of Neurons buys on this voice.',
      'A chapter is about 25 minutes of listening.',
      'This voice reads at its own pace, so there is no speed to set.',
    ]);
  });

  it('says nothing about pace for a voice whose speed can be set, or about figures it does not have', () => {
    expect(versionInfo(of('Kokoro')[0], 'maester').points).toHaveLength(2);
    expect(versionInfo({ ...of('Kokoro')[0], hours: null, hoursByPlan: {}, chapterCredits: null }, 'maester').points).toEqual([]);
  });

  it('never uses an em dash', () => {
    for (const model of VIEWS) {
      const info = versionInfo(model, 'archmaester');
      for (const line of [info.title, info.line, ...info.points]) expect(line).not.toMatch(/—/);
    }
  });
});
