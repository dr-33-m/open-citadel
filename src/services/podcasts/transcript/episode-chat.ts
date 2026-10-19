/**
 * Samwell on a podcast episode: how a chat about one is grounded. The sibling
 * of `services/blogs/article-chat.ts`.
 *
 * An episode has no plot to spoil (decided), so it is grounded in the whole
 * transcript, as a post is: the titles, its length, its chapters with their
 * times, where the listener is, and the opening of the transcript. For the
 * rest he moves through it with `search_reading` and `read_chapter`, which
 * work because the episode is an indexed book. He is told where the listener
 * is only so he can say "you haven't reached this part yet" when it helps,
 * never to hold anything back.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { podcastEpisodes } from '@/db/schema';
import { getEpisode, listChapters } from '@/services/podcasts/episodes';
import { showName } from '@/services/podcasts/records';
import { episodeChatPrompt } from '@/services/podcasts/transcript/episode-prompt';
import { readTranscript } from '@/services/podcasts/transcript/store';

/** The grounding for a chat about the episode whose transcript is this book. Null when it is not one. */
export async function episodeChatGrounding(bookId: string): Promise<string | null> {
  const row = db
    .select({ id: podcastEpisodes.id })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.transcriptBookId, bookId))
    .get();
  if (!row) return null;
  const detail = await getEpisode(row.id);
  if (!detail) return null;
  const [chapters, doc] = await Promise.all([listChapters(row.id), readTranscript(row.id)]);
  return episodeChatPrompt({
    title: detail.episode.title,
    showTitle: showName(detail.show),
    durationSec: detail.episode.durationSec || doc?.durationSec || 0,
    chapters: chapters.map((c) => ({ startSec: c.startSec, title: c.title })),
    positionSec: detail.episode.positionSec,
    doc,
  });
}
