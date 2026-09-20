import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { JournalResponseSchema, type JournalNote, type JournalRequest } from 'samwell-shared';

import { db } from '@/db/client';
import { books, chatMessages, chatSessions } from '@/db/schema';
import { isToolCallMessage } from '@/services/chat-transcript';
import { cloudJsonHeaders } from '@/services/cloud-identity';
import { recentJourneyNoteTexts, saveJourneyReflection } from '@/services/journey';
import { useAccountStore } from '@/stores/account';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';
import { planJournalEntry, type JournalMessage } from '@/utils/journal-plan';

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
 * Crash-safe by construction. The watermark only moves once the notes are
 * saved, so a sweep cut off by the OS, or a request that failed, leaves the
 * session to be picked up by the next one. And it only ever reads forward:
 * nothing is written up twice.
 *
 * Cloud only, and only what already went to the cloud; see `planJournalEntry`.
 */

/** Only sessions touched this recently are considered. Also the ceiling on
 *  how far back a first run, on an install with history, will reach. */
const LOOKBACK_MS = 7 * 24 * 60 * 60_000;
const MAX_SESSIONS_CHECKED = 20;
/** Each is one cloud call; the rest wait for the next sweep. */
const MAX_WRITES_PER_SWEEP = 3;
/** Context from just before the watermark, so a continued conversation reads
 *  as a continuation. */
const EARLIER_MESSAGES = 4;
const EXISTING_NOTES = 12;

/** Thrown when the server says this account may not write, which will not
 *  change until the plan does. */
class JournalRefused extends Error {}

let running: Promise<void> | null = null;
/** Set on a refusal, cleared when the plan changes (see the hook). */
let refused = false;

export function resetJournalRefusal(): void {
  refused = false;
}

/**
 * Write up every recent conversation that has been quiet for `quietMs`.
 * Concurrent calls share the sweep already running.
 */
export function journalQuietChats(quietMs: number): Promise<void> {
  if (!running) {
    running = sweep(quietMs).finally(() => {
      running = null;
    });
  }
  return running;
}

async function sweep(quietMs: number): Promise<void> {
  const { samwellMode, cloudBaseUrl, cloudModelId } = useSettingsStore.getState();
  if (refused || samwellMode !== 'cloud' || !cloudBaseUrl) return;
  if (useAccountStore.getState().status !== 'signedIn') return;
  if (!useSubscriptionStore.getState().plan) return;

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const sessions = db
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
        // Nothing touched since the last write-up is skipped here, in SQL,
        // rather than by reading its messages to find there are none.
        or(isNull(chatSessions.journaledAt), gt(chatSessions.updatedAt, chatSessions.journaledAt)),
      ),
    )
    .orderBy(desc(chatSessions.updatedAt))
    .limit(MAX_SESSIONS_CHECKED)
    .all();

  let writes = 0;
  for (const session of sessions) {
    if (writes >= MAX_WRITES_PER_SWEEP) return;

    const fresh = readSpoken(session.id, { after: session.journaledAt });
    if (fresh.length === 0) continue;
    const plan = planJournalEntry({
      fresh,
      before: session.journaledAt ? readSpoken(session.id, { upTo: session.journaledAt }) : [],
      now: Date.now(),
      quietMs,
    });
    if (!plan) continue;

    if (plan.conversation) {
      writes += 1;
      let notes: JournalNote[];
      try {
        notes = await requestJournalNotes(cloudBaseUrl, {
          surface: session.kind,
          bookTitle: session.bookId ? (bookTitle(session.bookId)?.slice(0, 300) ?? null) : null,
          earlier: plan.earlier,
          conversation: plan.conversation,
          // Capped to what the route accepts; a note is rarely near it.
          existingNotes: recentJourneyNoteTexts(EXISTING_NOTES).map((t) => t.slice(0, 1000)),
          modelId: cloudModelId ?? undefined,
        });
      } catch (error) {
        if (error instanceof JournalRefused) refused = true;
        // Offline, a timeout, a 5xx: stop here and let the next sweep retry.
        // The watermark has not moved, so nothing is lost.
        console.warn('[Journal] write-up failed', error);
        return;
      }
      // Deleted while the request was out: they did not want it kept.
      if (!sessionExists(session.id)) continue;
      for (const note of notes) {
        saveJourneyReflection(note.text, `chat:${session.id}`, note.tags);
      }
    }

    db.update(chatSessions)
      .set({ journaledAt: plan.through })
      .where(eq(chatSessions.id, session.id))
      .run();
  }
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

async function requestJournalNotes(
  cloudBaseUrl: string,
  payload: JournalRequest,
): Promise<JournalNote[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(`${cloudBaseUrl}/journey/notes`, {
      method: 'POST',
      headers: await cloudJsonHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  // No plan. A 401 is not here: a token that lapsed is refreshed by the next
  // request's headers, so it is an ordinary failure and the next sweep retries.
  if (res.status === 402 || res.status === 403) {
    throw new JournalRefused(`Journal refused (${res.status}).`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Journal failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const parsed = JournalResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error('Journal response did not match.');
  return parsed.data.notes;
}
