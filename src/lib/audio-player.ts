import type { AudioPlayer } from 'expo-audio';

/**
 * Done with an `expo-audio` player, for good.
 *
 * `remove()` is not enough on Android, whatever its documentation says. In
 * expo-audio 57 it only drops the player from the module's own list; the
 * ExoPlayer under it, its media session and its hold on audio focus stay
 * alive until the JS object happens to be garbage collected, which in a voice
 * list can be never. Every sample tried left one behind, and after enough of
 * them a new one could not get the speaker: samples went silent until the app
 * was restarted. `release()` is what actually frees the native side.
 *
 * Paused first, so a player that is still sounding stops on this frame rather
 * than when the native release gets round to it, and listeners go with it.
 */
export function disposeAudioPlayer(player: AudioPlayer | null): void {
  if (!player) return;
  try {
    player.pause();
  } catch {
    // Already torn down.
  }
  player.removeAllListeners('playbackStatusUpdate');
  player.remove();
  player.release();
}
