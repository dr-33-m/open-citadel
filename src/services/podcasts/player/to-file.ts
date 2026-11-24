/**
 * An episode being streamed moves onto its download, on the moment heard.
 *
 * When the phone goes offline the stream has only what it buffered left; a
 * download of the same episode has all of it. The player is handed the file
 * at the same moment of the show, and carries on as it was, playing or
 * paused, so going offline is not heard as anything but a breath.
 *
 * "The same moment" is the same time when the file is the copy streamed. A
 * show that stitches ads into each download may have given the file other
 * ads: then the moment is carried across through the transcript's clock,
 * when both copies have been mapped onto it (`transcript/time-map.ts`), and
 * left at the same time when they cannot be.
 */
import TrackPlayer, { type MediaItem } from "@rntp/player";
import { carryAcross } from "samwell-shared";

import { localFileUri } from "@/services/podcasts/download-paths";
import { getEpisodeItem } from "@/services/podcasts/episodes";
import { becomeCurrent, loadNativeQueue } from "@/services/podcasts/player/lifecycle";
import { mediaItemFrom, nativeUpNext } from "@/services/podcasts/player/media";
import { session } from "@/services/podcasts/player/session";
import { store } from "@/services/player/session";
import { playedCopy, rememberCopy, type AudioCopy } from "@/services/podcasts/transcript/audio-copy";
import { readCopyRow } from "@/services/podcasts/transcript/copy-row";
import { knownMapOf } from "@/services/podcasts/transcript/time-map";

function activeItem(): MediaItem | null {
  try {
    return TrackPlayer.getActiveMediaItem() ?? null;
  } catch {
    return null;
  }
}

/** Where the moment heard at `heard` in the copy streamed is in the file. */
function sameMomentOnFile(episodeId: string, heard: number, streamed: AudioCopy | null | undefined, file: AudioCopy | null): number {
  if (!streamed || !file || streamed.identity === file.identity) return heard;
  const from = knownMapOf(episodeId, streamed);
  const to = knownMapOf(episodeId, file);
  return from && to ? carryAcross(from, to, heard) : heard;
}

/**
 * Moves the episode in the player onto its download, if it has one and is
 * not playing it already. It goes on as it was, playing or paused, unless
 * `play` says otherwise (a stream that failed was playing). Returns whether
 * it moved.
 */
export async function moveToDownload({ play }: { play?: boolean } = {}): Promise<boolean> {
  const tracked = session.tracking;
  if (!tracked || !store().loaded) return false;
  const item = await getEpisodeItem(tracked.episodeId);
  const file = item ? localFileUri(item) : null;
  const active = activeItem();
  if (!item || !file || active?.mediaId !== item.id || active.url === file) return false;
  const upNext = await nativeUpNext(item.id);
  // Read last, so nothing heard while the queue was read is heard again.
  if (session.tracking?.episodeId !== item.id) return false;
  const position = TrackPlayer.getProgress().position;
  const heard = position > 0 ? position : tracked.lastPosition;
  const fileCopy = readCopyRow(item.id).downloadCopy;
  const at = sameMomentOnFile(item.id, heard, playedCopy(item.id), fileCopy);
  const playing = play ?? store().isPlaying;
  rememberCopy(item.id, fileCopy);
  loadNativeQueue([mediaItemFrom(item, at), ...upNext]);
  await becomeCurrent(item, at, fileCopy);
  if (playing) TrackPlayer.play();
  else TrackPlayer.pause();
  return true;
}
