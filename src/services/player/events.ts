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
import TrackPlayer, { Event, PlaybackState, type BackgroundEvent } from '@rntp/player';

import { registerAudioBackgroundHandler } from '@/services/audio-session';
import { clearSeeking, clearStarting, store } from '@/services/player/session';

export type PlayerEventHandler = (event: BackgroundEvent) => Promise<void>;

const handlers = new Set<PlayerEventHandler>();

/** A kind of thing that plays (episodes, books) hears every event after the shared state is updated. */
export function addPlayerHandler(handler: PlayerEventHandler): void {
  handlers.add(handler);
}

async function handleEvent(event: BackgroundEvent): Promise<void> {
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
  for (const handler of handlers) await handler(event).catch(() => {});
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
  Event.RemoteHighlight,
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

/** Listens to the native player in the foreground. Once per runtime; `extra` are removed with the rest. */
export function attachPlayerListeners(extra: { remove: () => void }[] = []): void {
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
    ...extra,
  ];
}

/** Android: the same handling while the app is in the background. Module level, before render. */
export function registerPlayerBackgroundHandler(): void {
  registerAudioBackgroundHandler(handleEvent);
}
