/**
 * Podcast playback, through the shared native player.
 *
 * The native queue mirrors ours: the episode playing, then Up Next. That is
 * what lets the lock screen's "next", a headset button, or simply the end of
 * an episode move on without the app being awake to do it, and the app catches
 * up when the transition event arrives (marks the last one played if it ran to
 * the end, takes the new one out of Up Next, applies the show's speed).
 *
 * Positions are saved from the native player's own progress tick, every few
 * seconds while audio plays and once more on pause, so a killed app loses at
 * most a few seconds. Each save also counts the time actually spent listening,
 * which is what the stats will be built on.
 *
 * The public surface. The work is split by concern under `player/`:
 * `session` (what this runtime is tracking), `media` (episodes as native
 * items), `lifecycle` (starting, moving on, stopping), `controls` and `events`.
 */
export {
  playEpisode,
  playEpisodeFrom,
  seekTo,
  setSleepTimer,
  setSpeed,
  skipBy,
  togglePlayback,
} from "@/services/podcasts/player/controls";
export { registerPodcastBackgroundHandler, restoreNowPlaying } from "@/services/podcasts/player/events";
export {
  finishCurrentAndAdvance,
  releasePlayerForSpeech,
  stopPlayback,
  syncNativeQueue,
} from "@/services/podcasts/player/lifecycle";
