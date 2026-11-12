/**
 * One of Samwell's answers, timed for EAS Observe (`samwell.reply`): how long
 * until his first word, how long in all, how many tools, and how it ended.
 * The wait a reader feels most, split by engine and brain, so a slow model or
 * a slow server shows up as a number rather than a complaint.
 */
import { startTimer, track } from '@/lib/observe';
import type { Outcome } from '@/lib/observe/events';

export interface ReplyMetric {
  /** Words reached the screen; only the first call counts. */
  text(): void;
  /** He called a tool. */
  tool(): void;
  /** How many tools he called, when that is only known at the end (on the phone). */
  tools(count: number): void;
  /** The turn is over. */
  end(outcome: Outcome | 'limit', chars: number): void;
}

export function startReplyMetric(engine: 'device' | 'cloud', model: string | null | undefined): ReplyMetric {
  const elapsed = startTimer();
  let firstTextMs: number | null = null;
  let tools = 0;
  let ended = false;
  return {
    text() {
      if (firstTextMs === null) firstTextMs = elapsed();
    },
    tool() {
      tools += 1;
    },
    tools(count) {
      tools = count;
    },
    end(outcome, chars) {
      if (ended) return;
      ended = true;
      track({
        name: 'samwell.reply',
        attributes: { engine, model: model || 'unknown', firstTextMs, totalMs: elapsed(), tools, chars, outcome },
      });
    },
  };
}
