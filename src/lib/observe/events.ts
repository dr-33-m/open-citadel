/**
 * Everything the app tells EAS Observe, by name. Pure.
 *
 * One list, so an event is spelled one way everywhere (Observe buckets
 * `post.open` and `post_open` apart) and so what leaves the phone can be read
 * in one place. The rule for every attribute: how the app behaved, never what
 * the reader reads, writes or follows. No titles, no addresses, no ids of
 * books or chats, no message text. Model ids, formats, durations and outcomes
 * only.
 */

/** How a piece of work ended. */
export type Outcome = 'done' | 'failed' | 'stopped';

export type ObserveEvent =
  /** One answer from Samwell, from the reader's send to his last word. */
  | {
      name: 'samwell.reply';
      attributes: {
        engine: 'device' | 'cloud';
        /** The brain's catalogue id (`qwen3-1.7b`, `anthropic/claude-…`): not the reader's. */
        model: string;
        /** Send to the first word on screen; null when none came. */
        firstTextMs: number | null;
        totalMs: number;
        /** Tools he called on the way. */
        tools: number;
        /** Length of the answer, a measure of the work, never its words. */
        chars: number;
        outcome: Outcome | 'limit';
      };
    }
  /** The phone's own brain loaded into memory, the wait before an on-device reply. */
  | { name: 'samwell.model_load'; attributes: { model: string; ms: number; outcome: Outcome } }
  /** A book, post or transcript opened in the reader, press to first page. */
  | { name: 'reader.open'; attributes: { kind: string; ms: number } }
  /** A blog post opened: where it went (`article-route.ts`) and how long it took. */
  | { name: 'post.open'; attributes: { to: 'reader' | 'site' | 'ask'; purpose: 'read' | 'listen' | 'chat'; ms: number } }
  /** How a summary-only blog is read, as the reader answered. */
  | { name: 'post.whole_posts'; attributes: { mode: 'site' | 'app' } }
  /** A file brought into the library. */
  | { name: 'book.import'; attributes: { format: string; ms: number; outcome: Outcome } }
  /** A transcript collected from the cloud. */
  | { name: 'transcript.collected'; attributes: { outcome: Outcome } }
  /** A purchase on the plans sheet. */
  | { name: 'billing.purchase'; attributes: { plan: string; outcome: Outcome } }
  /** The first run finished, from the conversation to the library. */
  | { name: 'onboarding.finished'; attributes: Record<string, never> }
  /** Feeds refreshed in the background or by a pull. */
  | { name: 'feeds.refresh'; attributes: { kind: 'blogs' | 'podcasts'; feeds: number; failed: number; ms: number } }
  /**
   * Why the app last died, as Android recorded it (`lib/exit-info`), sent on
   * the next launch: the out-of-memory kills and freezes Observe has no
   * crash reporting for.
   */
  | { name: 'app.previous_exit'; attributes: { cause: 'memory' | 'fault'; reason: number; status: number; pssMb: number } };

export type ObserveEventName = ObserveEvent['name'];

/** Severity by event: failures stand out in the dashboard's timeline. */
export function severityOf(event: ObserveEvent): 'info' | 'warn' | 'error' {
  if (event.name === 'app.previous_exit') return 'warn';
  const outcome = (event.attributes as { outcome?: string }).outcome;
  return outcome === 'failed' ? 'error' : 'info';
}

// File names have spaces in them ("My Diary.epub"), so a path runs to the
// end of its segment rather than stopping at the first space.
const FILE = /\b(?:file|content):\/\/[^\n'")]*/gi;
const PATH = /\/(?:storage|data|sdcard|var|private|Users)\/[^\n'")]*/g;
const URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'")]+/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * An error's message with what could name the reader or what they read taken
 * out: addresses (a feed, a file), paths (a book's file name) and emails. The
 * kind of failure survives, which is what is worth knowing.
 */
export function scrubMessage(message: string): string {
  return message.replace(FILE, '<path>').replace(PATH, '<path>').replace(URL, '<url>').replace(EMAIL, '<email>');
}

const NOT_A_FAULT = /network request failed|xhr request failed|aborted|cancelled|canceled|timed? ?out/i;

/**
 * Whether a failure is the phone's situation rather than the app's fault:
 * offline, a request that timed out, work the reader cancelled. Those are
 * said to the reader and are not reported, or the error list would be the
 * list of times people were on a train.
 */
export function isNotAFault(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return name === 'AbortError' || NOT_A_FAULT.test(message);
}

/** How one of Samwell's turns ended, from what the chat store knows at its end. */
export function replyOutcome(stopped: boolean, chars: number, limit = false): Outcome | 'limit' {
  if (limit) return 'limit';
  if (stopped) return 'stopped';
  return chars > 0 ? 'done' : 'failed';
}

/** Whole milliseconds since `start` (`performance.now()` or `Date.now()`, the same clock as `now`). */
export function elapsedMs(start: number, now: number): number {
  return Math.max(0, Math.round(now - start));
}
