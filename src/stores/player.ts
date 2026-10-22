import { create } from 'zustand';

import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import type { SeekHold } from '@/utils/seek-hold';

/** An episode in the player: what the mini player and the full player draw. Snapshotted when it loads. */
export type EpisodeNowPlaying = {
  kind: 'episode';
  episodeId: string;
  podcastId: string;
  title: string;
  showTitle: string;
  artworkUrl: string | null;
  durationSec: number;
  /**
   * Where it was when it last left the native player (or was restored after a
   * restart). What the bars show while it is not loaded; the live position
   * comes from the player itself.
   */
  positionSec: number;
};

/**
 * A book being heard in a cloud voice (`services/audiobook`). Its times are
 * the whole book's, in the audio's own seconds at 1×: the length is about,
 * firming up as sentences are made and measured.
 */
export type BookNowPlaying = {
  kind: 'book';
  bookId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  /** The section being heard, which is the book's chapter here. */
  chapterTitle: string | null;
  durationSec: number;
  /** Where it was when it last left the native player, or was restored. */
  positionSec: number;
};

/** What is in the one player: an episode or a book. */
export type NowPlaying = EpisodeNowPlaying | BookNowPlaying;

export type SleepTimer =
  | { kind: 'time'; endsAt: number; minutes: number }
  /** At the end of the episode, or of the chapter for a book. */
  | { kind: 'end' }
  | null;

/**
 * The player as the screens see it, whatever is in it.
 *
 * The playing position is deliberately not here. It changes every frame the
 * audio moves, and the two surfaces that draw it read it from the player
 * directly (`usePlaybackPosition`), so nothing else re-renders as it ticks.
 */
type PlayerState = {
  current: NowPlaying | null;
  /** The episode is in the native player. False for one restored after a restart until play is pressed. */
  loaded: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  /**
   * Play was pressed and the audio has not started yet (loading, seeking,
   * buffering). Set on the press, so the control answers the finger at once
   * instead of when the native player reports back.
   */
  starting: boolean;
  /**
   * A seek was sent and the player is not ready at the new place yet. Shows
   * the loader whether or not it is playing: a seek made while paused waits
   * too, and lands back on Play.
   */
  seeking: boolean;
  /**
   * The last seek, until the native player has caught up with it. Read by the
   * position polls, never rendered, so nothing subscribes to it.
   */
  seekHold: SeekHold;
  speed: number;
  sleep: SleepTimer;
  error: string | null;
  patch: (next: Partial<Omit<PlayerState, 'patch'>>) => void;
};

export const usePlayer = create<PlayerState>((set) => ({
  current: null,
  loaded: false,
  isPlaying: false,
  isBuffering: false,
  starting: false,
  seeking: false,
  seekHold: null,
  speed: 1,
  sleep: null,
  error: null,
  patch: (next) => set(next),
}));

/** Playing, or about to be: what a play control's icon and the artwork's size follow. */
export const selectPlaying = (s: PlayerState) => s.isPlaying || s.starting;
/** Waiting on the audio (starting, seeking, or buffering while playing): what shows a loader in the control. */
export const selectBusy = (s: PlayerState) => s.starting || s.seeking || (s.isBuffering && s.isPlaying);

/** The episode in the player, or null when it holds a book or nothing. */
export const selectEpisode = (s: PlayerState): EpisodeNowPlaying | null => (s.current?.kind === 'episode' ? s.current : null);
/** The book in the player, or null when it holds an episode or nothing. */
export const selectBook = (s: PlayerState): BookNowPlaying | null => (s.current?.kind === 'book' ? s.current : null);
/** The id of the episode in the player, or null. */
export const selectEpisodeId = (s: PlayerState): string | null => selectEpisode(s)?.episodeId ?? null;

/** Whether this episode is the one in the player, and whether it is sounding. */
export function useEpisodePlayback(episodeId: string): 'playing' | 'paused' | 'idle' {
  return usePlayer((s) => (selectEpisodeId(s) !== episodeId ? 'idle' : selectPlaying(s) ? 'playing' : 'paused'));
}

/** Whether this book is the one in the player, and whether it is sounding. */
export function useBookPlayback(bookId: string): 'playing' | 'paused' | 'idle' {
  return usePlayer((s) => (selectBook(s)?.bookId !== bookId ? 'idle' : selectPlaying(s) ? 'playing' : 'paused'));
}

/**
 * How long a wait has to last before a play control swaps its icon for a
 * loader. The press already flips the icon at once, so a start that takes a
 * blink shows nothing extra; only a real wait (a seek into unbuffered audio,
 * a slow connection) shows the loader.
 */
const LOADER_DELAY_MS = 300;

/** Whether the player's controls should show their loader: waiting, for longer than a blink. */
export function usePlayerLoader(): boolean {
  return useDelayedFlag(usePlayer(selectBusy), LOADER_DELAY_MS);
}

/** The same, for one episode's own play control: only while it is the one in the player. */
export function useEpisodeBuffering(episodeId: string): boolean {
  const busy = usePlayer((s) => selectBusy(s) && selectEpisodeId(s) === episodeId);
  return useDelayedFlag(busy, LOADER_DELAY_MS);
}
