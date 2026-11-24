import { describe, expect, it } from 'vitest';

import { listenWay, whyNotListening } from '@/features/audiobook/utils/listen-way';

describe('listenWay', () => {
  it('starts the audiobook when it has a cloud voice, a cloud voice picked or none at all', () => {
    expect(listenWay({ phoneVoiceChosen: false, bookVoiceReady: true })).toBe('audiobook');
  });

  it('keeps read-aloud for a voice picked on the phone, plan or not', () => {
    expect(listenWay({ phoneVoiceChosen: true, bookVoiceReady: true })).toBe('read-aloud');
    expect(listenWay({ phoneVoiceChosen: true, bookVoiceReady: false })).toBe('read-aloud');
  });

  it('keeps read-aloud when the audiobook has no cloud voice to play (no plan reaching it)', () => {
    expect(listenWay({ phoneVoiceChosen: false, bookVoiceReady: false })).toBe('read-aloud');
  });
});

describe('whyNotListening', () => {
  it('says what stopped it, a book or a post', () => {
    expect(whyNotListening('unavailable', false)).toBe('Audio is not available on this phone.');
    expect(whyNotListening('barred', true)).toBe('Its publisher asks that its posts are not read in a cloud voice.');
    expect(whyNotListening('unreadable', false)).toBe("This book can't be read aloud yet.");
    expect(whyNotListening('no-voice', true)).toBe("This post can't be read aloud yet.");
  });
});
