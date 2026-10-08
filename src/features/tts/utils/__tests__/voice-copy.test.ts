import { describe, expect, it } from 'vitest';

import {
  LITE_SPEED_FIXED,
  CLOUD_PLANS_ELSEWHERE,
  CLOUD_PLANS_LINE,
  CLOUD_PRIVACY,
  CLOUD_SAMPLES_FREE,
  CLOUD_SPEED_FIXED,
  CLOUD_VOICES_SOON,
  CLOUD_WITH_A_PLAN,
  ENHANCED_UNSUPPORTED,
  ON_DEVICE_KINDS,
  onDeviceHint,
  onDeviceKindName,
  voiceKindName,
} from '../voice-copy';

describe('the on-device kinds', () => {
  it('climbs from Lite to Enhanced', () => {
    expect(ON_DEVICE_KINDS.map((kind) => kind.mode)).toEqual(['native', 'ai']);
  });

  it('names each by what it asks of the phone', () => {
    expect(onDeviceKindName('native')).toBe('Lite');
    expect(onDeviceKindName('ai')).toBe('Enhanced');
  });

  it('climbs on to Cloud', () => {
    expect(voiceKindName('cloud')).toBe('Cloud');
    expect(voiceKindName('native')).toBe('Lite');
  });
});

describe('onDeviceHint', () => {
  it('says what each kind is like', () => {
    expect(onDeviceHint('native')).toBe('Lightweight. Works on most phones.');
    expect(onDeviceHint('ai')).toBe('Sounds more human.');
  });
});

describe('the copy', () => {
  it('never uses an em dash', () => {
    const lines = [
      LITE_SPEED_FIXED,
      CLOUD_VOICES_SOON,
      CLOUD_WITH_A_PLAN,
      CLOUD_PLANS_LINE,
      CLOUD_PLANS_ELSEWHERE,
      CLOUD_PRIVACY,
      CLOUD_SPEED_FIXED,
      CLOUD_SAMPLES_FREE,
      ENHANCED_UNSUPPORTED,
      onDeviceHint('native'),
      onDeviceHint('ai'),
    ];
    for (const line of lines) expect(line).not.toMatch(/—/);
  });
});
