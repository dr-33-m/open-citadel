import { usePlaybackClock } from '@/features/podcasts/hooks/use-playback-clock';
import { seekTo, skipBy, togglePlayback } from '@/services/player';
import { selectPlaying, usePlayerLoader, usePlayer } from '@/stores/player';
import { usePodcastPrefs } from '@/stores/podcast-prefs';

/**
 * The player's own controls, under a follow-along sheet: where the episode is, the
 * way to move it, and back, play, forward. The clock ticks in shared values,
 * so it never re-renders the list above.
 */
export function useFollowAlongTransport() {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer(selectPlaying);
  const buffering = usePlayerLoader();
  const skipBackSec = usePodcastPrefs((s) => s.skipBackSec);
  const skipForwardSec = usePodcastPrefs((s) => s.skipForwardSec);
  const clock = usePlaybackClock(current?.positionSec ?? 0, current?.durationSec ?? 0);

  return {
    scrubber: { position: clock.position, duration: clock.duration, onSeek: seekTo, live: true },
    transport: {
      playing,
      buffering,
      skipBackSec,
      skipForwardSec,
      onToggle: () => void togglePlayback(),
      onBack: () => skipBy(-skipBackSec),
      onForward: () => skipBy(skipForwardSec),
    },
  };
}
