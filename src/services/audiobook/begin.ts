/**
 * Starting a book: shown in the player at once, then read, laid out and made
 * ready to sound.
 */
import TrackPlayer from '@rntp/player';

import { bookRow, currentBookVoice, infoOf, letGoOfBook, newSession, publish, stopBook, type BookRow } from '@/services/audiobook/lifecycle';
import { produce } from '@/services/audiobook/producer';
import { loadScript } from '@/services/audiobook/script';
import { book } from '@/services/audiobook/session';
import { writeCurrent, writeHeardVoice } from '@/services/audiobook/settings';
import { rememberedClock, startSentence, type StartFrom } from '@/services/audiobook/start';
import { applyCommands } from '@/services/player/commands';
import { readyPlayer } from '@/services/player/events';
import { markStarting, store, takePlayerFor } from '@/services/player/session';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';

/** The ways starting can end without sound. */
export type StartResult = 'playing' | 'no-voice' | 'unreadable' | 'unavailable';

/**
 * The book in the player, with its loader, before anything is read or made.
 * Its clock is the one already showing (the same book, paused in the mini
 * player), or the one it last showed while that still says where it starts
 * (`rememberedClock`), or none yet: never zero, then the real one.
 */
function present(row: BookRow, voiceKey: string): void {
  const info = infoOf(row);
  const shown = selectBook(store())?.bookId === info.id ? selectBook(store()) : rememberedClock(info.id, voiceKey);
  store().patch({
    current: {
      kind: 'book',
      bookId: info.id,
      title: info.title,
      author: info.author,
      coverUrl: info.coverUrl,
      chapterTitle: shown?.chapterTitle ?? null,
      durationSec: shown?.durationSec ?? 0,
      positionSec: shown?.positionSec ?? 0,
    },
    loaded: true,
    error: null,
    sleep: null,
    speed: useSettingsStore.getState().ttsRate,
  });
  useAudiobook.getState().patch({ preparing: true, failure: null, highlighted: {} });
}

/**
 * Puts the book in the player now, synchronously, so a screen can open the
 * player in the same moment and it rises with the book drawn in it, rather
 * than the mini player arriving first and the player after. False when the
 * book cannot start (no book, no voice, no player), or when an episode is in
 * the player: it must step aside first, so the book is shown by `startBook`.
 */
export function showBook(bookId: string): boolean {
  const row = bookRow(bookId);
  const voice = currentBookVoice();
  if (!row || !voice || !readyPlayer() || store().current?.kind === 'episode') return false;
  markStarting();
  present(row, voice.key);
  return true;
}

/**
 * Plays a book in the cloud voice from where it was left. The player opens
 * at once and shows its loader while the book is read into the index and the
 * first sentence is made.
 */
export async function startBook(bookId: string, options: StartFrom = {}): Promise<StartResult> {
  const row = bookRow(bookId);
  if (!row) return 'unreadable';
  const voice = currentBookVoice();
  if (!voice) return 'no-voice';
  if (!readyPlayer()) return 'unavailable';
  const wasLoaded = store().loaded;
  // Whatever was in the player saves its place and steps aside (an episode,
  // or this or another book), and stops sounding while this one is prepared.
  await takePlayerFor('book');
  await letGoOfBook();
  if (wasLoaded) TrackPlayer.pause();
  markStarting();
  present(row, voice.key);
  const script = await loadScript(row);
  useAudiobook.getState().patch({ preparing: false });
  if (!script) {
    await stopBook();
    return 'unreadable';
  }
  const first = await startSentence(script, bookId, options);
  if (!first) {
    await stopBook();
    return 'unreadable';
  }
  const s = await newSession(infoOf(row), script, voice.key, voice.choice);
  // Starting where its remembered clock was shown: laid out by the pace that
  // clock was, so the numbers the player opened on hold rather than step.
  const remembered = rememberedClock(bookId, voice.key);
  if (remembered?.sentenceId === first.id) s.clockPace = remembered.clockPace ?? null;
  s.pending = { sentence: first, offsetSec: 0 };
  s.wantsToPlay = true;
  book.session = s;
  writeHeardVoice(bookId, voice.key);
  writeCurrent({ bookId, sentenceId: first.id });
  applyCommands('book');
  publish(s);
  void produce(s);
  return 'playing';
}

/**
 * Starts the book from the player's controls. Without a plan that reaches a
 * cloud voice (one that lapsed since the book was last heard), the plans rise
 * instead, so the press is never answered by nothing.
 */
export async function beginBook(bookId: string, options: StartFrom = {}): Promise<void> {
  const result = await startBook(bookId, options);
  if (result === 'no-voice') useAudiobook.getState().patch({ plansAsked: useAudiobook.getState().plansAsked + 1 });
}
