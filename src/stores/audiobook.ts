import { create } from 'zustand';

import type { CloudVoiceFailure } from '@/services/cloud-tts/request';

/**
 * What the screens show of a book being heard, beyond what every kind of
 * thing in the player shares (`stores/player`): the sentence being spoken,
 * for the follow-along sheet to light and Highlight to know; the sentences
 * highlighted while listening, so a second press can be undone; and a
 * failure the voice is holding the book on.
 *
 * Changes a sentence at a time (every few seconds), so it is subscribed to
 * narrowly, by what each surface draws.
 */
type AudiobookState = {
  /** The sentence playing, as `<section>:<paragraph>:<i>`, or null. */
  sentenceId: string | null;
  /** Sentences highlighted from the player, by sentence id: the highlight's id, so it can be taken back. */
  highlighted: Record<string, string>;
  /** Why the voice stopped making the book, until it is tried again. */
  failure: CloudVoiceFailure | null;
  /** The book is being read into the text index before it can be heard. */
  preparing: boolean;
  /** Bumped when the book's timeline changes shape (a section cut, lengths measured), for the chapter list to read again. */
  timelineVersion: number;
  patch: (next: Partial<Omit<AudiobookState, 'patch'>>) => void;
};

export const useAudiobook = create<AudiobookState>((set) => ({
  sentenceId: null,
  highlighted: {},
  failure: null,
  preparing: false,
  timelineVersion: 0,
  patch: (next) => set(next),
}));

/** Whether the sentence playing has been highlighted from the player. */
export const selectSentenceHighlighted = (s: AudiobookState) => (s.sentenceId ? s.sentenceId in s.highlighted : false);
