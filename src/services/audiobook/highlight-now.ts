/**
 * Highlight: the sentence being heard, saved as an ordinary highlight, from
 * the player, the mini player or the notification.
 *
 * The sentence is the item playing; a tap in its first second was meant for
 * the one that just ended. Its locator is built from the index with the words
 * either side, so the reader draws it over the right words, and it is saved
 * through the reader's own `addHighlight`: the default colour, the context
 * capture and the Timeline day all come from there, so it is edited, tagged
 * and noted later like any other.
 */
import TrackPlayer from '@rntp/player';

import { highlightTarget, type LocatorSection } from '@/features/audiobook/utils/sentence-locator';
import type { ScriptParagraph, Sentence } from '@/features/audiobook/utils/sentences-of';
import { queryClient } from '@/lib/query-client';
import { audiobookKeys } from '@/query-manager/audiobook/keys';
import { sentenceLocator } from '@/services/audiobook/position';
import { current, playingEntry, type BookSession } from '@/services/audiobook/session';
import type { ChapterText } from '@/services/audiobook/text';
import { useAudiobook } from '@/stores/audiobook';
import { useReaderStore } from '@/stores/reader';

export type HighlightResult =
  /** Saved now. */
  | { kind: 'saved'; highlightId: string; sentenceId: string }
  /** Already highlighted from the player: nothing new was saved. */
  | { kind: 'already'; highlightId: string; sentenceId: string }
  | { kind: 'none' };

/** The sentence a Highlight press means: the one playing, or the one just ended for a press in its first second. */
function targetOf(s: BookSession): Sentence | null {
  const entry = playingEntry(s);
  if (!entry) return null;
  const index = highlightTarget(s.playing, TrackPlayer.getProgress().position);
  return s.queue[index]?.sentence ?? entry.sentence;
}

/** The book's highlights changed: the follow-along sheet marks its sentences again. */
function rereadHighlights(): void {
  void queryClient.invalidateQueries({ queryKey: [...audiobookKeys.all, 'highlights'] });
}

/** A section as a highlight's locator is made from: where it is in the book, and its text. */
type HighlightPlace = { section: LocatorSection; paragraphs: readonly ScriptParagraph[] };

/** Highlight the sentence being heard. */
export async function highlightNow(): Promise<HighlightResult> {
  const s = current();
  const sentence = s ? targetOf(s) : null;
  const script = s && sentence ? await s.script.load(sentence.section) : null;
  if (!s || !sentence || !script) return { kind: 'none' };
  return highlightIn(s.info.id, { section: script.section, paragraphs: script.paragraphs }, sentence);
}

/**
 * Highlight one sentence of a chapter, by its id: a long press in the
 * follow-along sheet. From the chapter as the sheet read it, so it works on a
 * book waiting paused in the mini player as well as one playing.
 */
export async function highlightSentence(bookId: string, chapter: ChapterText, sentenceId: string): Promise<HighlightResult> {
  const sentence = chapter.sentences.find((x) => x.id === sentenceId);
  if (!sentence) return { kind: 'none' };
  const section = { href: chapter.href, title: chapter.title, chars: chapter.chars };
  return highlightIn(bookId, { section, paragraphs: chapter.paragraphs }, sentence);
}

async function highlightIn(bookId: string, place: HighlightPlace, sentence: Sentence): Promise<HighlightResult> {
  const known = useAudiobook.getState().highlighted[sentence.id];
  if (known) return { kind: 'already', highlightId: known, sentenceId: sentence.id };
  const locator = sentenceLocator(place.section, place.paragraphs, sentence);
  const highlightId = await useReaderStore.getState().addHighlight(sentence.text, locator as never, undefined, undefined, bookId);
  if (!highlightId) return { kind: 'none' };
  const { highlighted } = useAudiobook.getState();
  useAudiobook.getState().patch({ highlighted: { ...highlighted, [sentence.id]: highlightId } });
  rereadHighlights();
  return { kind: 'saved', highlightId, sentenceId: sentence.id };
}

/** Takes back a highlight saved from the player. */
export async function undoHighlight(sentenceId: string): Promise<void> {
  const { highlighted } = useAudiobook.getState();
  const id = highlighted[sentenceId];
  if (!id) return;
  const rest = { ...highlighted };
  delete rest[sentenceId];
  useAudiobook.getState().patch({ highlighted: rest });
  await useReaderStore.getState().deleteHighlight(id);
  rereadHighlights();
}

/** The notification's one button: highlight the sentence, or take its highlight back if it has one. */
export async function toggleHighlightNow(): Promise<void> {
  const result = await highlightNow();
  if (result.kind === 'already') await undoHighlight(result.sentenceId);
}
