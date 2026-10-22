/**
 * Starting a book, stopping it, and stepping aside for something else. Taking
 * it back up is `resume.ts`.
 */
import TrackPlayer from '@rntp/player';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { books } from '@/db/schema';
import { bookVoice } from '@/features/audiobook/utils/book-voice';
import { chapterTitle } from '@/features/audiobook/utils/chapter-title';
import { startIndex, startPlace } from '@/features/audiobook/utils/start-place';
import { cloudChoiceFor } from '@/features/tts/utils/cloud-voices';
import { queryClient } from '@/lib/query-client';
import { billingKeys } from '@/query-manager/billing/keys';
import { SentenceLengths } from '@/services/audiobook/lengths';
import { savedLocator, saveBookPlace } from '@/services/audiobook/position';
import { produce } from '@/services/audiobook/producer';
import { unpinQueue } from '@/services/audiobook/queue';
import { loadScript, type BookScript } from '@/services/audiobook/script';
import {
  book,
  bookSecondsAt,
  current,
  placeSentence,
  timelineOf,
  type BookInfo,
  type BookSession,

} from '@/services/audiobook/session';
import { readCurrent, readPace, writeCurrent, writeHeardVoice } from '@/services/audiobook/settings';
import { clearWavCopies } from '@/services/audiobook/track-file';
import type { PlanPreview } from '@/services/billing-plans';
import { PieceSource } from '@/services/cloud-tts/piece-source';
import { applyCommands } from '@/services/player/commands';
import { readyPlayer } from '@/services/player/events';
import { clearWaits, markStarting, onTakenOver, store, takePlayerFor } from '@/services/player/session';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook, type BookNowPlaying } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

type BookRow = typeof books.$inferSelect;

export function bookRow(bookId: string): BookRow | null {
  return db.select().from(books).where(eq(books.id, bookId)).get() ?? null;
}

export function infoOf(row: BookRow): BookInfo {
  return { id: row.id, title: row.title, author: row.author || null, coverUrl: row.coverUrl };
}

/** The voice books are heard in now, and what to ask the server for: always MP3, always 1×. */
export function currentBookVoice() {
  const figures = queryClient.getQueryData<PlanPreview>(billingKeys.planPreview())?.voices;
  const plan = useSubscriptionStore.getState().status === 'active' ? useSubscriptionStore.getState().plan : null;
  const voice = bookVoice(useSettingsStore.getState().ttsCloudVoice, figures, plan);
  const choice = voice ? cloudChoiceFor(voice.key, figures?.models, 1, 'mp3') : null;
  return voice && choice ? { ...voice, choice } : null;
}

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
    chapterTitle: chapterTitle(section?.title, s.info.title),
    durationSec: timelineOf(s).total,
    positionSec: sentence ? bookSecondsAt(s, sentence, 0) : 0,
  };
}

/** Tells the screens what is playing now. */
export function publish(s: BookSession): void {
  store().patch({ current: nowPlayingOf(s) });
  useAudiobook.getState().patch({ sentenceId: placeSentence(s)?.id ?? null });
}

export async function newSession(info: BookInfo, script: BookScript, voiceKey: string, choice: BookSession['choice']): Promise<BookSession> {
  return {
    info,
    script,
    voiceKey,
    choice,
    source: new PieceSource(info.id),
    lengths: await SentenceLengths.load(info.id, choice.modelId, choice.voice),
    pace: readPace(choice.modelId, choice.voice),
    clockPace: null,
    queue: [],
    playing: -1,
    generation: 0,
    making: false,
    madeToEnd: false,
    waiting: false,
    wantsToPlay: false,
    pending: null,
    lastSavedAt: 0,
  };
}

/** Where to start: the sentence the book was last heard at, else its saved place, else its first chapter. */
async function startSentence(script: BookScript, bookId: string, fromSentenceId: string | null) {
  const remembered = fromSentenceId ?? (readCurrent()?.bookId === bookId ? (readCurrent()?.sentenceId ?? null) : null);
  if (remembered) {
    const section = Number.parseInt(remembered.split(':')[0] ?? '', 10);
    const hit = (await script.load(section))?.sentences.find((x) => x.id === remembered);
    if (hit) return hit;
  }
  const place = startPlace(script.listened, savedLocator(bookId));
  if (!place) return null;
  const at = await script.load(place.section);
  const index = at ? startIndex(at.sentences, place.offset) : -1;
  if (at && index >= 0) return at.sentences[index];
  const next = script.nextSection(place.section);
  return next ? ((await script.load(next.index))?.sentences[0] ?? null) : null;
}

/** The ways starting can end without sound. */
export type StartResult = 'playing' | 'no-voice' | 'unreadable' | 'unavailable';

/**
 * Plays a book in the cloud voice from where it was left. The player opens
 * at once and shows its loader while the book is read into the index and the
 * first sentence is made.
 */
export async function startBook(bookId: string, options: { fromSentenceId?: string | null } = {}): Promise<StartResult> {
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
  const info = infoOf(row);
  store().patch({
    current: { kind: 'book', bookId, title: info.title, author: info.author, coverUrl: info.coverUrl, chapterTitle: null, durationSec: 0, positionSec: 0 },
    loaded: true,
    error: null,
    sleep: null,
    speed: useSettingsStore.getState().ttsRate,
  });
  useAudiobook.getState().patch({ preparing: true, failure: null, highlighted: {} });
  const script = await loadScript(row);
  useAudiobook.getState().patch({ preparing: false });
  if (!script) {
    await stopBook();
    return 'unreadable';
  }
  const first = await startSentence(script, bookId, options.fromSentenceId ?? null);
  if (!first) {
    await stopBook();
    return 'unreadable';
  }
  const s = await newSession(info, script, voice.key, voice.choice);
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

/** Puts the book down: the place saved, every fetch stopped, the cache free to trim it. */
async function letGoOfBook(): Promise<void> {
  const s = current();
  if (!s) return;
  await saveBookPlace(s, true);
  s.generation += 1;
  s.making = false;
  s.lengths.flush();
  s.source.dispose();
  book.session = null;
  unpinQueue();
  clearWavCopies();
}

/** Stops the book; the mini player goes away. `keepPlayer` when something else loads straight after. */
export async function stopBook(options: { keepPlayer?: boolean } = {}): Promise<void> {
  await letGoOfBook();
  if (!options.keepPlayer && store().loaded && selectBook(store())) TrackPlayer.clear();
  clearWaits();
  writeCurrent(null);
  useAudiobook.getState().patch({ sentenceId: null, failure: null, preparing: false, highlighted: {} });
  if (selectBook(store())) store().patch({ current: null, loaded: false, isPlaying: false, isBuffering: false, sleep: null });
}

/**
 * Read-aloud is taking the player (the book was opened while it played, or
 * another book is being read aloud): the place is saved and the book stays in
 * the mini player, paused, to resume later.
 */
export async function releaseBookForSpeech(): Promise<void> {
  const s = current();
  if (!s || !store().loaded) return;
  const now = nowPlayingOf(s);
  TrackPlayer.pause();
  await letGoOfBook();
  clearWaits();
  store().patch({ current: now, loaded: false, isPlaying: false, isBuffering: false, sleep: null });
}

// An episode is taking the player: the book saves its place and steps out.
onTakenOver('book', async () => {
  await letGoOfBook();
  writeCurrent(null);
  useAudiobook.getState().patch({ sentenceId: null, failure: null });
});
