/**
 * Where transcription jobs are kept between the phone starting one and
 * collecting it.
 *
 * A table rather than memory, so a deploy mid-job is not lost: on boot the
 * worker picks up whatever was still running. A row carries what the job was
 * asked (to resend it), the reservation it holds, and once Scribe has
 * answered, the transcript itself until the phone has it.
 *
 * The same rows are the two limits that are not money: one job in flight per
 * account, and ten hours of audio per account per day. Counting them here
 * rather than in memory means a restart neither forgets a running job nor
 * hands back a spent day.
 *
 * Lifetime: a transcript waits 24 hours to be collected, and an hour after it
 * has been, in case the phone's write failed and it asks again. Then the
 * transcript is dropped and only the bookkeeping is left, which goes after
 * two days. `transcribe-worker.ts` runs the sweep.
 */
import type { Client } from '@libsql/client';

import type { TranscribeJobStatus, TranscribeJobView, TranscribeRequest } from 'samwell-shared';

/** `naming` is Samwell reading the show notes; the app sees it as transcribing. */
export type JobStatus = 'queued' | 'transcribing' | 'naming' | 'ready' | 'failed' | 'expired';

export const ACTIVE_STATUSES: readonly JobStatus[] = ['queued', 'transcribing', 'naming'];

export const COLLECT_WINDOW_MS = 24 * 3_600_000;
export const RECOLLECT_WINDOW_MS = 3_600_000;
export const BOOKKEEPING_MS = 48 * 3_600_000;

export interface JobRow {
  id: string;
  accountId: string;
  episodeKey: string;
  usageEventId: string;
  plan: string;
  status: JobStatus;
  request: TranscribeRequest & { format: string };
  /** The seconds the job was priced and counted on. */
  durationSec: number;
  reservedCredits: number;
  startedAtMs: number | null;
  readyAtMs: number | null;
  collectedAtMs: number | null;
  resultJson: string | null;
  costUsd: number | null;
  audioSeconds: number | null;
  chargedCredits: number | null;
  error: string | null;
  createdAtMs: number;
}

const num = (value: unknown): number | null => (value == null ? null : Number(value));

function toRow(row: Record<string, unknown>): JobRow {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    episodeKey: String(row.episode_key),
    usageEventId: String(row.usage_event_id),
    plan: String(row.plan),
    status: String(row.status) as JobStatus,
    request: JSON.parse(String(row.request_json)),
    durationSec: Number(row.duration_sec),
    reservedCredits: Number(row.reserved_credits),
    startedAtMs: num(row.started_at_ms),
    readyAtMs: num(row.ready_at_ms),
    collectedAtMs: num(row.collected_at_ms),
    resultJson: row.result_json == null ? null : String(row.result_json),
    costUsd: num(row.cost_usd),
    audioSeconds: num(row.audio_seconds),
    chargedCredits: num(row.charged_credits),
    error: row.error == null ? null : String(row.error),
    createdAtMs: Number(row.created_at_ms),
  };
}

/**
 * How far along a job looks. Scribe says nothing until it is done, so while
 * it works this is time against a guess at how long the episode takes (half
 * a minute plus a thirtieth of its length; to be measured on real episodes),
 * held under 90% so the ring never claims a finish it has not seen.
 */
export function estimateProgress(row: Pick<JobRow, 'status' | 'startedAtMs' | 'durationSec'>, nowMs: number): number {
  if (row.status === 'ready') return 1;
  if (row.status === 'naming') return 0.95;
  if (row.status !== 'transcribing' || row.startedAtMs == null) return 0;
  const expectedMs = (30 + row.durationSec / 30) * 1_000;
  return Math.min(0.9, (0.9 * (nowMs - row.startedAtMs)) / expectedMs);
}

const VIEW_STATUS: Record<JobStatus, TranscribeJobStatus> = {
  queued: 'queued', transcribing: 'transcribing', naming: 'transcribing', ready: 'ready', failed: 'failed', expired: 'failed',
};

export function jobView(row: JobRow, nowMs: number): TranscribeJobView {
  const error = row.status === 'expired' ? 'expired' : row.status === 'failed' ? (row.error === 'audio_unreachable' ? 'audio_unreachable' : 'provider_failed') : undefined;
  return {
    jobId: row.id,
    episodeKey: row.episodeKey,
    status: VIEW_STATUS[row.status],
    progress: Math.round(estimateProgress(row, nowMs) * 100) / 100,
    ...(error ? { error } : {}),
  };
}

export function createTranscribeJobs(client: Client, now: () => number = () => Date.now()) {
  const select = async (sql: string, args: (string | number | null)[]): Promise<JobRow[]> =>
    (await client.execute({ sql, args })).rows.map((row) => toRow(row as Record<string, unknown>));
  const active = `status IN (${ACTIVE_STATUSES.map((s) => `'${s}'`).join(', ')})`;

  return {
    async ensureSchema(): Promise<void> {
      await client.batch(
        [
          `CREATE TABLE IF NOT EXISTS transcription_jobs (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            episode_key TEXT NOT NULL,
            usage_event_id TEXT NOT NULL,
            plan TEXT NOT NULL,
            status TEXT NOT NULL,
            request_json TEXT NOT NULL,
            duration_sec REAL NOT NULL,
            reserved_credits INTEGER NOT NULL,
            started_at_ms INTEGER,
            ready_at_ms INTEGER,
            collected_at_ms INTEGER,
            result_json TEXT,
            cost_usd REAL,
            audio_seconds REAL,
            charged_credits INTEGER,
            error TEXT,
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL
          )`,
          `CREATE INDEX IF NOT EXISTS transcription_jobs_account_idx
            ON transcription_jobs (account_id, created_at_ms)`,
        ],
        'write',
      );
    },

    async insert(job: Pick<JobRow, 'id' | 'accountId' | 'episodeKey' | 'usageEventId' | 'plan' | 'request' | 'durationSec' | 'reservedCredits'>): Promise<void> {
      const at = now();
      await client.execute({
        sql: `INSERT INTO transcription_jobs (id, account_id, episode_key, usage_event_id, plan, status,
                request_json, duration_sec, reserved_credits, created_at_ms, updated_at_ms)
              VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
        args: [job.id, job.accountId, job.episodeKey, job.usageEventId, job.plan, JSON.stringify(job.request), job.durationSec, job.reservedCredits, at, at],
      });
    },

    async get(id: string): Promise<JobRow | null> {
      return (await select('SELECT * FROM transcription_jobs WHERE id = ?', [id]))[0] ?? null;
    },

    /** A job of this account's, or null: another account's job is not found, never forbidden. */
    async find(accountId: string, id: string): Promise<JobRow | null> {
      return (await select('SELECT * FROM transcription_jobs WHERE id = ? AND account_id = ?', [id, accountId]))[0] ?? null;
    },

    async activeFor(accountId: string): Promise<JobRow | null> {
      return (await select(`SELECT * FROM transcription_jobs WHERE account_id = ? AND ${active} LIMIT 1`, [accountId]))[0] ?? null;
    },

    /** A job for this episode the phone can still use: running, or ready and waiting. */
    async reusableFor(accountId: string, episodeKey: string): Promise<JobRow | null> {
      return (
        await select(
          `SELECT * FROM transcription_jobs WHERE account_id = ? AND episode_key = ?
             AND (${active} OR (status = 'ready' AND result_json IS NOT NULL))
           ORDER BY created_at_ms DESC LIMIT 1`,
          [accountId, episodeKey],
        )
      )[0] ?? null;
    },

    /** Seconds of audio this account has sent in the last day, failures not counted. */
    async secondsToday(accountId: string): Promise<number> {
      const result = await client.execute({
        sql: `SELECT COALESCE(SUM(COALESCE(audio_seconds, duration_sec)), 0) AS seconds FROM transcription_jobs
              WHERE account_id = ? AND created_at_ms > ? AND status NOT IN ('failed', 'expired')`,
        args: [accountId, now() - 86_400_000],
      });
      return Number(result.rows[0]?.seconds ?? 0);
    },

    /** Unfinished or uncollected jobs, so a phone closed mid-job can pick its result up. */
    async pendingFor(accountId: string): Promise<JobRow[]> {
      return select(
        `SELECT * FROM transcription_jobs WHERE account_id = ? AND collected_at_ms IS NULL
           AND status <> 'expired' ORDER BY created_at_ms`,
        [accountId],
      );
    },

    async unfinished(): Promise<JobRow[]> {
      return select(`SELECT * FROM transcription_jobs WHERE ${active}`, []);
    },

    /** Moves an active job on. False when it is no longer active (stopped, or swept). */
    async advance(id: string, status: 'transcribing' | 'naming'): Promise<boolean> {
      const at = now();
      const result = await client.execute({
        sql: `UPDATE transcription_jobs SET status = ?, updated_at_ms = ?,
                started_at_ms = CASE WHEN ? = 'transcribing' THEN ? ELSE started_at_ms END
              WHERE id = ? AND ${active}`,
        args: [status, at, status, at, id],
      });
      return result.rowsAffected > 0;
    },

    async markReady(id: string, done: { resultJson: string; costUsd: number; audioSeconds: number }): Promise<boolean> {
      const at = now();
      const result = await client.execute({
        sql: `UPDATE transcription_jobs SET status = 'ready', result_json = ?, cost_usd = ?, audio_seconds = ?,
                ready_at_ms = ?, updated_at_ms = ? WHERE id = ? AND ${active}`,
        args: [done.resultJson, done.costUsd, done.audioSeconds, at, at, id],
      });
      return result.rowsAffected > 0;
    },

    async markFailed(id: string, status: 'failed' | 'expired', error: string): Promise<void> {
      await client.execute({
        sql: `UPDATE transcription_jobs SET status = ?, error = ?, result_json = NULL, updated_at_ms = ? WHERE id = ?`,
        args: [status, error, now(), id],
      });
    },

    /** Takes the right to charge a job, once. A second collect finds it taken. */
    async claimCharge(id: string, credits: number): Promise<boolean> {
      const result = await client.execute({
        sql: `UPDATE transcription_jobs SET charged_credits = ?, collected_at_ms = ?, updated_at_ms = ?
              WHERE id = ? AND status = 'ready' AND charged_credits IS NULL`,
        args: [credits, now(), now(), id],
      });
      return result.rowsAffected > 0;
    },

    async remove(id: string): Promise<void> {
      await client.execute({ sql: 'DELETE FROM transcription_jobs WHERE id = ?', args: [id] });
    },

    /** Ready jobs nobody collected inside the window: their holds are released by the caller. */
    async uncollected(): Promise<JobRow[]> {
      return select(`SELECT * FROM transcription_jobs WHERE status = 'ready' AND charged_credits IS NULL AND ready_at_ms <= ?`, [now() - COLLECT_WINDOW_MS]);
    },

    /** Drops collected transcripts after the re-collect window, and old bookkeeping. */
    async prune(): Promise<void> {
      const at = now();
      await client.batch(
        [
          { sql: 'UPDATE transcription_jobs SET result_json = NULL WHERE result_json IS NOT NULL AND collected_at_ms <= ?', args: [at - RECOLLECT_WINDOW_MS] },
          { sql: `DELETE FROM transcription_jobs WHERE created_at_ms <= ? AND NOT (${active})`, args: [at - BOOKKEEPING_MS] },
        ],
        'write',
      );
    },
  };
}

export type TranscribeJobs = ReturnType<typeof createTranscribeJobs>;
