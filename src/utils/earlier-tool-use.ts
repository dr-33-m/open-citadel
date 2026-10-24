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
 * The web is the exception, for the latest searches only: their pages are kept
 * with the reply (title, address, what matched), so they go back with it.
 * Without them he could not say where a fact he had found came from, and
 * withdrew facts the pages did support as unverified.
 *
 * Pure: types only from the outside, so it is tested on its own.
 */
import type { WebSource } from 'samwell-shared';

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
/** The most recent replies whose web pages go back with them. Older ones are searched again. */
const MAX_SOURCED_REPLIES = 2;
/** Pages under one reply, and how much of what each said. */
const MAX_SOURCES = 6;
const SNIPPET_CHARS = 300;

const PREAMBLE =
  'Your earlier replies in this conversation were grounded in your tools. Only your words are carried ' +
  'forward, not the tool calls or what they returned, so a fact in an earlier reply was checked even ' +
  'though you cannot see the lookup. Do not apologise for those replies or call them unchecked. If you ' +
  'need the details again, call the tool again. For your latest web searches, the pages they found are ' +
  'listed too, so you can say where a fact came from. What you did before each reply:';

function oneLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function sourceLine(source: WebSource): string {
  const snippet = oneLine(source.snippet, SNIPPET_CHARS);
  return `  - ${oneLine(source.title, 120)} (${source.url})${snippet ? `: ${snippet}` : ''}`;
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

interface Reply {
  asked: string | null;
  steps: TurnStep[];
  sources: readonly WebSource[];
}

function replyBlock({ asked, steps, sources }: Reply, withSources: boolean): string {
  const shown = steps.slice(0, MAX_STEPS).map(stepLine);
  const more = steps.length - shown.length;
  if (more > 0) shown.push(`- and ${more} more`);
  if (withSources && sources.length > 0) {
    shown.push('- the web pages those searches found:', ...sources.slice(0, MAX_SOURCES).map(sourceLine));
  }
  const heading = asked ? `Before your reply to "${asked}":` : 'Before an earlier reply:';
  return [heading, ...shown].join('\n');
}

/** The note for the turn about to be sent, or null when no earlier reply used a tool. */
export function earlierToolUseNote(history: readonly EarlierMessage[]): string | null {
  const replies: Reply[] = [];
  let asked: string | null = null;
  for (const message of history) {
    if (message.role === 'user') {
      asked = oneLine(message.content, QUESTION_CHARS) || null;
      continue;
    }
    if (message.role !== 'assistant') continue;
    // Still running is not a step he finished; a turn saved mid-way has none.
    const steps = (message.activity?.steps ?? []).filter((step) => step.status !== 'running');
    if (steps.length > 0) replies.push({ asked, steps, sources: message.activity?.sources ?? [] });
  }
  if (replies.length === 0) return null;
  const recent = replies.slice(-MAX_REPLIES);
  const sourced = recent.filter((reply) => reply.sources.length > 0).slice(-MAX_SOURCED_REPLIES);
  return [PREAMBLE, ...recent.map((reply) => replyBlock(reply, sourced.includes(reply)))].join('\n\n');
}
