import { describe, expect, it } from 'vitest';

import { CLOUD_VOICE_CATALOG, listedVoices, type VoiceModelView } from 'samwell-shared';

import {
  cloudChoiceFor,
  cloudPaneView,
  landingForMaker,
  landingForModel,
  modelForMaker,
  rememberCloudPick,
  rememberedVoice,
  planForCloudVoice,
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

describe('where a choice lands', () => {
  it('lands a maker on the voice that lasts', () => {
    expect(modelForMaker(VIEWS, 'Google', LITE)?.id).toBe(LITE);
    expect(modelForMaker(VIEWS, 'ElevenLabs', LITE)?.id).toBe('elevenlabs/eleven-v4-turbo');
    expect(modelForMaker(VIEWS, 'Nobody', LITE)).toBeNull();
  });

  it('finds the plan that brings a stored voice back', () => {
    expect(planForCloudVoice(`cloud:${LITE}:Kore`, VIEWS)).toBe('grand_maester');
    expect(planForCloudVoice('cloud:elevenlabs/eleven-v4:george', VIEWS)).toBe('archmaester');
    expect(planForCloudVoice('af_heart', VIEWS)).toBeNull();
    expect(planForCloudVoice(`cloud:${LITE}:Kore`, null)).toBeNull();
  });

  it('shows the voices to a reader with a plan, whoever they are', () => {
    expect(cloudPaneView({ status: 'active', identity: 'held', canSell: true })).toBe('voices');
    expect(cloudPaneView({ status: 'active', identity: 'unknown', canSell: false })).toBe('voices');
  });

  it('sells the plans where the voices would be to a reader without one', () => {
    expect(cloudPaneView({ status: 'none', identity: 'held', canSell: true })).toBe('plans');
    // Nobody yet: the subscription is never asked for, so its status stays unknown.
    expect(cloudPaneView({ status: 'unknown', identity: 'none', canSell: true })).toBe('plans');
  });

  it('waits rather than showing prices to somebody who may be paying', () => {
    expect(cloudPaneView({ status: 'unknown', identity: 'unknown', canSell: true })).toBe('checking');
    expect(cloudPaneView({ status: 'unknown', identity: 'held', canSell: true })).toBe('checking');
    expect(cloudPaneView({ status: 'unreachable', identity: 'held', canSell: true })).toBe('unreachable');
  });

  it('shows the voices of a plan being sampled, and never over the wait', () => {
    expect(cloudPaneView({ status: 'none', identity: 'held', canSell: true, sampling: true })).toBe('voices');
    expect(cloudPaneView({ status: 'unknown', identity: 'none', canSell: true, sampling: true })).toBe('voices');
    expect(cloudPaneView({ status: 'unknown', identity: 'held', canSell: true, sampling: true })).toBe('checking');
    expect(cloudPaneView({ status: 'unreachable', identity: 'held', canSell: true, sampling: true })).toBe('unreachable');
  });

  it('has no plans to show in a build that cannot sell them', () => {
    expect(cloudPaneView({ status: 'none', identity: 'held', canSell: false })).toBe('voices');
  });
});

describe('remembering a voice per voice box', () => {
  const makers = [...new Set(VIEWS.map((model) => model.maker))];
  const [first, second] = makers;
  const modelOf = (maker: string | undefined) => VIEWS.find((model) => model.maker === maker)!;
  const otherVoice = (model: VoiceModelView) => model.voices.find((voice) => voice !== model.defaultVoice) ?? model.defaultVoice;

  it('keeps one pick a version, newest first', () => {
    const a = modelOf(first);
    const picks = rememberCloudPick(rememberCloudPick([], `cloud:${a.id}:${a.defaultVoice}`), `cloud:${a.id}:${otherVoice(a)}`);
    expect(picks).toEqual([`cloud:${a.id}:${otherVoice(a)}`]);
    expect(rememberedVoice(picks, a)).toBe(otherVoice(a));
  });

  it('comes back to the voice chosen in a box after visiting another', () => {
    const a = modelOf(first);
    const b = modelOf(second);
    let picks = rememberCloudPick([], `cloud:${a.id}:${otherVoice(a)}`);
    picks = rememberCloudPick(picks, `cloud:${b.id}:${otherVoice(b)}`);
    expect(landingForMaker(VIEWS, a.maker, null, picks)).toEqual({ model: a, voice: otherVoice(a) });
    expect(landingForMaker(VIEWS, b.maker, null, picks)).toEqual({ model: b, voice: otherVoice(b) });
  });

  it('falls to the box default when nothing was chosen there, or the choice is gone', () => {
    const a = modelOf(first);
    expect(landingForMaker(VIEWS, a.maker, null, [])).toEqual({ model: modelForMaker(VIEWS, a.maker, null), voice: modelForMaker(VIEWS, a.maker, null)!.defaultVoice });
    expect(landingForMaker(VIEWS, a.maker, null, [`cloud:${a.id}:NoSuchVoice`])?.voice).toBe(modelForMaker(VIEWS, a.maker, null)!.defaultVoice);
  });

  it('moves between versions keeping what each remembers, or the shared voice', () => {
    const a = modelOf(first);
    expect(landingForModel(a, otherVoice(a), [])).toBe(otherVoice(a));
    expect(landingForModel(a, 'NotHere', [])).toBe(a.defaultVoice);
    expect(landingForModel(a, 'NotHere', [`cloud:${a.id}:${otherVoice(a)}`])).toBe(otherVoice(a));
  });
});
