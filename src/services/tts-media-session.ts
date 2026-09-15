import TrackPlayer from "@rntp/player";

let isSetup = false;
let backgroundHandlerRegistered = false;

/**
 * Register the Android background event handler.
 * Required by RNTP but we don't need to handle any events. This API is
 * Android-only — on iOS it warns and is a no-op (iOS uses addEventListener,
 * and background audio is already enabled via UIBackgroundModes: ["audio"]).
 *
 * Guarded: under Fast Refresh (and any re-evaluation of the root module that
 * calls this) a second `registerBackgroundEventHandler` for the same
 * `TrackPlayerServiceBridge` key spams a warning and re-binds the native
 * headless task. Register exactly once per JS runtime.
 */
export function registerTTSBackgroundHandler(): void {
  if (process.env.EXPO_OS !== "android") return;
  if (backgroundHandlerRegistered) return;
  try {
    TrackPlayer.registerBackgroundEventHandler(() => async () => {});
    backgroundHandlerRegistered = true;
  } catch {
    // Native module may fail to load on some devices — TTS notification is non-critical.
  }
}

/**
 * Initialize the RNTP player once at app startup.
 * No capabilities — the notification is a passive "now playing" indicator
 * with no interactive controls.
 *
 * Android-only: the RNTP media session (setMediaItem with an empty url) crashes
 * on iOS because there is no registered playback service / valid audio asset.
 * iOS TTS audio is produced by Readium natively and is unaffected.
 */
export function setupTTSMediaSession(): void {
  if (process.env.EXPO_OS !== "android") return;
  if (isSetup) return;

  try {
    TrackPlayer.setupPlayer({
      contentType: "speech",
      audioMixing: "mix",
    });

    TrackPlayer.setCommands({
      capabilities: [],
    });

    isSetup = true;
  } catch {
    // Player may already be initialized (e.g. hot reload)
    isSetup = true;
  }
}

/**
 * Start the media session with book metadata so the lock screen /
 * notification shows the book cover, title, and author.
 * No controls — just an indicator that TTS is active.
 */
export function startMediaSession(
  title: string,
  artist: string,
  coverUri: string | null,
): void {
  if (process.env.EXPO_OS !== "android") return;
  TrackPlayer.setMediaItem({
    mediaId: "tts-session",
    url: "",
    title,
    artist,
    artworkUrl: coverUri ?? undefined,
  });
}

/**
 * Stop the media session and clear the notification.
 */
export function stopMediaSession(): void {
  if (process.env.EXPO_OS !== "android") return;
  if (!isSetup) return;
  TrackPlayer.clear();
}
