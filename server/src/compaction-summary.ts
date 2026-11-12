/**
 * The summary compaction carries forward: what it asks for, and what it reads.
 *
 * Modelled on pi's and opencode's checkpoints, which are written so another
 * agent could pick the work up. Samwell's work is a person rather than a
 * codebase, so the sections are what a friend would need to carry on the
 * conversation: what they came for, what they told him, what is settled, what
 * he pointed them to, what is still open, and what they said they would do.
 * Like both of theirs, the summary is updated rather than rewritten once one
 * exists, newer conversation wins, and the transcript is sent as tagged text
 * so the model summarises it instead of answering it.
 */
import type { ModelMessage } from '@tanstack/ai';
import { z } from 'zod';

import { contentText } from './compaction.js';
import { recordUsageEvent } from './db.js';
import { runStructuredAnalysis } from './structured-analysis.js';

const SECTIONS = `Use these sections, in this order, with these exact headings. Write "(none)" under any that has nothing.

## What they came for
- [what they are trying to understand, decide or do]

## What they told you
- [about themselves, their situation, what they value or are up against, as far as it matters here]

## Settled
- [conclusions you reached together and decisions they made, with the reason, so they are not argued again]

## What you pointed them to
- [each book, show, episode, post, page or person you suggested or discussed: the exact title, any reference marker exactly as written (such as [[book:...]]), what you found out about the source, and how they took it]

## Still open
- [their questions and requests not yet answered or done, in their own words, and anything you said you would come back to]

## They said they would
- [what they said they would do, with any time they gave]

## How to speak with them
- [tone, pace or style they asked for or answered well to]`;

const RULES = `Rules:
- Short single-line bullets, not paragraphs.
- Keep exact titles, names, numbers, dates and links. Copy a reference marker only as it appears in the conversation; never write one that is not there.
- Leave out greetings, small talk, and what no longer helps you carry on.
- Your reading of them is a reading: never present a guess as something they said.
- Never write down passwords, account numbers, addresses or phone numbers.
- Plain, simple English.`;

const OPENING = `You are Samwell, a self-development companion. The earlier part of a long conversation is about to leave your view, and you are writing yourself a note so you can carry on as if it had not. The conversation is in <conversation>, with their words marked [They] and yours [Samwell]. Do not continue it, answer anything in it, or call tools. Return only the note.`;

export const COMPACTION_SUMMARY_PROMPT = [OPENING, SECTIONS, RULES].join('\n\n');

export const COMPACTION_UPDATE_PROMPT = [
  OPENING,
  `<previous-note> is the note you wrote about the part before this one, and <conversation> is only what was said since. Return one note covering both. Newer conversation wins: move answered questions out of "Still open", take done or dropped items out of "They said they would", and drop what no longer helps. Keep everything else from the earlier note.`,
  SECTIONS,
  RULES,
].join('\n\n');

/** The most of one tool result the summariser reads, as in pi. */
const TOOL_RESULT_CLIP = 2_000;

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)} [${text.length - limit} more characters]` : text;
}

/**
 * The messages as one labelled transcript. Tool calls say which tool and with
 * what; their results are clipped, since a page or a search can be longer
 * than the whole conversation around it.
 */
export function serializeForSummary(messages: ModelMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = contentText(message).trim();
    if (message.role === 'tool') {
      if (text) lines.push(`[Result]: ${clip(text, TOOL_RESULT_CLIP)}`);
      continue;
    }
    const speaker = message.role === 'user' ? '[They]' : '[Samwell]';
    if (text) lines.push(`${speaker}: ${text}`);
    for (const call of message.toolCalls ?? []) {
      lines.push(`[Samwell looked up]: ${call.function.name}(${clip(call.function.arguments, 300)})`);
    }
  }
  return lines.join('\n\n');
}

/** What the summariser is sent: the prompt, and the request built for it. */
export function summaryRequest(
  messages: ModelMessage[],
  previous: string | null,
): { systemPrompt: string; content: string } {
  const conversation = `<conversation>\n${serializeForSummary(messages)}\n</conversation>`;
  return previous
    ? {
        systemPrompt: COMPACTION_UPDATE_PROMPT,
        content: `<previous-note>\n${previous}\n</previous-note>\n\n${conversation}`,
      }
    : { systemPrompt: COMPACTION_SUMMARY_PROMPT, content: conversation };
}

const CompactionSummarySchema = z.object({
  summary: z.string(),
});

/**
 * Summarise the turns compaction is about to drop, or fold them into the
 * summary already held.
 *
 * Metered but not counted against the reader's cap: this is machinery they did
 * not ask for, so it should not consume their quota, while still being
 * recorded because it costs real money. A failure here is not fatal:
 * `summarizeOldest` keeps what it had and the composed strategy falls through
 * to `evictOldest`.
 */
export async function summarizeForCompaction({
  dropped,
  previous,
  modelId,
  accountId,
}: {
  dropped: ModelMessage[];
  previous: string | null;
  modelId: string;
  accountId: string;
}): Promise<string> {
  const usageEventId = `compaction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await recordUsageEvent({
    id: usageEventId,
    accountId,
    modelId,
    countsTowardLimit: false,
    kind: 'compaction_summary',
  });

  const request = summaryRequest(dropped, previous);
  const result = await runStructuredAnalysis({
    modelId,
    systemPrompts: [request.systemPrompt],
    messages: [{ role: 'user', content: request.content }],
    schema: CompactionSummarySchema,
    usageEventId,
    // Seven short sections; one paragraph used to be asked for in 600.
    maxCompletionTokens: 1_200,
    failureCode: 'compaction_summary_failed',
  });

  return result.summary;
}
