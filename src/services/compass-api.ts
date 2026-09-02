import type { z } from 'zod';
import {
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

async function postCompass<T>(args: {
  baseUrl: string;
  deviceId: string;
  path: '/compass/plan' | '/compass/checkin';
  body: unknown;
  schema: z.ZodType<T>;
  timeoutMs?: number;
}): Promise<T> {
  try {
    await preflightCloudServer(args.baseUrl);
  } catch (err) {
    throw new CompassApiError(
      'network',
      err instanceof Error ? err.message : 'Cannot reach Samwell.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? ANALYSIS_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${args.baseUrl}${args.path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-samwell-device-id': args.deviceId,
      },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new CompassApiError(
      'network',
      err instanceof Error && err.name === 'AbortError'
        ? 'The analysis timed out. Check your connection and try again.'
        : 'Cannot reach Samwell. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new CompassApiError(
      'usage_limit',
      'Compass has reached the current usage limit. Try again after the reset window.',
    );
  }
  if (res.status === 502) {
    throw new CompassApiError(
      'analysis_failed',
      "Samwell couldn't make sense of that. Try saying it a different way.",
    );
  }
  if (!res.ok) {
    throw new CompassApiError('server', `Compass request failed (${res.status}).`);
  }

  const parsed = args.schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new CompassApiError(
      'analysis_failed',
      "Samwell couldn't make sense of that. Try saying it a different way.",
    );
  }
  return parsed.data;
}

export function requestPlanTurn(
  args: CompassCallArgs & { body: CompassPlanTurnRequest },
): Promise<CompassPlanTurn> {
  return postCompass({
    ...args,
    path: '/compass/plan',
    body: args.body,
    schema: CompassPlanTurnSchema,
    timeoutMs: PLAN_TIMEOUT_MS,
  });
}

export function requestCheckinTurn(
  args: CompassCallArgs & { body: CompassCheckinTurnRequest },
): Promise<CompassCheckinTurn> {
  return postCompass({
    ...args,
    path: '/compass/checkin',
    body: args.body,
    schema: CompassCheckinTurnSchema,
  });
}
