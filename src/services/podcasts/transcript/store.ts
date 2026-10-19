/**
 * An episode's transcript on this phone, kept twice from one source: a JSON
 * file the player's transcript sheet reads, and a generated EPUB with a
 * `books` row of kind `episode` that Samwell, search, highlights, Timeline
 * and Compass reach as they reach any book.
 *
 * Files are written by NAME on the episode row and resolved on use, for the
 * reason `downloadFile` gives: iOS moves the app's container between
 * launches. The transcript, its book and its chats outlive the episode being
 * unfollowed, as a post's copy outlives its blog dropping it.
 */
import { and, eq } from 'drizzle-orm';
import { documentDirectory, getInfoAsync, makeDirectoryAsync, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { TranscriptDocSchema, type TranscriptDoc } from 'samwell-shared';

import { db } from '@/db/client';
import { books, podcastEpisodes } from '@/db/schema';
import { invalidatePodcastLibrary } from '@/query-manager/podcasts/invalidate';
import { writeEpubFile } from '@/services/epub/write';
import { getEpisode, listChapters } from '@/services/podcasts/episodes';
import { newId, nowIso, showName } from '@/services/podcasts/records';
import { episodeEpubFiles } from '@/services/podcasts/transcript/episode-epub';

const TRANSCRIPTS_DIR = `${documentDirectory}transcripts/`;
const EPISODES_DIR = `${documentDirectory}episodes/`;

const fileFor = (name: string) => `${TRANSCRIPTS_DIR}${name}`;

/** The transcript on this phone for an episode, or null when there is none (or it cannot be read). */
export async function readTranscript(episodeId: string): Promise<TranscriptDoc | null> {
  const row = db
    .select({ file: podcastEpisodes.transcriptFile })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.id, episodeId))
    .get();
  if (!row?.file) return null;
  try {
    const parsed = TranscriptDocSchema.safeParse(JSON.parse(await readAsStringAsync(fileFor(row.file))));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes the episode's EPUB from its transcript and upserts its `books` row. Returns the book id. */
async function writeEpisodeBook(episodeId: string, doc: TranscriptDoc): Promise<string> {
  const detail = await getEpisode(episodeId);
  if (!detail) throw new Error('This episode is no longer in your library.');
  const { episode, show } = detail;
  const chapters = await listChapters(episodeId);
  const files = episodeEpubFiles({
    episodeId,
    title: episode.title,
    showTitle: showName(show),
    pubDate: episode.pubDate,
    link: episode.link,
    doc,
    chapters: chapters.map((chapter) => ({ startSec: chapter.startSec, title: chapter.title })),
  });
  const filePath = await writeEpubFile(EPISODES_DIR, episodeId, files);
  const bookId = episode.transcriptBookId ?? newId();
  const row = {
    title: episode.title,
    author: showName(show),
    coverUrl: episode.imageUrl ?? show.imageUrl,
    filePath,
    format: 'epub' as const,
    kind: 'episode' as const,
  };
  db.insert(books)
    .values({ id: bookId, ...row, addedAt: nowIso() })
    .onConflictDoUpdate({ target: books.id, set: row })
    .run();
  return bookId;
}

/** Keeps a transcript that just arrived: the JSON, the EPUB, and the episode row saying so. */
export async function saveTranscript(episodeId: string, doc: TranscriptDoc): Promise<string> {
  const name = `${episodeId}.json`;
  await makeDirectoryAsync(TRANSCRIPTS_DIR, { intermediates: true }).catch(() => {});
  await writeAsStringAsync(fileFor(name), JSON.stringify(doc));
  const bookId = await writeEpisodeBook(episodeId, doc);
  db.update(podcastEpisodes)
    .set({
      transcriptStatus: 'ready',
      transcriptSource: doc.source,
      transcriptFile: name,
      transcriptJobId: null,
      transcriptBookId: bookId,
      transcriptAt: nowIso(),
    })
    .where(eq(podcastEpisodes.id, episodeId))
    .run();
  invalidatePodcastLibrary();
  return bookId;
}

/**
 * The episode's book for a chat, made again from the JSON if its file has
 * gone (a reinstall restoring the database but not the documents folder).
 */
export async function ensureEpisodeBook(episodeId: string): Promise<string | null> {
  const row = db
    .select({ bookId: podcastEpisodes.transcriptBookId })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.id, episodeId))
    .get();
  if (row?.bookId) {
    const book = db.select({ filePath: books.filePath }).from(books).where(eq(books.id, row.bookId)).get();
    if (book?.filePath && (await getInfoAsync(book.filePath)).exists) return row.bookId;
  }
  const doc = await readTranscript(episodeId);
  if (!doc) return null;
  const bookId = await writeEpisodeBook(episodeId, doc);
  db.update(podcastEpisodes).set({ transcriptBookId: bookId }).where(eq(podcastEpisodes.id, episodeId)).run();
  return bookId;
}

/**
 * A speaker's name corrected by the reader, for every line they have. The
 * EPUB is written again so Samwell and search see the right name too.
 */
export async function renameSpeaker(episodeId: string, speaker: number, name: string): Promise<TranscriptDoc | null> {
  const doc = await readTranscript(episodeId);
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!doc || !clean || speaker < 0 || speaker >= doc.speakers.length) return doc;
  const next = { ...doc, speakers: doc.speakers.map((old, i) => (i === speaker ? clean : old)) };
  await saveTranscript(episodeId, next);
  return next;
}

/** A cloud job started for this episode. */
export function setTranscribing(episodeId: string, jobId: string): void {
  db.update(podcastEpisodes)
    .set({ transcriptStatus: 'transcribing', transcriptJobId: jobId })
    .where(eq(podcastEpisodes.id, episodeId))
    .run();
  invalidatePodcastLibrary();
}

/** A cloud job ended without a transcript: stopped, failed or expired. A transcript already here stays. */
export function clearTranscribing(episodeId: string): void {
  db.update(podcastEpisodes)
    .set({ transcriptStatus: 'none', transcriptJobId: null })
    .where(and(eq(podcastEpisodes.id, episodeId), eq(podcastEpisodes.transcriptStatus, 'transcribing')))
    .run();
  invalidatePodcastLibrary();
}
