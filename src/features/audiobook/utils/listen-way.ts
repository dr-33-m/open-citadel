/**
 * How Listen reads a book, and what it says when it cannot.
 *
 * Listen in the Library and Listen inside the book both start the audiobook:
 * the player, a cloud voice, the reader following along. The audiobook only
 * has cloud voices, so inside the book a reader whose voice is on the phone
 * (its own, or Enhanced), or who has no cloud voice to hear it in, keeps the
 * reader's own read-aloud rather than being sold a plan to hear a page.
 *
 * Pure, so it can be tested on its own.
 */
import type { StartResult } from '@/services/audiobook';

export type ListenWay = 'audiobook' | 'read-aloud';

/** Inside the book: the audiobook when the chosen voice is a cloud one it can play, else read-aloud. */
export function listenWay({ cloudVoiceChosen, bookVoiceReady }: { cloudVoiceChosen: boolean; bookVoiceReady: boolean }): ListenWay {
  return cloudVoiceChosen && bookVoiceReady ? 'audiobook' : 'read-aloud';
}

/** Why a book or post could not be started, for a toast. */
export function whyNotListening(result: Exclude<StartResult, 'playing'>, post: boolean): string {
  if (result === 'unavailable') return 'Audio is not available on this phone.';
  if (result === 'barred') return 'Its publisher asks that its posts are not read in a cloud voice.';
  return `This ${post ? 'post' : 'book'} can't be read aloud yet.`;
}
