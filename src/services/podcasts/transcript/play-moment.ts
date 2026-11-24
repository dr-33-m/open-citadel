/**
 * Plays an episode from a moment of its transcript: a line tapped, a
 * highlight opened, a time Samwell cited. The moment is on the transcript's
 * clock, which the copy being played may not share (`time-map.ts`), so the
 * player moves it to where it is heard, once it knows which copy that is.
 */
import { playEpisodeFrom } from '@/services/podcasts/player';

export function playTranscriptMoment(episodeId: string, transcriptSec: number): Promise<void> {
  return playEpisodeFrom(episodeId, { transcriptSec });
}
