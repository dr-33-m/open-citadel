import type { ChatClient, UIMessage } from '@tanstack/ai-client';

import { waitForConnection } from '@/lib/network';
import { retryDelayMs } from '@/utils/backoff';

/** Tries at one request before the turn gives up and says so. */
export const MAX_RESUMES_PER_REQUEST = 3;
/** How long to wait for a connection to come back before giving up on it. */
const WAIT_FOR_CONNECTION_MS = 30_000;
/** How long the dropped request may take to wind down. Normally a few ticks. */
const WIND_DOWN_MS = 5_000;
const WIND_DOWN_POLL_MS = 20;

/**
 * The one way into the client's continuation, which it keeps private.
 *
 * It is the method the client itself calls after a tool result, and it is the
 * right one here for the same reason: the conversation ends on a finished tool
 * call, and what is wanted is the model's next step from there.
 */
type Continuable = { checkForContinuation: () => Promise<void> };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

export type RequestResume = {
  /** A request is going out; this is the conversation it carries. */
  markStart: (messages: UIMessage[]) => void;
  /** The request in flight reached its end. */
  markFinished: () => void;
  /** The request in flight has had its last event (a finish or an error). */
  markSettled: () => void;
  canResume: () => boolean;
  /**
   * Waits (backing off, and for a connection), puts the conversation back to
   * how it was when the dropped request went out, and sends it again. False
   * when it could not: no connection came back, or the turn was stopped.
   */
  resume: (client: ChatClient, signal?: AbortSignal) => Promise<boolean>;
};

/**
 * Picks a turn up again after its connection dropped.
 *
 * A Samwell turn is a run of requests, one per tool call, and it used to be
 * as fragile as the weakest of them: a network hand-over in the middle of the
 * seventh ended the whole turn with "could not be reached", though the server
 * was still writing. Everything the turn has done is on the phone (the
 * messages, every tool's result), so the request that dropped can simply go
 * again from where it started. Nothing is redone but that one request.
 *
 * Expensify's apps make the same promise for their AI: a dropped connection
 * never loses the work. Theirs runs on their server and the phone catches up;
 * Samwell's tools run here, so here is where it picks up.
 */
export function createRequestResume(): RequestResume {
  let startedWith: UIMessage[] | null = null;
  let attempts = 0;
  let settled = false;

  /*
   * The client reports a failed request before it has worked through that
   * request's queued events, so sending again at once let the old request's
   * last words and its error land in the new one: half a sentence repeated,
   * and the same drop reported twice. Wait for its last event first.
   */
  async function windDown(client: ChatClient, signal?: AbortSignal): Promise<void> {
    const until = Date.now() + WIND_DOWN_MS;
    while ((!settled || client.getIsLoading()) && Date.now() < until && !signal?.aborted) {
      await sleep(WIND_DOWN_POLL_MS, signal);
    }
  }

  return {
    markStart(messages) {
      startedWith = messages;
      settled = false;
    },
    markSettled() {
      settled = true;
    },
    markFinished() {
      attempts = 0;
    },
    canResume() {
      return startedWith !== null && attempts < MAX_RESUMES_PER_REQUEST;
    },
    async resume(client, signal) {
      const messages = startedWith;
      if (!messages) return false;
      attempts += 1;
      await windDown(client, signal);
      await sleep(retryDelayMs(attempts), signal);
      if (signal?.aborted) return false;
      if (!(await waitForConnection({ timeoutMs: WAIT_FOR_CONNECTION_MS, signal }))) return false;
      if (signal?.aborted) return false;

      console.warn(`[Samwell Cloud] Connection dropped mid-turn; sending that request again (try ${attempts}).`);
      // The messages as they were, without whatever the dropped request had
      // half-written. The client's updates are immutable, so this array is
      // exactly what went out.
      client.setMessagesManually(messages);
      // Not awaited: the turn's own loop watches the request, as it does any.
      if (messages.at(-1)?.role === 'user') void client.reload();
      else void (client as unknown as Continuable).checkForContinuation();
      return true;
    },
  };
}
