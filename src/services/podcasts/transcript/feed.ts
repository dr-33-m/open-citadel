/**
 * The show's own transcript, fetched the first time the reader opens the
 * transcript or asks Samwell, never in a refresh. Free, and parsed here on
 * the phone; nothing is sent to Samwell Cloud.
 */
import { fetchPage } from '@/services/feeds/fetch';
import { getEpisode } from '@/services/podcasts/episodes';
import { transcriptFormat } from '@/services/podcasts/transcript/formats';
import { parseFeedTranscript } from '@/services/podcasts/transcript/parse';
import { saveTranscript } from '@/services/podcasts/transcript/store';

/** The show's transcript could not be fetched or read. The Transcribe path is offered in its place. */
export class FeedTranscriptError extends Error {}

/** Fetches, parses and keeps the feed's transcript. Returns the episode's book id. */
export async function fetchFeedTranscript(episodeId: string, signal?: AbortSignal): Promise<string> {
  const detail = await getEpisode(episodeId);
  const url = detail?.episode.transcriptUrl;
  if (!url) throw new FeedTranscriptError("This episode's show publishes no transcript.");
  let body: string;
  try {
    body = (await fetchPage(url, signal)).body;
  } catch {
    if (signal?.aborted) throw new FeedTranscriptError('Cancelled.');
    throw new FeedTranscriptError("The show's transcript couldn't be reached.");
  }
  const doc = parseFeedTranscript(body, transcriptFormat(detail.episode.transcriptType, url));
  if (!doc) throw new FeedTranscriptError("The show's transcript couldn't be read.");
  // A feed that gives no length still has one: the transcript's own end.
  const durationSec = doc.durationSec || detail.episode.durationSec;
  return saveTranscript(episodeId, { ...doc, durationSec });
}
