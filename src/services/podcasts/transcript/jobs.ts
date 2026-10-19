/**
 * A cloud transcript, from the phone's side: start a job for an episode,
 * collect what it made, stop it, and on launch pick up anything a closed
 * phone missed. The episode row says where it is (`transcript_status`), so
 * every screen showing the episode agrees.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { podcastEpisodes } from '@/db/schema';
import { getEpisode } from '@/services/podcasts/episodes';
import { showName } from '@/services/podcasts/records';
import { showNotesToText } from '@/services/podcasts/show-notes';
import {
  collectTranscript,
  pendingTranscriptions,
  startTranscription,
  stopTranscription,
} from '@/services/podcasts/transcript/cloud';
import { clearTranscribing, saveTranscript, setTranscribing } from '@/services/podcasts/transcript/store';

/** Asks Samwell Cloud to transcribe an episode. Throws a `TranscribeError` when refused. */
export async function transcribeEpisode(episodeId: string): Promise<{ jobId: string; credits: number }> {
  const detail = await getEpisode(episodeId);
  if (!detail) throw new Error('This episode is no longer in your library.');
  const { episode, show } = detail;
  const started = await startTranscription({
    audioUrl: episode.audioUrl,
    durationSec: episode.durationSec,
    episodeKey: episode.guid ?? episode.audioUrl,
    title: episode.title.slice(0, 500),
    showTitle: showName(show).slice(0, 500),
    notes: showNotesToText(episode.description)?.slice(0, 20_000) ?? undefined,
    mimeType: episode.mimeType,
  });
  setTranscribing(episodeId, started.jobId);
  return started;
}

export type CollectedTranscript = { episodeId: string; title: string; bookId: string; credits: number };

/** Collections under way, so the watcher and the launch pick-up asking at once share one. */
const collecting = new Map<string, Promise<CollectedTranscript>>();

/** Collects a finished job's transcript and keeps it. The reader is charged by this, once. */
export function collectEpisodeTranscript(episodeId: string, jobId: string): Promise<CollectedTranscript> {
  const running = collecting.get(jobId);
  if (running) return running;
  const job = (async () => {
    const { doc, credits } = await collectTranscript(jobId);
    const bookId = await saveTranscript(episodeId, doc);
    const title = db.select({ title: podcastEpisodes.title }).from(podcastEpisodes).where(eq(podcastEpisodes.id, episodeId)).get()?.title ?? '';
    return { episodeId, title, bookId, credits };
  })().finally(() => collecting.delete(jobId));
  collecting.set(jobId, job);
  return job;
}

export async function stopEpisodeTranscription(episodeId: string, jobId: string): Promise<void> {
  await stopTranscription(jobId).catch(() => undefined);
  clearTranscribing(episodeId);
}

/** Episodes this phone believes are being transcribed, with their jobs. */
export function transcribingEpisodes(): { episodeId: string; jobId: string; title: string }[] {
  return db
    .select({ episodeId: podcastEpisodes.id, jobId: podcastEpisodes.transcriptJobId, title: podcastEpisodes.title })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.transcriptStatus, 'transcribing'))
    .all()
    .filter((row): row is { episodeId: string; jobId: string; title: string } => row.jobId != null);
}

export type PickUp = { collected: CollectedTranscript[]; failed: { episodeId: string; title: string }[] };

/**
 * On launch and when the app comes to the front: what happened to the jobs
 * this phone started. A ready one is collected; one that failed, expired or
 * that the server no longer knows is cleared, so its button is Transcribe
 * again; a running one is left to the watcher.
 */
export async function pickUpTranscriptions(): Promise<PickUp> {
  const local = transcribingEpisodes();
  const result: PickUp = { collected: [], failed: [] };
  if (local.length === 0) return result;
  const pending = new Map((await pendingTranscriptions()).map((job) => [job.jobId, job]));
  for (const { episodeId, jobId, title } of local) {
    const job = pending.get(jobId);
    if (job && (job.status === 'queued' || job.status === 'transcribing')) continue;
    if (job?.status === 'ready') {
      try {
        result.collected.push(await collectEpisodeTranscript(episodeId, jobId));
      } catch {
        // Left as it is: the next launch asks again, inside the day the server keeps it.
      }
      continue;
    }
    clearTranscribing(episodeId);
    if (job?.status === 'failed') result.failed.push({ episodeId, title });
  }
  return result;
}
