/**
 * Listening to a book in a cloud voice, through the player podcasts use.
 *
 * The public surface. The work is split by concern: `script` (the book's
 * sentences from the text index), `producer` (made about two minutes ahead
 * of the voice), `queue` (the native queue, a sentence an item), `position`
 * (the book's saved place), `highlight-now`, `lifecycle` (start, stop, step
 * aside, take back up), `controls` and `events`.
 */
import '@/services/audiobook/events';

export {
  bookChapters,
  bookClockNow,
  bookPositionNow,
  followBookVoice,
  playFromSentence,
  retryBook,
  seekBook,
  setBookSpeed,
  skipBook,
  sleepAtChapterEnd,
  toggleBook,
  type BookChapter,
} from '@/services/audiobook/controls';
export { highlightNow, toggleHighlightNow, undoHighlight, type HighlightResult } from '@/services/audiobook/highlight-now';
export { currentBookVoice, releaseBookForSpeech, restoreBook, startBook, stopBook, type StartResult } from '@/services/audiobook/lifecycle';
export { isBookItem } from '@/services/audiobook/media-id';
export { readAlongLocator } from '@/services/audiobook/position';
export { current as currentBookSession, placeSentence, timelineOf } from '@/services/audiobook/session';
