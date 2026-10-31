import { and, asc, desc, eq, exists, gt, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { JournalResponseSchema, type JournalNote, type JournalRequest } from 'samwell-shared';

import { db } from '@/db/client';
import { books, chatMessages, chatSessions } from '@/db/schema';
import { hasCloudIdentity } from '@/hooks/use-cloud-identity';
import { isToolCallMessage } from '@/services/chat-transcript';
import { cloudJsonHeaders } from '@/services/cloud-identity';
import { recentJourneyNoteTexts, saveJourneyReflection } from '@/services/journey';
import { JournalRefused, JournalRejected, sweepJournal, type JournalStrikes, type SweepSession } from '@/services/journey-sweep';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';
import type { JournalMessage } from '@/utils/journal-plan';

/**
 * Samwell's journal: after a conversation goes quiet, he writes down what is
 * worth remembering about the person, and `search_journey` finds it in any
 * later chat, on either surface.
 *
 * It runs as a sweep rather than on a "conversation ended" event, because
 * there is no such event: people leave a chat by switching screens, locking
 * the phone or killing the app. So on the way to the background, and on the
 * way back, the recent sessions are checked for anything said since the last
 * write-up (`chat_sessions.journaled_at`) that has gone quiet.
 *
 * Crash-safe by construction. The watermark moves in the same transaction as
 * the notes are saved, so a sweep cut off by the OS, or a request that failed, leaves the
 * session to be picked up by the next one. And it only ever reads forward:
 * nothing is written up twice.
 *
 * Cloud only, and only what already went to the cloud; see `planJournalEntry`.
 * Which conversations are written up, and when a sweep stops, is
 * `journey-sweep`; this file is its database and its request.
 */

/**
 * Only sessions touched this recently are considered. Wide on purpose: a chat
 * can wait a long while for a plan (an onboarding held weeks before buying one),
 * and past this it is never written up unless it is opened again.
 */
const LOOKBACK_MS = 90 * 24 * 60 * 60_000;
const MAX_SESSIONS_CHECKED = 20;
/** Context from just before the watermark, so a continued conversation reads
 *  as a continuation. */
const EARLIER_MESSAGES = 4;
const EXISTING_NOTES = 12;
/** Anything longer is a stalled request. Covers asking for the token and reading the answer too. */
const REQUEST_DEADLINE_MS = 45_000;

let running: Promise<void> | null = null;
/** A sweep asked for while one ran, and how quiet it would have settled for. */
let wanted: number | null = null;
/** Set on a refusal, cleared when the plan changes (see the hook). */
let refused = false;
const strikes: JournalStrikes = new Map();

export function resetJournalRefusal(): void {
  refused = false;
}

/**
 * Write up every recent conversation that has been quiet for `quietMs`. One
 * sweep at a time; asked again meanwhile, another follows it, since the one
 * running may have left alone what this one came for (the chat just left, on
 * the way to the background).
 */
export function journalQuietChats(quietMs: number): Promise<void> {
  if (running) {
    wanted = Math.min(wanted ?? quietMs, quietMs);
    return running;
  }
  running = sweep(quietMs).finally(() => {
    running = null;
    const next = wanted;
    wanted = null;
    if (next !== null) void journalQuietChats(next);
  });
  return running;
}

async function sweep(quietMs: number): Promise<void> {
  const { samwellMode, cloudBaseUrl, cloudModelId } = useSettingsStore.getState();
  if (refused || samwellMode !== 'cloud' || !cloudBaseUrl) return;
  // An account or a guest who bought a plan: whoever paid is written up.
  if (!hasCloudIdentity()) return;
  if (!useSubscriptionStore.getState().plan) return;

  const outcome = await sweepJournal(
    {
      sessions: readWaitingSessions,
      fresh: (session) => readSpoken(session.id, { after: session.journaledAt }),
      before: (session) => (session.journaledAt ? readSpoken(session.id, { upTo: session.journaledAt }) : []),
      exists: sessionExists,
      commit: commitWriteUp,
      request: (session, plan) =>
        requestJournalNotes(cloudBaseUrl, {
          surface: session.kind,
          bookTitle: session.bookId ? (bookTitle(session.bookId)?.slice(0, 300) ?? null) : null,
          earlier: plan.earlier,
          conversation: plan.conversation ?? '',
          // Capped to what the route accepts; a note is rarely near it.
          existingNotes: recentJourneyNoteTexts(EXISTING_NOTES).map((t) => t.slice(0, 1000)),
          modelId: cloudModelId ?? undefined,
        }),
    },
    { quietMs, now: Date.now(), strikes },
  );
  if (outcome.refused) refused = true;
}

/**
 * Newest first, and only those with something said past their watermark.
 *
 * Asked of the messages, not of `updatedAt`: that is stamped a moment after the
 * last message, so it is always past the watermark, and a chat already written
 * up went on taking one of these slots.
 */
function readWaitingSessions(): SweepSession[] {
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  return db
    .select({
      id: chatSessions.id,
      kind: chatSessions.kind,
      bookId: chatSessions.bookId,
      journaledAt: chatSessions.journaledAt,
    })
    .from(chatSessions)
    .where(
      and(
        gte(chatSessions.updatedAt, since),
        exists(
          db
            .select({ id: chatMessages.id })
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.sessionId, chatSessions.id),
                inArray(chatMessages.role, ['user', 'assistant']),
                or(isNull(chatSessions.journaledAt), gt(chatMessages.createdAt, chatSessions.journaledAt)),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(chatSessions.updatedAt))
    .limit(MAX_SESSIONS_CHECKED)
    .all();
}

/** Together: cut off between the two, the notes would be written again by the next sweep. */
function commitWriteUp(sessionId: string, notes: JournalNote[], through: string): void {
  db.transaction(() => {
    for (const note of notes) saveJourneyReflection(note.text, `chat:${sessionId}`, note.tags);
    db.update(chatSessions).set({ journaledAt: through }).where(eq(chatSessions.id, sessionId)).run();
  });
}

/**
 * The things actually said in a session, oldest first, on one side of the
 * watermark. System and tool rows are scaffolding and never read.
 *
 * `upTo` is the context just before the watermark, so it reads only the last
 * few rows (newest first, then flipped) rather than a long chat's whole
 * history on every sweep. Over-fetched a little, since tool-call rows are
 * dropped after the query.
 */
function readSpoken(
  sessionId: string,
  bound: { after: string | null } | { upTo: string },
): JournalMessage[] {
  const before = 'upTo' in bound;
  const edge = before
    ? lte(chatMessages.createdAt, bound.upTo)
    : bound.after
      ? gt(chatMessages.createdAt, bound.after)
      : undefined;
  const rows = db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
      via: chatMessages.via,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.sessionId, sessionId),
        inArray(chatMessages.role, ['user', 'assistant']),
        edge,
      ),
    )
    .orderBy(before ? desc(chatMessages.createdAt) : asc(chatMessages.createdAt))
    // -1 is SQLite's "no limit".
    .limit(before ? EARLIER_MESSAGES * 3 : -1)
    .all()
    .filter((row) => !isToolCallMessage(row.content))
    .map((row) => ({
      role: row.role as JournalMessage['role'],
      content: row.content,
      createdAt: row.createdAt,
      via: row.via,
    }));
  return before ? rows.slice(0, EARLIER_MESSAGES).reverse() : rows;
}

function bookTitle(bookId: string): string | null {
  return (
    db.select({ title: books.title }).from(books).where(eq(books.id, bookId)).get()?.title ??
    null
  );
}

function sessionExists(sessionId: string): boolean {
  return !!db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .get();
}

async function requestJournalNotes(cloudBaseUrl: string, payload: JournalRequest): Promise<JournalNote[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced rather than only aborted: an abort reaches the fetch, not the token
  // being asked for ahead of it, and a sweep left waiting stops every later one.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Journal request timed out.'));
    }, REQUEST_DEADLINE_MS);
  });
  try {
    return await Promise.race([postJournal(cloudBaseUrl, payload, controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function postJournal(cloudBaseUrl: string, payload: JournalRequest, signal: AbortSignal): Promise<JournalNote[]> {
  const res = await fetch(`${cloudBaseUrl}/journey/notes`, {
    method: 'POST',
    headers: await cloudJsonHeaders(),
    body: JSON.stringify(payload),
    signal,
  });

  // No plan. A 401 is not here: a token that lapsed is refreshed by the next
  // request's headers, so it is an ordinary failure and the next sweep retries.
  if (res.status === 402 || res.status === 403) {
    throw new JournalRefused(`Journal refused (${res.status}).`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const message = `Journal failed (${res.status}): ${detail.slice(0, 200)}`;
    // About who is asking or how often, not about this conversation.
    if (res.status === 401 || res.status === 408 || res.status === 429) throw new Error(message);
    throw new JournalRejected(message);
  }
  const parsed = JournalResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new JournalRejected('Journal response did not match.');
  return parsed.data.notes;
}
