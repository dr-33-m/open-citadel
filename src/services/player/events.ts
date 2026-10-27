/**
 * The one native player's events, heard once and handed on.
 *
 * What the controls show (playing, buffering, the sleep timer going off) is
 * the same whatever is playing, so it is answered here. Everything else is
 * the business of the kind of thing in the player: each kind adds a handler
 * (`addPlayerHandler`) that takes what is its own, by the item's `mediaId`,
 * and leaves the rest. Listened to in the foreground once per runtime, and
 * on Android from the background task too.
 */
import { Platform } from 'react-native';

import TrackPlayer, { Event, PlaybackState, type BackgroundEvent } from '@rntp/player';

import { ensureAudioPlayer, registerAudioBackgroundHandler } from '@/services/audio-session';
import { followSkipLengths } from '@/services/player/commands';
import { clearSeeking, clearStarting, store } from '@/services/player/session';

export type PlayerEventHandler = (event: BackgroundEvent) => Promise<void>;

/**
 * One handler a kind, kept by kind so that a module run again (a hot reload in
 * development) replaces its handler rather than adding a second: the stale
 * copy went on answering every event, and since each is awaited in turn it
 * held the live one back by seconds.
 */
const handlers = new Map<'episode' | 'book', PlayerEventHandler>();

/** A kind of thing that plays (episodes, books) hears every event after the shared state is updated. */
export function addPlayerHandler(kind: 'episode' | 'book', handler: PlayerEventHandler): void {
  handlers.set(kind, handler);
}

async function deliver(event: BackgroundEvent): Promise<void> {
  switch (event.type) {
    case Event.IsPlayingChanged:
      store().patch({ isPlaying: event.playing });
      if (event.playing) clearStarting();
      break;
    case Event.PlaybackStateChanged:
      store().patch({ isBuffering: event.state === PlaybackState.Buffering });
      if (event.state === PlaybackState.Error || event.state === PlaybackState.Ended || event.state === PlaybackState.Idle) {
        clearStarting();
      }
      break;
    case Event.PlaybackError:
      clearStarting();
      clearSeeking();
      break;
    default:
      break;
  }
  for (const handler of handlers.values()) await handler(event).catch(() => {});
}

/**
 * How long a pause nobody asked for is held back on iOS before it is taken as
 * a pause.
 *
 * iOS has no gapless queue: at the end of an item the player loads the next
 * one and plays it again. The vendored player is patched to hold its reported
 * state at playing across that gap (`continuing` in `ios/player/AudioPlayer.swift`,
 * see `patches/@rntp__player.patch`), which is what Android's Media3 queue
 * does of its own accord, so this grace is the second line of defence: a
 * build older than that patch, or a gap too long for it. A book is one item a
 * sentence, and every boundary arriving as a pause blinked the play control,
 * stepped the cover back and in again, stopped the clock, and read to the
 * book's own handler as the listener pausing. Holding it costs nothing,
 * because a pause the listener asks for is already drawn at the press
 * (`toggleBook`, `toggleEpisode`) and does not wait on this event; if the
 * player is sounding again before the grace is up, there was no pause to draw.
 */
const GAP_GRACE_MS = Platform.OS === 'ios' ? 500 : 0;
let gapTimer: ReturnType<typeof setTimeout> | null = null;

/** The player ran out of items: that pause is the real thing and is answered at once. */
function ranOut(): boolean {
  return TrackPlayer.getPlaybackState() === PlaybackState.Ended;
}

async function handleEvent(event: BackgroundEvent): Promise<void> {
  if (event.type === Event.IsPlayingChanged) {
    if (gapTimer) clearTimeout(gapTimer);
    gapTimer = null;
    if (!event.playing && GAP_GRACE_MS > 0 && !ranOut()) {
      gapTimer = setTimeout(() => {
        gapTimer = null;
        if (!TrackPlayer.isPlaying()) void deliver(event);
      }, GAP_GRACE_MS);
      return;
    }
  }
  await deliver(event);
}

const FOREGROUND_EVENTS = [
  Event.PlaybackProgressUpdated,
  Event.IsPlayingChanged,
  Event.PlaybackStateChanged,
  Event.MediaItemTransition,
  Event.PlaybackError,
  Event.RemoteSeek,
  Event.RemoteSkipForward,
  Event.RemoteSkipBackward,
  // The Highlight button is a button in Android's notification, and only
  // Android's side of the player knows the event. iOS has no such control, and
  // its native module refuses a listener for an event it does not list.
  ...(Platform.OS === 'android' ? [Event.RemoteHighlight] : []),
] as const;

/**
 * The listeners attached by this runtime, kept outside the module. A hot
 * reload in development runs this module again with fresh state, and the old
 * copy's listeners stayed attached, still holding what they were tracking
 * before the reload. Closing the player empties the native queue, which
 * reports "ended", and an old copy took that as the episode finishing: it was
 * marked played and dropped out of Continue Listening. Removing the previous
 * set first leaves one copy listening.
 */
const attached = globalThis as { __playerListeners?: { remove: () => void }[] };
let listening = false;

/**
 * Listens to the native player in the foreground, with the lock screen's skip
 * lengths kept in step. Once per runtime.
 */
export function attachPlayerListeners(): void {
  if (listening) return;
  listening = true;
  attached.__playerListeners?.forEach((listener) => listener.remove());
  attached.__playerListeners = [
    ...FOREGROUND_EVENTS.map((type) =>
      TrackPlayer.addEventListener(type, ((payload: object) => void handleEvent({ ...payload, type } as BackgroundEvent)) as never),
    ),
    // Its own listener: this event's payload has a `type` field of its own, so it
    // cannot travel through the shared handler's `{ ...payload, type }` shape.
    // It only clears what the screens show, which nothing in the background draws.
    TrackPlayer.addEventListener(Event.SleepTimerTriggered, () => store().patch({ sleep: null })),
    { remove: followSkipLengths(() => (store().loaded ? (store().current?.kind ?? null) : null)) },
  ];
}

/**
 * The player set up and heard, before anything loads into it: whatever plays
 * (an episode, a book) goes through here, so nothing can sound without its
 * events reaching the screens. False where audio is unavailable.
 */
export function readyPlayer(): boolean {
  if (!ensureAudioPlayer()) return false;
  attachPlayerListeners();
  return true;
}

/** Android: the same handling while the app is in the background. Module level, before render. */
export function registerPlayerBackgroundHandler(): void {
  registerAudioBackgroundHandler('player', handleEvent);
}
