/**
 * Making the book ahead of the voice: a sentence at a time, about two minutes
 * ahead and never more than three (`produce-ahead`), each one paid for as it
 * is made, from the same Neurons as Samwell, exactly as read-aloud pays.
 *
 * Two fetches run at once, the server's own limit: the sentence needed next,
 * and the one after it fetched quietly behind. Sentences join the native
 * queue in order as they land. A jump or a new voice raises the session's
 * generation, and anything still being made for the old one is dropped when
 * it lands.
 */
import { learnPace } from '@/features/audiobook/utils/book-clock';
import { shouldMakeMore } from '@/features/audiobook/utils/produce-ahead';
import type { Sentence } from '@/features/audiobook/utils/sentences-of';
import { appendToQueue, loadQueue } from '@/services/audiobook/queue';
import { aheadSeconds, current, placeSentence, type BookSession, type QueuedSentence } from '@/services/audiobook/session';
import { writePace } from '@/services/audiobook/settings';
import { trackFile } from '@/services/audiobook/track-file';
import { CloudVoiceError, type CloudVoiceFailure } from '@/services/cloud-tts/request';
import { store } from '@/services/player/session';
import { useAudiobook } from '@/stores/audiobook';

type Hooks = {
  /** The voice could not make the next sentence. */
  onFailure: (s: BookSession, failure: CloudVoiceFailure) => void;
  /** A sentence joined the queue: the player may have been waiting for it. */
  onLanded: (s: BookSession, entry: QueuedSentence, first: boolean) => void;
};

let hooks: Hooks | null = null;

/** Set once by the lifecycle, which knows what to do when a sentence lands or cannot be made. */
export function setProducerHooks(next: Hooks): void {
  hooks = next;
}

/** The sentence after this one in the book, cutting the next section when it is reached. Null at the end. */
export async function sentenceAfter(s: BookSession, sentence: Sentence): Promise<Sentence | null> {
  const script = await s.script.load(sentence.section);
  const at = script?.sentences.findIndex((x) => x.id === sentence.id) ?? -1;
  const next = at >= 0 ? script?.sentences[at + 1] : undefined;
  if (next) return next;
  let section = s.script.nextSection(sentence.section);
  while (section) {
    const first = (await s.script.load(section.index))?.sentences[0];
    if (first) return first;
    section = s.script.nextSection(section.index);
  }
  return null;
}

/** The next sentence to make: the one a jump is waiting on, or the one after the last queued. */
async function nextToMake(s: BookSession): Promise<Sentence | null> {
  if (s.pending) return s.pending.sentence;
  const last = s.queue[s.queue.length - 1]?.sentence ?? placeSentence(s);
  return last ? sentenceAfter(s, last) : null;
}

/** A sentence made and measured, ready to queue. */
async function make(s: BookSession, sentence: Sentence): Promise<QueuedSentence> {
  const key = await s.source.whole(sentence.text, s.choice);
  const track = await trackFile(key);
  if (!track) throw new CloudVoiceError('maker_failed', 'The made sentence left the cache before it could be queued.');
  if (track.seconds > 0) {
    const measured = { sec: track.seconds, chars: sentence.text.length };
    s.lengths.record(sentence.id, measured);
    s.pace = learnPace(s.pace, measured);
    writePace(s.choice.modelId, s.choice.voice, s.pace);
  }
  return { sentence, key, track };
}

/** Keeps the book made ahead of the voice. Safe to call at any time: a second call while making is a no-op. */
export async function produce(s: BookSession): Promise<void> {
  if (s.making || s.madeToEnd) return;
  s.making = true;
  const generation = s.generation;
  const stale = () => current() !== s || s.generation !== generation;
  let filling = false;
  try {
    for (;;) {
      if (stale()) return;
      if (!s.pending && !shouldMakeMore({ aheadSec: aheadSeconds(s), rate: store().speed, making: filling })) return;
      filling = true;
      const sentence = await nextToMake(s);
      if (stale()) return;
      if (!sentence) {
        s.madeToEnd = true;
        return;
      }
      // The one after, fetched quietly behind this one: the second of the two at once.
      void sentenceAfter(s, sentence).then((after) => {
        if (after && !stale()) void s.source.prefetch(after.text, s.choice);
      });
      const entry = await make(s, sentence);
      if (stale()) return;
      useAudiobook.getState().patch({ failure: null, timelineVersion: useAudiobook.getState().timelineVersion + 1 });
      const pending = s.pending;
      if (pending) {
        s.pending = null;
        loadQueue(s, entry, pending.offsetSec);
      } else {
        appendToQueue(s, entry);
      }
      hooks?.onLanded(s, entry, pending !== null);
    }
  } catch (error) {
    if (stale()) return;
    const failure = error instanceof CloudVoiceError ? error.failure : 'maker_failed';
    hooks?.onFailure(s, failure);
  } finally {
    if (current() === s && s.generation === generation) s.making = false;
  }
}

