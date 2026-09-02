import type { z } from 'zod';
import {
  decodeCompassEvents,
  CompassCheckinTurnSchema,
  CompassPlanTurnSchema,
  type CompassCheckinTurn,
  type CompassCheckinTurnRequest,
  type CompassPlanTurn,
  type CompassPlanTurnRequest,
} from 'samwell-shared';

import { preflightCloudServer } from './cloud-chat';

export type CompassApiErrorKind = 'usage_limit' | 'analysis_failed' | 'network' | 'server';

export class CompassApiError extends Error {
  kind: CompassApiErrorKind;

  constructor(kind: CompassApiErrorKind, message: string) {
    super(message);
    this.name = 'CompassApiError';
    this.kind = kind;
  }
}

const ANALYSIS_TIMEOUT_MS = 60_000;

/**
 * The plan turn gets longer.
 *
 * A goal proposal is the largest structured output this app asks for — a goal
 * wrapping up to five trackables, each with its own schedule and measurement —
 * and it is produced at the one moment the user is most invested, having just
 * talked through what they want. Timing that out at 60s and losing the
 * conversation is a far worse failure than waiting another half minute.
 */
const PLAN_TIMEOUT_MS = 90_000;

type CompassCallArgs = {
  baseUrl: string;
  deviceId: string;
};

/** What the caller wants to know while the turn is still arriving. */
export interface CompassTurnHandlers {
  /** More of Samwell's reply. Append it. */
  onReplyDelta?: (delta: string) => void;
  /**
   * Throw away the reply so far; a second attempt is starting.
   *
   * Only ever fires while the reply is unfinished, so what is discarded was
   * never a whole message. See `CompassStreamEvent`.
   */
  onRestart?: () => void;
}

/**
 * Read a newline-delimited stream over XHR.
 *
 * XHR rather than `fetch`, because React Native's `fetch` has no readable
 * response body on Android: `res.body` is undefined and the whole response
 * arrives at once, which is streaming in name only. `onprogress` with a
 * growing `responseText` is what the chat transport uses for the same reason.
 */
function streamNdjson(args: {
  url: string;
  deviceId: string;
  body: unknown;
  timeoutMs: number;
  onEvent: (event: ReturnType<typeof decodeCompassEvents>['events'][number]) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    /** How much of `responseText` has already been turned into events. */
    let consumed = 0;
    let rest = '';

    const drain = () => {
      const chunk = xhr.responseText.slice(consumed);
      if (!chunk) return;
      consumed = xhr.responseText.length;
      const decoded = decodeCompassEvents(rest + chunk);
      rest = decoded.rest;
      for (const event of decoded.events) args.onEvent(event);
    };

    xhr.open('POST', args.url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('x-samwell-device-id', args.deviceId);
    xhr.timeout = args.timeoutMs;

    xhr.onprogress = drain;
    xhr.onload = () => {
      drain();
      if (xhr.status === 429) {
        reject(
          new CompassApiError(
            'usage_limit',
            'Compass has reached the current usage limit. Try again after the reset window.',
          ),
        );
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new CompassApiError('server', `Compass request failed (${xhr.status}).`));
        return;
      }
      resolve();
    };
    xhr.onerror = () =>
      reject(
        new CompassApiError('network', 'Cannot reach Samwell. Check your connection and try again.'),
      );
    xhr.ontimeout = () =>
      reject(
        new CompassApiError(
          'network',
          'The analysis timed out. Check your connection and try again.',
        ),
      );
    xhr.onabort = () => reject(new CompassApiError('network', 'The request was cancelled.'));

    xhr.send(JSON.stringify(args.body));
  });
}

async function streamCompass<T>(args: {
  baseUrl: string;
  deviceId: string;
  path: '/compass/plan' | '/compass/checkin';
  body: unknown;
  schema: z.ZodType<T>;
  timeoutMs?: number;
  handlers?: CompassTurnHandlers;
}): Promise<T> {
  try {
    await preflightCloudServer(args.baseUrl);
  } catch (err) {
    throw new CompassApiError(
      'network',
      err instanceof Error ? err.message : 'Cannot reach Samwell.',
    );
  }

  let turn: unknown;
  let failure: CompassApiError | null = null;

  await streamNdjson({
    url: `${args.baseUrl}${args.path}`,
    deviceId: args.deviceId,
    body: args.body,
    timeoutMs: args.timeoutMs ?? ANALYSIS_TIMEOUT_MS,
    onEvent: (event) => {
      switch (event.type) {
        case 'reply':
          args.handlers?.onReplyDelta?.(event.delta);
          break;
        case 'restart':
          args.handlers?.onRestart?.();
          break;
        case 'done':
          turn = event.turn;
          break;
        case 'error':
          failure = new CompassApiError(
            event.code === 'usage_limit_reached' ? 'usage_limit' : 'analysis_failed',
            event.code === 'usage_limit_reached'
              ? 'Compass has reached the current usage limit. Try again after the reset window.'
              : "Samwell couldn't make sense of that. Try saying it a different way.",
          );
          break;
      }
    },
  });

  if (failure) throw failure;

  // The stream ended without a verdict: the connection dropped mid-turn.
  if (turn === undefined) {
    throw new CompassApiError('network', 'Samwell stopped mid-answer. Try again.');
  }

  const parsed = args.schema.safeParse(turn);
  if (!parsed.success) {
    throw new CompassApiError(
      'analysis_failed',
      "Samwell couldn't make sense of that. Try saying it a different way.",
    );
  }
  return parsed.data;
}

export function requestPlanTurn(
  args: CompassCallArgs & { body: CompassPlanTurnRequest; handlers?: CompassTurnHandlers },
): Promise<CompassPlanTurn> {
  return streamCompass({
    ...args,
    path: '/compass/plan',
    body: args.body,
    schema: CompassPlanTurnSchema,
    timeoutMs: PLAN_TIMEOUT_MS,
  });
}

export function requestCheckinTurn(
  args: CompassCallArgs & { body: CompassCheckinTurnRequest; handlers?: CompassTurnHandlers },
): Promise<CompassCheckinTurn> {
  return streamCompass({
    ...args,
    path: '/compass/checkin',
    body: args.body,
    schema: CompassCheckinTurnSchema,
  });
}
