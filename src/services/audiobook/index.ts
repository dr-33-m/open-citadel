/**
 * Listening to a book in a cloud voice, through the player podcasts use.
 *
 * The public surface. The work is split by concern: `script` (the book's
 * sentences from the text index), `producer` (made about two minutes ahead
 * of the voice), `queue` (the native queue, a sentence an item), `position`
 * (the book's saved place), `highlight-now`, `lifecycle` (start, stop, step
 * aside, take back up), `controls`, `moves` and `events`.
 */
import '@/services/audiobook/events';

export {
  bookChapters,
  bookClockNow,
  followBookVoice,
  retryBook,
  setBookSpeed,
  sleepAtChapterEnd,
  toggleBook,
  type BookChapter,
} from '@/services/audiobook/controls';
export {
  bookPositionNow,
  playFromLocator,
  playFromSentence,
  seekBook,
  skipBook,
  skipSentence,
} from '@/services/audiobook/moves';
export { highlightNow, highlightSentence, toggleHighlightNow, undoHighlight, type HighlightResult } from '@/services/audiobook/highlight-now';
export { showBook, startBook, type StartResult } from '@/services/audiobook/begin';
export { currentBookVoice, releaseBookForSpeech, stopBook } from '@/services/audiobook/lifecycle';
export { restoreBook } from '@/services/audiobook/resume';
export { isBookItem } from '@/services/audiobook/media-id';
export { readAlongLocator, sentenceLocator, voiceDirectionFrom } from '@/services/audiobook/position';
export { current as currentBookSession, placeSentence, timelineOf } from '@/services/audiobook/session';
