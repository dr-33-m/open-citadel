/**
 * Taking a book back up: after a restart, paused in the mini player; or in a
 * fresh JS runtime while the native player carried on playing it (Android
 * starts one for a background event after the app was swiped away), from the
 * native queue's own extras.
 */
import TrackPlayer from '@rntp/player';

import { cloudChoiceFor } from '@/features/tts/utils/cloud-voices';
import { bookRow, infoOf, newSession, nowPlayingOf, publish, startSentence } from '@/services/audiobook/lifecycle';
import { isBookItem, parseBookMediaId } from '@/services/audiobook/media-id';
import { produce } from '@/services/audiobook/producer';
import type { BookItemExtras } from '@/services/audiobook/queue';
import { loadScript } from '@/services/audiobook/script';
import { book, current, type BookSession, type QueuedSentence } from '@/services/audiobook/session';
import { readCurrent, writeCurrent } from '@/services/audiobook/settings';
import { applyCommands } from '@/services/player/commands';
import { readyPlayer } from '@/services/player/events';
import { store } from '@/services/player/session';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';

/**
 * The book the native player is still playing after the JS was reloaded
 * (Android, where the player is set up at launch and can be asked). On iOS
 * it is set up on first play, and asking an unset player is not safe.
 */
function stillPlaying(): string | null {
  if (process.env.EXPO_OS !== 'android') return null;
  try {
    const mediaId = TrackPlayer.getActiveMediaItem()?.mediaId;
    return isBookItem(mediaId) ? (mediaId as string) : null;
  } catch {
    return null;
  }
}

/**
 * Puts the last book back in the mini player after a restart, paused and not
 * loaded: pressing play starts it from the sentence it was left at. If the
 * native player is in fact still playing it, takes it back up as it is.
 */
export async function restoreBook(): Promise<void> {
  if (store().current) return;
  const playing = stillPlaying();
  if (playing && readyPlayer()) {
    applyCommands('book');
    if (await adopt(playing)) return;
  }
  const remembered = readCurrent();
  const row = remembered ? bookRow(remembered.bookId) : null;
  if (!remembered || !row) {
    if (remembered) writeCurrent(null);
    return;
  }
  await showPaused(remembered.bookId, () => !store().current);
}

/**
 * The book read on in the reader (its read-aloud) while it waited in the mini
 * player: the mini player and the player show where it got to, which is where
 * play goes on from (`startSentence`).
 */
export async function catchUpBook(bookId: string): Promise<void> {
  const waiting = () => selectBook(store())?.bookId === bookId && !store().loaded;
  if (waiting()) await showPaused(bookId, waiting);
}

/** The book in the mini player, paused and not loaded, at the sentence play would start from. */
async function showPaused(bookId: string, stillWanted: () => boolean): Promise<void> {
  const row = bookRow(bookId);
  const script = row ? await loadScript(row) : null;
  const sentence = script ? await startSentence(script, bookId, null) : null;
  if (!row || !script || !sentence) return;
  const s = await newSession(infoOf(row), script, '', { modelId: '', voice: '', speed: null, maxCharacters: 0, format: 'mp3' });
  s.pending = { sentence, offsetSec: 0 };
  const now = nowPlayingOf(s);
  s.source.dispose();
  if (!stillWanted()) return;
  store().patch({ current: now, loaded: false, speed: useSettingsStore.getState().ttsRate });
  // The text sheet opens on it, and a tap there starts the book from where it is tapped.
  useAudiobook.getState().patch({ sentenceId: sentence.id });
}

/**
 * Takes up a book the native player is playing that this runtime is not
 * holding: on Android a background event can start the JS runtime fresh while
 * audio carried on. The queue is read back from the items' own extras, so the
 * book keeps being made ahead and its place kept.
 */
export async function adopt(mediaId: string): Promise<BookSession | null> {
  const parsed = parseBookMediaId(mediaId);
  if (!parsed) return null;
  const s0 = current();
  if (s0?.info.id === parsed.bookId) return s0;
  const row = bookRow(parsed.bookId);
  const script = row ? await loadScript(row) : null;
  if (!row || !script) return null;
  const items = TrackPlayer.getQueue();
  const extras = items.map((item) => item.extras as unknown as BookItemExtras | undefined);
  const voiceKey = extras.find((x) => x?.voiceKey)?.voiceKey;
  const choice = voiceKey ? cloudChoiceFor(voiceKey, null, 1, 'mp3') : null;
  if (!voiceKey || !choice) return null;
  const s = await newSession(infoOf(row), script, voiceKey, choice);
  const queue: QueuedSentence[] = [];
  for (let i = 0; i < items.length; i++) {
    const x = extras[i];
    if (!x || x.bookId !== parsed.bookId) continue;
    const section = Number.parseInt(x.sentenceId, 10);
    const sentence = (await script.load(section))?.sentences.find((y) => y.id === x.sentenceId);
    if (sentence) queue.push({ sentence, key: x.key, track: { uri: String(items[i].url), mimeType: items[i].mimeType ?? 'audio/mpeg', seconds: x.seconds } });
  }
  s.queue = queue;
  s.playing = Math.max(0, queue.findIndex((q) => q.sentence.id === parsed.sentenceId));
  s.wantsToPlay = TrackPlayer.isPlaying();
  if (current()) return current();
  book.session = s;
  store().patch({ loaded: true, isPlaying: TrackPlayer.isPlaying(), speed: TrackPlayer.getPlaybackSpeed() });
  publish(s);
  void produce(s);
  return s;
}
