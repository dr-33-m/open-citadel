import TrackPlayer from "@rntp/player";

let isSetup = false;

/**
 * Register the Android background event handler.
 * Required by RNTP but we don't need to handle any events.
 */
export function registerTTSBackgroundHandler(): void {
  TrackPlayer.registerBackgroundEventHandler(() => async () => {});
}

/**
 * Initialize the RNTP player once at app startup.
 * No capabilities — the notification is a passive "now playing" indicator
 * with no interactive controls.
 */
export function setupTTSMediaSession(): void {
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
  if (!isSetup) return;
  TrackPlayer.clear();
}
