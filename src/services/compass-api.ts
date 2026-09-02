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

/** How long the stream may go quiet before it is treated as dead. */
const ANALYSIS_TIMEOUT_MS = 60_000;

/**
 * The plan turn gets a longer silence.
 *
 * A goal proposal is the largest structured output this app asks for — a goal
 * wrapping up to five trackables, each with its own schedule and measurement —
 * and the model reasons through all of it before writing a byte, so the quiet
 * stretch before the first delta is the longest of any turn. Giving up on it
 * at 60s and losing the conversation is a far worse failure than waiting
 * another half minute. Once the reply starts arriving this rearms on every
 * chunk, so it only ever measures a real stall.
 */
const PLAN_TIMEOUT_MS = 90_000;

type CompassCallArgs = {
  baseUrl: string;
  deviceId: string;
};

/** What the caller wants to know while the turn is still arriving. */
export interface CompassTurnHandlers {
  /** More of the model's reasoning, which arrives before the reply. */
  onThinkingDelta?: (delta: string) => void;
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
  /**
   * How long to wait with *nothing arriving* before giving up.
   *
   * An inactivity timeout, not a total one. `xhr.timeout` is a cap on the
   * whole request, and a Compass turn spends most of its time on hidden
   * reasoning before it writes a byte: a total cap kills the request mid-think,
   * the server's stream is cancelled under it, and the model finishes into a
   * socket nobody is holding. That is what "Controller is already closed" was.
   * Once bytes are flowing, the only question worth asking is whether they
   * have stopped.
   */
  idleMs: number;
  onEvent: (event: ReturnType<typeof decodeCompassEvents>['events'][number]) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    /** How much of `responseText` has already been turned into events. */
    let consumed = 0;
    let rest = '';
    let settled = false;

    let idle: ReturnType<typeof setTimeout> | null = null;
    const stopIdleTimer = () => {
      if (idle) clearTimeout(idle);
      idle = null;
    };
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      stopIdleTimer();
      fn();
    };
    const armIdleTimer = () => {
      stopIdleTimer();
      idle = setTimeout(() => {
        settle(() => {
          xhr.abort();
          reject(
            new CompassApiError(
              'network',
              'Samwell went quiet. Check your connection and try again.',
            ),
          );
        });
      }, args.idleMs);
    };

    const drain = () => {
      const chunk = xhr.responseText.slice(consumed);
      if (!chunk) return;
      consumed = xhr.responseText.length;
      armIdleTimer();
      const decoded = decodeCompassEvents(rest + chunk);
      rest = decoded.rest;
      for (const event of decoded.events) args.onEvent(event);
    };

    xhr.open('POST', args.url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('x-samwell-device-id', args.deviceId);

    xhr.onprogress = drain;
    // Some platforms deliver a response without ever firing `progress`. Drain
    // here too, or a whole turn is thrown away because it arrived at once.
    xhr.onloadend = drain;
    xhr.onload = () => {
      drain();
      settle(() => {
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
      });
    };
    xhr.onerror = () =>
      settle(() =>
        reject(
          new CompassApiError('network', 'Cannot reach Samwell. Check your connection and try again.'),
        ),
      );
    xhr.onabort = () =>
      settle(() => reject(new CompassApiError('network', 'The request was cancelled.')));

    armIdleTimer();
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
    idleMs: args.timeoutMs ?? ANALYSIS_TIMEOUT_MS,
    onEvent: (event) => {
      switch (event.type) {
        case 'thinking':
          args.handlers?.onThinkingDelta?.(event.delta);
          break;
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
