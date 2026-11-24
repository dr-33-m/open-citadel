import { describe, expect, it } from 'vitest';

import { listenWay, whyNotListening } from '@/features/audiobook/utils/listen-way';

describe('listenWay', () => {
  it('starts the audiobook for a cloud voice the audiobook can play', () => {
    expect(listenWay({ cloudVoiceChosen: true, bookVoiceReady: true })).toBe('audiobook');
  });

  it('keeps read-aloud for a voice on the phone, plan or not', () => {
    expect(listenWay({ cloudVoiceChosen: false, bookVoiceReady: true })).toBe('read-aloud');
    expect(listenWay({ cloudVoiceChosen: false, bookVoiceReady: false })).toBe('read-aloud');
  });

  it('keeps read-aloud for a cloud voice the audiobook cannot play yet (no plan reaching it)', () => {
    expect(listenWay({ cloudVoiceChosen: true, bookVoiceReady: false })).toBe('read-aloud');
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
