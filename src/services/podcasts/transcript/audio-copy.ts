/**
 * The copy of an episode this phone plays, when its transcript was made from
 * another.
 *
 * Shows that stitch ads into each download serve every listener their own
 * copy of an episode, and their transcriber another. The transcript carries
 * the fingerprint of the copy it was made from; to map the copy heard here
 * onto it (`time-map.ts`), the phone must know which copy it is playing. So
 * for an episode with such a transcript the feed's address is followed to the
 * copy it serves now (its first byte only, nothing downloaded) and that copy
 * is what the player is given: the copy mapped is then the copy heard.
 *
 * A download is a copy too: it is fetched from the copy's own address and
 * remembers which copy it is, so its transcript is mapped onto the file on
 * the phone, and an episode transcribed after it was downloaded is
 * transcribed from that very copy while its host still serves it.
 *
 * An episode with no fingerprinted transcript plays as it always did.
 */
import { fetch as streamingFetch } from 'expo/fetch';
import { audioIdentity, totalBytesOf } from 'samwell-shared';

import { USER_AGENT } from '@/services/feeds/fetch';
import { localFileUri } from '@/services/podcasts/download-paths';
import type { EpisodeItem } from '@/services/podcasts/records';
import { readCopyRow, type AudioCopy } from '@/services/podcasts/transcript/copy-row';

export type { AudioCopy } from '@/services/podcasts/transcript/copy-row';

/**
 * How long a copy's address is played again rather than asked for anew. Some
 * hosts' addresses stop working within a couple of hours; one asked for again
 * may come with other ads, and need mapping again.
 */
const FRESH_MS = 60 * 60_000;
/** How long play waits for the copy before playing the feed's address after all. */
const PLAY_WAIT_MS = 2_500;
/** A download or a transcript is not in a hurry: a slow host is given longer. */
const PATIENT_WAIT_MS = 10_000;

/**
 * What the player was given for each episode played this session: the copy,
 * or null when which copy is playing is not known (a download from before
 * copies were kept, a host that would not say, the next episode in the
 * queue). Absent: not played this session.
 */
const copies = new Map<string, { copy: AudioCopy | null; at: number }>();
/**
 * Copies that answered after play stopped waiting for them: that play went
 * ahead on the feed's address, and the next play of the episode streams the
 * copy found, rather than asking again and perhaps missing again.
 */
const late = new Map<string, AudioCopy & { at: number }>();

const wait = (ms: number) => new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms));

/** The player has been given this episode: as this copy, or as one not known. */
export function rememberCopy(episodeId: string, copy: AudioCopy | null): void {
  copies.set(episodeId, { copy, at: Date.now() });
}

/**
 * The copy the address serves now, from its first byte, or null when its
 * host cannot say within `waitMs`.
 */
export async function resolveAudioCopy(url: string, waitMs: number): Promise<AudioCopy | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), waitMs);
  try {
    const response = await streamingFetch(url, {
      headers: { Range: 'bytes=0-0', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    // Only the address and the length are wanted, never the episode.
    void response.body?.cancel().catch(() => undefined);
    if (!response.ok || !response.url) return null;
    const total = totalBytesOf(response.headers.get('content-range'), response.headers.get('content-length'));
    return { url: response.url, identity: audioIdentity(response.url, total) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The copy a download is fetched from, or null to fetch the feed's address as it is. */
export function copyToDownload(feedUrl: string): Promise<AudioCopy | null> {
  return resolveAudioCopy(feedUrl, PATIENT_WAIT_MS);
}

export interface PlayCopy {
  /** What to stream in place of the feed's address, or null for the file or the feed's address. */
  streamUrl: string | null;
  /** The copy that will be heard, for its transcript's map, when it is known. */
  copy: AudioCopy | null;
}

/**
 * What the player is given for `item`. A download plays its file, the copy
 * it remembers being; an episode streamed with a fingerprinted transcript
 * streams the copy its address serves now, waiting at most a couple of
 * seconds for it. Remembered either way, for `time-map.ts`.
 */
export async function copyToPlay(item: EpisodeItem): Promise<PlayCopy> {
  const row = readCopyRow(item.id);
  if (localFileUri(item) !== null) {
    rememberCopy(item.id, row.downloadCopy);
    return { streamUrl: null, copy: row.downloadCopy };
  }
  // Only an episode whose transcript can be mapped waits for its copy.
  if (!row.transcriptCopy) {
    rememberCopy(item.id, null);
    return { streamUrl: null, copy: null };
  }
  const kept = copies.get(item.id);
  if (kept?.copy && Date.now() - kept.at < FRESH_MS) return { streamUrl: kept.copy.url, copy: kept.copy };
  const found = late.get(item.id);
  late.delete(item.id);
  if (found && Date.now() - found.at < FRESH_MS) {
    rememberCopy(item.id, found);
    return { streamUrl: found.url, copy: found };
  }
  // Play waits a couple of seconds at most; a host slower than that is still
  // heard, from the feed's address, and its copy kept for the next play.
  const resolving = resolveAudioCopy(item.audioUrl, PATIENT_WAIT_MS);
  const copy = await Promise.race([resolving, wait(PLAY_WAIT_MS)]);
  if (copy === undefined) {
    void resolving.then((answer) => answer && late.set(item.id, { ...answer, at: Date.now() }));
    rememberCopy(item.id, null);
    return { streamUrl: null, copy: null };
  }
  rememberCopy(item.id, copy);
  return { streamUrl: copy?.url ?? null, copy };
}

/**
 * The episode was taken back up already playing: the app's JavaScript
 * started again while its audio carried on (an update applied, Android
 * waking the app for a background event). The copy is whatever the native
 * player holds: the download's, the copy at its address, or, at the feed's
 * own address, one not known.
 */
export async function copyBeingPlayed(item: EpisodeItem, playingUrl: string | null | undefined): Promise<AudioCopy | null> {
  const row = readCopyRow(item.id);
  if (localFileUri(item) !== null) {
    rememberCopy(item.id, row.downloadCopy);
    return row.downloadCopy;
  }
  if (!row.transcriptCopy || !playingUrl || playingUrl === item.audioUrl) {
    rememberCopy(item.id, null);
    return null;
  }
  const copy = await resolveAudioCopy(playingUrl, PATIENT_WAIT_MS);
  rememberCopy(item.id, copy);
  return copy;
}

/**
 * The episode became current some other way than a press of play (the next in
 * the queue, the player taken up again after a restart): it plays its file,
 * which is its download's copy, or the feed's address, which is a copy not
 * known.
 */
export function rememberQueuedCopy(item: EpisodeItem): AudioCopy | null {
  const copy = localFileUri(item) !== null ? readCopyRow(item.id).downloadCopy : null;
  rememberCopy(item.id, copy);
  return copy;
}

/**
 * The copy last given to the player for an episode this session; null when
 * it played without one being known; undefined when it has not played.
 */
export function playedCopy(episodeId: string): AudioCopy | null | undefined {
  return copies.get(episodeId)?.copy;
}

/**
 * The address to transcribe an episode from: its download's copy while the
 * host still serves that copy, so the transcript is made from the very file
 * on the phone; else the feed's address, which the server resolves itself.
 */
export async function addressToTranscribe(episodeId: string, feedUrl: string): Promise<string> {
  const copy = readCopyRow(episodeId).downloadCopy;
  if (!copy) return feedUrl;
  const still = await resolveAudioCopy(copy.url, PATIENT_WAIT_MS);
  return still?.identity === copy.identity ? copy.url : feedUrl;
}
