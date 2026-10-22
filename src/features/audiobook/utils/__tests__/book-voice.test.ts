import { describe, expect, it } from 'vitest';
import type { VoiceFigures, VoiceModelView } from 'samwell-shared';

import { bookVoice } from '@/features/audiobook/utils/book-voice';

const model = (id: string, minPlan: VoiceModelView['minPlan'], voices: string[]): VoiceModelView => ({
  id,
  label: id,
  maker: id,
  description: '',
  minPlan,
  speedSupported: false,
  maxCharacters: 1500,
  voices,
  defaultVoice: voices[0],
  chapterCredits: 10,
  hours: 10,
  hoursByPlan: {},
});

const figures: VoiceFigures = {
  defaultModelId: 'kokoro',
  models: [model('kokoro', 'maester', ['af_heart', 'am_adam']), model('eleven', 'archmaester', ['rachel'])],
  byPlan: {} as VoiceFigures['byPlan'],
};

describe('bookVoice', () => {
  it('keeps the reader’s last cloud voice when the plan reaches it', () => {
    expect(bookVoice('cloud:kokoro:am_adam', figures, 'maester')?.key).toBe('cloud:kokoro:am_adam');
  });

  it('falls to the plan’s default when none was chosen, or the plan no longer reaches it', () => {
    expect(bookVoice(null, figures, 'maester')?.key).toBe('cloud:kokoro:af_heart');
    expect(bookVoice('cloud:eleven:rachel', figures, 'maester')?.key).toBe('cloud:kokoro:af_heart');
  });

  it('has no voice without a plan', () => {
    expect(bookVoice('cloud:kokoro:am_adam', figures, null)).toBeNull();
  });

  it('trusts the stored voice when the catalogue is not to hand', () => {
    expect(bookVoice('cloud:kokoro:am_adam', null, null)).toEqual({ key: 'cloud:kokoro:am_adam', model: null });
    expect(bookVoice(null, null, 'maester')).toBeNull();
  });
});
