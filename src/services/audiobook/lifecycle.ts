/**
 * A book's session, stopping it, and stepping aside for something else.
 * Starting it is `begin.ts`; taking it back up is `resume.ts`.
 */
import TrackPlayer from '@rntp/player';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { books } from '@/db/schema';
import { bookVoice } from '@/features/audiobook/utils/book-voice';
import { cloudChoiceFor } from '@/features/tts/utils/cloud-voices';
import { queryClient } from '@/lib/query-client';
import { billingKeys } from '@/query-manager/billing/keys';
import { SentenceLengths } from '@/services/audiobook/lengths';
import { saveBookPlace } from '@/services/audiobook/position';
import { unpinQueue } from '@/services/audiobook/queue';
import type { BookScript } from '@/services/audiobook/script';
import { nowPlayingOf } from '@/services/audiobook/now-playing';
import { book, current, placeSentence, type BookInfo, type BookSession } from '@/services/audiobook/session';
import { readPace, writeCurrent } from '@/services/audiobook/settings';
import { clearWavCopies } from '@/services/audiobook/track-file';
import type { PlanPreview } from '@/services/billing-plans';
import { PieceSource } from '@/services/cloud-tts/piece-source';
import { clearWaits, onTakenOver, store } from '@/services/player/session';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

export type BookRow = typeof books.$inferSelect;

export function bookRow(bookId: string): BookRow | null {
  return db.select().from(books).where(eq(books.id, bookId)).get() ?? null;
}

export function infoOf(row: BookRow): BookInfo {
  return { id: row.id, title: row.title, author: row.author || null, coverUrl: row.coverUrl, post: row.kind === 'article' };
}

/** A book or post as Listen shows it, or null when it is not on the phone. */
export function listenItem(bookId: string): BookInfo | null {
  const row = bookRow(bookId);
  return row ? infoOf(row) : null;
}

/** The voice books are heard in now, and what to ask the server for: always MP3, always 1×. */
export function currentBookVoice() {
  const figures = queryClient.getQueryData<PlanPreview>(billingKeys.planPreview())?.voices;
  const plan = useSubscriptionStore.getState().status === 'active' ? useSubscriptionStore.getState().plan : null;
  const voice = bookVoice(useSettingsStore.getState().ttsCloudVoice, figures, plan);
  const choice = voice ? cloudChoiceFor(voice.key, figures?.models, 1, 'mp3') : null;
  return voice && choice ? { ...voice, choice } : null;
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

/** Puts the book down: the place saved, every fetch stopped, the cache free to trim it. */
export async function letGoOfBook(): Promise<void> {
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
