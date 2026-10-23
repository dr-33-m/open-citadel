/**
 * What Samwell looked up before his earlier replies, said back to him.
 *
 * A cloud turn carries the conversation so far as words only: each earlier
 * reply goes back as its text, and the tool calls behind it do not (they are
 * kept, as `chat_messages.activity`, for the reader to see, not replayed). His
 * persona tells him never to claim a search he did not make, so on the next
 * turn he saw himself quoting highlights, shows and blogs with no lookup in
 * sight, and apologised for having made up facts he had in fact checked.
 *
 * Replaying the calls themselves would re-send every result on every turn,
 * stale by then, and some providers refuse a tool call without its exact
 * result beside it. One line a step, from what the reader already sees, is
 * enough for him to know the words were grounded, and that the way back to
 * the details is to call the tool again.
 *
 * Pure: types only from the outside, so it is tested on its own.
 */
import type { TurnActivity, TurnStep } from '@/utils/turn-activity';

export interface EarlierMessage {
  role: string;
  content: string;
  activity?: TurnActivity | null;
}

/** The most recent replies described. Older ones are far enough back to look up again. */
const MAX_REPLIES = 12;
/** Steps listed under one reply before the rest are counted. */
const MAX_STEPS = 8;
const QUESTION_CHARS = 80;

const PREAMBLE =
  'Your earlier replies in this conversation were grounded in your tools. Only your words are carried ' +
  'forward, not the tool calls or what they returned, so a fact in an earlier reply was checked even ' +
  'though you cannot see the lookup. Do not apologise for those replies or call them unchecked. If you ' +
  'need the details again, call the tool again. What you did before each reply:';

function question(content: string): string {
  const line = content.replace(/\s+/g, ' ').trim();
  return line.length > QUESTION_CHARS ? `${line.slice(0, QUESTION_CHARS - 1)}…` : line;
}

function stepLine(step: TurnStep): string {
  const outcome =
    step.status === 'failed'
      ? ' (it failed)'
      : step.status === 'declined'
        ? ' (the reader said no, so it did not run)'
        : step.detail
          ? ` (${step.detail})`
          : '';
  return `- ${step.tool}: ${step.title}${outcome}`;
}

function replyBlock(asked: string | null, steps: readonly TurnStep[]): string {
  const shown = steps.slice(0, MAX_STEPS).map(stepLine);
  const more = steps.length - shown.length;
  if (more > 0) shown.push(`- and ${more} more`);
  const heading = asked ? `Before your reply to "${asked}":` : 'Before an earlier reply:';
  return [heading, ...shown].join('\n');
}

/** The note for the turn about to be sent, or null when no earlier reply used a tool. */
export function earlierToolUseNote(history: readonly EarlierMessage[]): string | null {
  const blocks: string[] = [];
  let asked: string | null = null;
  for (const message of history) {
    if (message.role === 'user') {
      asked = question(message.content) || null;
      continue;
    }
    if (message.role !== 'assistant') continue;
    // Still running is not a step he finished; a turn saved mid-way has none.
    const steps = (message.activity?.steps ?? []).filter((step) => step.status !== 'running');
    if (steps.length > 0) blocks.push(replyBlock(asked, steps));
  }
  if (blocks.length === 0) return null;
  return [PREAMBLE, ...blocks.slice(-MAX_REPLIES)].join('\n\n');
}
