import TrackPlayer from "@rntp/player";

import { ensureAudioPlayer, registerAudioBackgroundHandler } from "@/services/audio-session";
import { releasePlayerForSpeech } from "@/services/player";

const TTS_MEDIA_ID = "tts-session";

let isSetup = false;

/**
 * Register the Android background event handler.
 * Read-aloud needs no events of its own; the shared handler is registered so
 * the native headless task exists (see `services/audio-session`). Android-only
 * and idempotent there.
 */
export function registerTTSBackgroundHandler(): void {
  registerAudioBackgroundHandler('read-aloud', async () => {});
}

/**
 * Initialize the shared player at app startup, so the lock-screen card is
 * ready the first time read-aloud starts.
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
  isSetup = ensureAudioPlayer();
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
  // Read-aloud takes the player over for its lock-screen card, so a podcast
  // that was playing saves its place and steps aside first.
  releasePlayerForSpeech();
  TrackPlayer.setCommands({ capabilities: [] });
  TrackPlayer.setMediaItem({
    mediaId: TTS_MEDIA_ID,
    url: "",
    title,
    artist,
    artworkUrl: coverUri ?? undefined,
  });
}

/**
 * Stop the media session and clear the notification.
 *
 * Only when the card on the player is still read-aloud's own. The reader calls
 * this on every stop it hears about, including ones for a read-aloud that never
 * started, and the player is shared: clearing it unconditionally would cut off
 * a podcast playing in the background.
 */
export function stopMediaSession(): void {
  if (process.env.EXPO_OS !== "android") return;
  if (!isSetup) return;
  if (TrackPlayer.getActiveMediaItem()?.mediaId !== TTS_MEDIA_ID) return;
  TrackPlayer.clear();
}
