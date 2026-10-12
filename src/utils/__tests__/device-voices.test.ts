import { describe, expect, it } from 'vitest';

import {
    deviceVoiceName,
    deviceVoiceRows,
    estimatedRowsHeight,
    isPlayableVoice,
    languageCode,
    sortVoices,
    type DeviceVoice,
} from '@/utils/device-voices';

const voice = (identifier: string, language: string, name = identifier): DeviceVoice => ({
  identifier,
  name,
  language,
  quality: 'DEFAULT',
});

const VOICES = [
  voice('fr-fr-x-a', 'fr-FR'),
  voice('en-us-x-b', 'en-US'),
  voice('en-gb-x-a', 'en-GB'),
  voice('zu-za-x-a', 'zu-ZA'),
  voice('en-us-x-a', 'en-US'),
];

const kinds = (rows: ReturnType<typeof deviceVoiceRows>) =>
  rows.map((row) => (row.kind === 'voice' ? row.voice.identifier || 'default' : row.title));

describe('languageCode', () => {
  it('is the language of a tag, however it is written', () => {
    expect(languageCode('en-ZA')).toBe('EN');
    expect(languageCode('en_US')).toBe('EN');
    expect(languageCode('zu')).toBe('ZU');
  });
});

describe('isPlayableVoice', () => {
  it("drops Google's per-language placeholders", () => {
    expect(isPlayableVoice({ identifier: 'en-AU-language' })).toBe(false);
    expect(isPlayableVoice({ identifier: 'en-au-x-aua-local' })).toBe(true);
  });
});

describe('sortVoices', () => {
  it('orders by locale then name, whatever order the phone gave', () => {
    expect(sortVoices(VOICES).map((v) => v.identifier)).toEqual([
      'en-gb-x-a',
      'en-us-x-a',
      'en-us-x-b',
      'fr-fr-x-a',
      'zu-za-x-a',
    ]);
  });

  it('leaves the list it was given alone', () => {
    const before = VOICES.map((v) => v.identifier);
    sortVoices(VOICES);
    expect(VOICES.map((v) => v.identifier)).toEqual(before);
  });
});

describe('deviceVoiceRows', () => {
  it('starts with the default, then lists only the English voices', () => {
    expect(kinds(deviceVoiceRows(sortVoices(VOICES)))).toEqual([
      'DEFAULT',
      'default',
      'ENGLISH',
      'en-gb-x-a',
      'en-us-x-a',
      'en-us-x-b',
    ]);
  });

  it('is only the default on a phone with no English voices', () => {
    expect(kinds(deviceVoiceRows([voice('fr-fr-x-a', 'fr-FR')]))).toEqual(['DEFAULT', 'default']);
  });

  it('gives every row its own key', () => {
    const keys = deviceVoiceRows(VOICES).map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('estimatedRowsHeight', () => {
  it('adds up a heading, a one-line voice and a two-line voice, scaled with the type size', () => {
    const rows = deviceVoiceRows([voice('en-au-x-a', 'en-AU')]);
    // DEFAULT, System default (one line), ENGLISH, one voice with its language under it.
    expect(kinds(rows)).toHaveLength(4);
    expect(estimatedRowsHeight(rows)).toBe(32 + 57 + 32 + 77);
    expect(estimatedRowsHeight(rows, 1.5)).toBe(297);
    expect(estimatedRowsHeight([])).toBe(0);
  });
});

describe('deviceVoiceName', () => {
  it('names the default, a known voice, and a saved voice the phone no longer lists', () => {
    expect(deviceVoiceName(VOICES, '')).toBe('System default');
    expect(deviceVoiceName([voice('id', 'en-US', 'Tessa')], 'id')).toBe('Tessa');
    expect(deviceVoiceName([], 'com.apple.voice.en-ZA.Tessa')).toBe('Tessa');
  });
});
