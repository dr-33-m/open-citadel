import type { z } from 'zod';
import {
  CompassMorningTurnSchema,
  CompassNightTurnSchema,
  CompassSetupTurnSchema,
  type CompassMorningTurn,
  type CompassMorningTurnRequest,
  type CompassNightTurn,
  type CompassNightTurnRequest,
  type CompassSetupTurn,
  type CompassSetupTurnRequest,
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

type CompassCallArgs = {
  baseUrl: string;
  deviceId: string;
};

async function postCompass<T>(args: {
  baseUrl: string;
  deviceId: string;
  path: '/compass/setup' | '/compass/morning' | '/compass/night';
  body: unknown;
  schema: z.ZodType<T>;
}): Promise<T> {
  try {
    await preflightCloudServer(args.baseUrl);
  } catch (err) {
    throw new CompassApiError(
      'network',
      err instanceof Error ? err.message : 'Cannot reach Grand Maester Samwell.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
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
        : 'Cannot reach Grand Maester Samwell. Check your connection and try again.',
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
      "The engineer couldn't parse that report. Try rephrasing what happened.",
    );
  }
  if (!res.ok) {
    throw new CompassApiError('server', `Compass request failed (${res.status}).`);
  }

  const parsed = args.schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new CompassApiError(
      'analysis_failed',
      "The engineer couldn't parse that report. Try rephrasing what happened.",
    );
  }
  return parsed.data;
}

export function requestSetupTurn(
  args: CompassCallArgs & { body: CompassSetupTurnRequest },
): Promise<CompassSetupTurn> {
  return postCompass({ ...args, path: '/compass/setup', body: args.body, schema: CompassSetupTurnSchema });
}

export function requestMorningTurn(
  args: CompassCallArgs & { body: CompassMorningTurnRequest },
): Promise<CompassMorningTurn> {
  return postCompass({ ...args, path: '/compass/morning', body: args.body, schema: CompassMorningTurnSchema });
}

export function requestNightTurn(
  args: CompassCallArgs & { body: CompassNightTurnRequest },
): Promise<CompassNightTurn> {
  return postCompass({ ...args, path: '/compass/night', body: args.body, schema: CompassNightTurnSchema });
}
