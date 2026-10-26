/** What the player draws for a book, read from its session. */
import { chapterTitle } from '@/features/audiobook/utils/chapter-title';
import { bookSecondsAt, placeSentence, timelineOf, type BookSession } from '@/services/audiobook/session';
import type { BookNowPlaying } from '@/stores/player';

/** What the mini player and the player draw for the book, from the session as it is now. */
export function nowPlayingOf(s: BookSession): BookNowPlaying {
  const sentence = placeSentence(s);
  const section = sentence ? s.script.section(sentence.section) : null;
  return {
    kind: 'book',
    bookId: s.info.id,
    title: s.info.title,
    author: s.info.author,
    coverUrl: s.info.coverUrl,
    post: s.info.post,
    chapterTitle: chapterTitle(section?.title, s.info.title),
    durationSec: timelineOf(s).total,
    positionSec: sentence ? bookSecondsAt(s, sentence, 0) : 0,
  };
}
