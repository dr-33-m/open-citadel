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

import { highlightLocator, highlightTarget, sectionText } from '@/features/audiobook/utils/sentence-locator';
import { current, playingEntry, type BookSession } from '@/services/audiobook/session';
import { useAudiobook } from '@/stores/audiobook';
import { useReaderStore } from '@/stores/reader';

export type HighlightResult =
  /** Saved now. */
  | { kind: 'saved'; highlightId: string; sentenceId: string }
  /** Already highlighted from the player: nothing new was saved. */
  | { kind: 'already'; highlightId: string; sentenceId: string }
  | { kind: 'none' };

async function targetOf(s: BookSession) {
  const entry = playingEntry(s);
  if (!entry) return null;
  const index = highlightTarget(s.playing, TrackPlayer.getProgress().position);
  const sentence = s.queue[index]?.sentence ?? entry.sentence;
  const script = await s.script.load(sentence.section);
  return script ? { sentence, script } : null;
}

export async function highlightNow(): Promise<HighlightResult> {
  const s = current();
  if (!s) return { kind: 'none' };
  const target = await targetOf(s);
  if (!target) return { kind: 'none' };
  const { sentence, script } = target;
  const known = useAudiobook.getState().highlighted[sentence.id];
  if (known) return { kind: 'already', highlightId: known, sentenceId: sentence.id };
  const locator = highlightLocator(
    { href: script.section.href, title: script.section.title, chars: script.section.chars },
    sentence,
    sectionText(script.paragraphs),
  );
  const highlightId = await useReaderStore
    .getState()
    .addHighlight(sentence.text, locator as never, undefined, undefined, s.info.id);
  if (!highlightId) return { kind: 'none' };
  const { highlighted } = useAudiobook.getState();
  useAudiobook.getState().patch({ highlighted: { ...highlighted, [sentence.id]: highlightId } });
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
}

/** The notification's one button: highlight the sentence, or take its highlight back if it has one. */
export async function toggleHighlightNow(): Promise<void> {
  const result = await highlightNow();
  if (result.kind === 'already') await undoHighlight(result.sentenceId);
}
