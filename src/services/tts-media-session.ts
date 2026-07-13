import { Platform } from "react-native";
import TrackPlayer from "@rntp/player";

let isSetup = false;

/**
 * Register the Android background event handler.
 * Required by RNTP but we don't need to handle any events. This API is
 * Android-only — on iOS it warns and is a no-op (iOS uses addEventListener,
 * and background audio is already enabled via UIBackgroundModes: ["audio"]).
 */
export function registerTTSBackgroundHandler(): void {
  if (Platform.OS !== "android") return;
  try {
    TrackPlayer.registerBackgroundEventHandler(() => async () => {});
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
  if (Platform.OS !== "android") return;
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
  if (Platform.OS !== "android") return;
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
  if (Platform.OS !== "android") return;
  if (!isSetup) return;
  TrackPlayer.clear();
}
