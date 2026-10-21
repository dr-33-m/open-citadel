/**
 * What the player's controls do, for whatever is in it. The screens call
 * these and never ask which kind is playing: an episode is one long item the
 * native player seeks in itself, a book is a queue of sentences only the
 * audiobook can seek across, and each does its own.
 */
import TrackPlayer from '@rntp/player';

import {
  releaseBookForSpeech,
  seekBook,
  setBookSpeed,
  skipBook,
  sleepAtChapterEnd,
  stopBook,
  toggleBook,
} from '@/services/audiobook';
import {
  releasePlayerForSpeech as releaseEpisodeForSpeech,
  seekEpisode,
  setEpisodeSpeed,
  skipEpisode,
  sleepAtEpisodeEnd,
  stopPlayback as stopEpisode,
  toggleEpisode,
} from '@/services/podcasts/player';
import { store } from '@/services/player/session';

const isBook = () => store().current?.kind === 'book';

export async function togglePlayback(): Promise<void> {
  if (isBook()) await toggleBook();
  else await toggleEpisode();
}

/** A place in what is playing, in its own seconds at 1× (a book's are the whole book's). */
export function seekTo(seconds: number): void {
  if (isBook()) void seekBook(seconds);
  else seekEpisode(seconds);
}

export function skipBy(seconds: number): void {
  if (isBook()) skipBook(seconds);
  else skipEpisode(seconds);
}

export async function setSpeed(speed: number): Promise<void> {
  if (isBook()) setBookSpeed(speed);
  else await setEpisodeSpeed(speed);
}

/** Pauses after a number of minutes (fading the last ten seconds out), at the end of the episode or chapter, or never. */
export function setSleepTimer(choice: number | 'end' | null): void {
  if (!store().loaded) return;
  if (choice === null) {
    TrackPlayer.cancelSleepTimer();
    store().patch({ sleep: null });
  } else if (choice === 'end') {
    if (isBook()) sleepAtChapterEnd();
    else sleepAtEpisodeEnd();
  } else {
    TrackPlayer.sleepAfterTime(choice * 60, { fadeOutSeconds: 10 });
    store().patch({ sleep: { kind: 'time', endsAt: Date.now() + choice * 60_000, minutes: choice } });
  }
}

/** Stops and empties the player; the mini player goes away. */
export async function stopPlayback(): Promise<void> {
  if (isBook()) await stopBook();
  else await stopEpisode();
}

/** Read-aloud is about to take the player: whatever is in it saves its place and steps aside, kept in the mini player. */
export function releasePlayerForSpeech(): void {
  if (isBook()) void releaseBookForSpeech();
  else releaseEpisodeForSpeech();
}
