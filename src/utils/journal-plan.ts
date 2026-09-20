import { formatTranscript } from '@/utils/transcript';

/**
 * Deciding what of a conversation Samwell's journal should read, and whether
 * now is the time. Pure, so the rules can be tested without a database.
 */

export type JournalMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  via?: 'cloud' | 'device' | null;
};

/**
 * A last message from the user this recent means a reply is probably still
 * on its way. Writing the conversation up now would read the question without
 * the answer, and move the watermark past it.
 */
export const REPLY_GRACE_MS = 3 * 60_000;
/**
 * Less than this from the user since the last write-up is not worth a call:
 * "thanks", "ok", "tell me more". The watermark still moves past it.
 */
export const MIN_USER_CHARS = 60;
const MAX_MESSAGE_CHARS = 3000;
/** Mirrors `JournalRequestSchema`'s caps, with room to spare. */
const MAX_CONVERSATION_CHARS = 15000;
const MAX_EARLIER_CHARS = 3500;

export type JournalPlan = {
  /** The `createdAt` of the last message this covers: the new watermark. */
  through: string;
  /** What to send, or null when there is nothing worth sending and the
   *  watermark should just move. */
  conversation: string | null;
  earlier: string;
};

/**
 * `fresh` is everything since the watermark and `before` the few messages
 * just ahead of it, both oldest first. Returns null to leave the session
 * alone for now.
 *
 * Only messages that went through the cloud are ever included. A turn held
 * with the on-device model is skipped, not sent, whatever mode the app is in
 * now: moving to cloud must not upload what was said while offline. The
 * watermark still moves past it, so it is never reconsidered.
 */
export function planJournalEntry({
  fresh,
  before,
  now,
  quietMs,
}: {
  fresh: JournalMessage[];
  before: JournalMessage[];
  now: number;
  quietMs: number;
}): JournalPlan | null {
  const last = fresh.at(-1);
  if (!last) return null;

  const idle = now - Date.parse(last.createdAt);
  if (idle < quietMs) return null;
  if (last.role === 'user' && idle < REPLY_GRACE_MS) return null;

  const cloud = fresh.filter((m) => m.via === 'cloud');
  const userChars = cloud
    .filter((m) => m.role === 'user')
    .reduce((sum, m) => sum + m.content.trim().length, 0);
  if (userChars < MIN_USER_CHARS) {
    return { through: last.createdAt, conversation: null, earlier: '' };
  }

  return {
    through: last.createdAt,
    conversation: fitFromEnd(cloud, MAX_CONVERSATION_CHARS),
    earlier: fitFromEnd(
      before.filter((m) => m.via === 'cloud'),
      MAX_EARLIER_CHARS,
    ),
  };
}

/**
 * The newest whole messages that fit, in order. A conversation too long to
 * send loses its opening rather than its end, since the end is where it
 * landed; and one very long message is clipped rather than crowding out the
 * rest.
 */
function fitFromEnd(messages: JournalMessage[], maxChars: number): string {
  const kept: string[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const content =
      message.content.length > MAX_MESSAGE_CHARS
        ? `${message.content.slice(0, MAX_MESSAGE_CHARS)}…`
        : message.content;
    const line = formatTranscript([{ role: message.role, content }]);
    if (used + line.length + 1 > maxChars) break;
    kept.unshift(line);
    used += line.length + 1;
  }
  return kept.join('\n');
}
