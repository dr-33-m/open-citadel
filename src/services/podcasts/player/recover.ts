/** What to do when an episode the player holds will not load. */
import TrackPlayer from "@rntp/player";

import { localFileUri } from "@/services/podcasts/download-paths";
import { getEpisodeItem } from "@/services/podcasts/episodes";
import { startEpisode } from "@/services/podcasts/player/lifecycle";
import { episodesAhead } from "@/services/podcasts/player/media";
import { session } from "@/services/podcasts/player/session";
import { enqueue } from "@/services/podcasts/queue";

/** Let go without saving: a failed player's position is not where it was left. */
function letGoOf(episodeId: string): void {
  session.letGo.add(episodeId);
  session.tracking = null;
}

/**
 * A stream failed, which the network's state does not always see coming.
 *
 * Downloaded since the native queue was filled: played from the file. Otherwise,
 * if the player moved on to it by itself, on to the next download rather than
 * stopping on an error. An episode the listener chose keeps its error, since
 * playing a different one is not what was asked for. Returns whether it moved.
 */
export async function recoverFromFailedStream(): Promise<boolean> {
  const tracked = session.tracking;
  if (!tracked) return false;
  const item = await getEpisodeItem(tracked.episodeId);
  if (!item) return false;

  const file = localFileUri(item);
  if (file) {
    if (TrackPlayer.getActiveMediaItem()?.url === file) return false;
    letGoOf(item.id);
    await startEpisode(item.id);
    return true;
  }

  if (session.chosen === item.id) return false;
  const [next] = await episodesAhead(item.id, true);
  if (!next) return false;
  letGoOf(item.id);
  // Not tried again until the listener next presses play, but not lost: taking
  // it on took it out of Up Next, and nothing else would be holding its place.
  session.passedOver.add(item.id);
  if (item.positionSec === 0) await enqueue([item.id], "next");
  await startEpisode(next.id);
  return true;
}
