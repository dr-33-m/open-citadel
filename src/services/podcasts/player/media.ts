/** Translating episodes into what the native player and the mini player hold. */
import type { MediaItem } from "@rntp/player";

import { episodeArtwork, localFileUri } from "@/services/podcasts/download-paths";
import { listShelf } from "@/services/podcasts/episodes";
import { playOrder } from "@/services/podcasts/player/play-order";
import { session } from "@/services/podcasts/player/session";
import type { EpisodeItem } from "@/services/podcasts/records";
import { getShow } from "@/services/podcasts/shows";
import { phoneHasNetwork } from "@/lib/network";
import { podcastPrefs } from "@/stores/podcast-prefs";
import type { EpisodeNowPlaying } from "@/stores/player";

/** How many of the episodes ahead are handed to the native queue ahead of time. */
const NATIVE_LOOKAHEAD = 20;

export function nowPlayingFrom(item: EpisodeItem): EpisodeNowPlaying {
  return {
    kind: "episode",
    episodeId: item.id,
    podcastId: item.podcastId,
    title: item.title,
    showTitle: item.showTitle,
    artworkUrl: episodeArtwork(item),
    durationSec: item.durationSec,
    positionSec: item.positionSec,
  };
}

/**
 * `startAt`, in seconds, is where the native queue starts this item when it
 * is loaded first (see the `@rntp/player` patch): a seek sent after the load
 * could land before it on Android and be undone.
 */
export function mediaItemFrom(item: EpisodeItem, startAt = 0): MediaItem {
  return {
    mediaId: item.id,
    startPosition: startAt,
    url: localFileUri(item) ?? item.audioUrl,
    title: item.title,
    artist: item.showTitle,
    albumTitle: item.showTitle,
    artworkUrl: episodeArtwork(item) ?? undefined,
    duration: item.durationSec > 0 ? item.durationSec : undefined,
    mimeType: item.mimeType ?? undefined,
  };
}

/** A show's own speed, or everyone's. */
export async function speedFor(podcastId: string): Promise<number> {
  const show = await getShow(podcastId);
  return show?.playbackSpeed ?? podcastPrefs().playbackSpeed;
}

/**
 * The episodes ahead of `excluding`, in the order they will play. With no
 * network, only the downloaded ones: nothing else can play, so nothing else is
 * next.
 */
export async function episodesAhead(excluding: string | null, downloadedOnly = !phoneHasNetwork()): Promise<EpisodeItem[]> {
  const [inProgress, upNext] = await Promise.all([listShelf("continue"), listShelf("queue")]);
  return playOrder(inProgress, upNext).filter(
    (item) => item.id !== excluding && !session.passedOver.has(item.id) && (!downloadedOnly || localFileUri(item) !== null),
  );
}

/** The first few episodes ahead, as native queue items. */
export async function nativeUpNext(excluding: string): Promise<MediaItem[]> {
  const items = await episodesAhead(excluding);
  return items.slice(0, NATIVE_LOOKAHEAD).map((item) => mediaItemFrom(item));
}

/** Where to start: where it was left, unless that was the very end or it was played. */
export function resumePosition(item: EpisodeItem, skipIntroSec: number): number {
  const played = item.playState === "played";
  const nearEnd = item.durationSec > 0 && item.positionSec >= item.durationSec - 5;
  const start = played || nearEnd ? 0 : item.positionSec;
  return Math.max(start, skipIntroSec);
}
