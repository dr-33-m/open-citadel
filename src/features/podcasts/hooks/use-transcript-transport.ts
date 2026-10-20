import { usePlaybackClock } from '@/features/podcasts/hooks/use-playback-clock';
import { seekTo, skipBy, togglePlayback } from '@/services/podcasts/player';
import { selectPlaying, usePlayerLoader, usePodcastPlayer } from '@/stores/podcast-player';
import { usePodcastPrefs } from '@/stores/podcast-prefs';

/**
 * The player's own controls, under a transcript: where the episode is, the
 * way to move it, and back, play, forward. The clock ticks in shared values,
 * so it never re-renders the list above.
 */
export function useTranscriptTransport() {
  const current = usePodcastPlayer((s) => s.current);
  const playing = usePodcastPlayer(selectPlaying);
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
