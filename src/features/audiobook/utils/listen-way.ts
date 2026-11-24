/**
 * How Listen reads a book, and what it says when it cannot.
 *
 * Listen in the Library and Listen inside the book both start the audiobook:
 * the player, a cloud voice, the reader following along. The audiobook only
 * has cloud voices, so inside the book a reader who picked a voice on the
 * phone (its own, or Enhanced), or who has no cloud voice to hear it in, keeps
 * the reader's own read-aloud rather than being sold a plan to hear a page.
 * A reader who never picked a voice has not chosen the phone's: the audiobook
 * is what Listen means, as it is in the Library.
 *
 * Pure, so it can be tested on its own.
 */
import type { StartResult } from '@/services/audiobook';

export type ListenWay = 'audiobook' | 'read-aloud';

/**
 * Inside the book: the audiobook when it has a cloud voice to play and the
 * reader has not picked a voice on the phone, else read-aloud.
 */
export function listenWay({ phoneVoiceChosen, bookVoiceReady }: { phoneVoiceChosen: boolean; bookVoiceReady: boolean }): ListenWay {
  return bookVoiceReady && !phoneVoiceChosen ? 'audiobook' : 'read-aloud';
}

/** Why a book or post could not be started, for a toast. */
export function whyNotListening(result: Exclude<StartResult, 'playing'>, post: boolean): string {
  if (result === 'unavailable') return 'Audio is not available on this phone.';
  if (result === 'barred') return 'Its publisher asks that its posts are not read in a cloud voice.';
  return `This ${post ? 'post' : 'book'} can't be read aloud yet.`;
}
