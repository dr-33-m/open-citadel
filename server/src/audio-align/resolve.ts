/**
 * The exact copy of an episode an address serves, now.
 *
 * A feed's episode address is usually a chain of tracking redirects ending at
 * an ad server, which stitches ads into the episode for whoever asks and
 * redirects again to that copy's own address. Asked for its first byte, the
 * chain is followed without downloading the episode, and what comes back is
 * that copy's address and its length. Handing the transcriber that address,
 * and fingerprinting the same one, means both get the same sound: given the
 * feed's address, each would be served its own ads.
 */
import { audioIdentity, totalBytesOf } from 'samwell-shared';

import { openAudio, type OpenedAudio } from './safe-fetch.js';

const RESOLVE_TIMEOUT_MS = 20_000;

export interface ResolvedAudio {
  /** The copy's own address, where the redirects end. */
  url: string;
  /** Which copy it is (`audioIdentity`). */
  identity: string;
}

type Open = (url: string, options: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<OpenedAudio>;

const header = (value: string | string[] | undefined) => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

export async function resolveAudioUrl(url: string, options: { open?: Open } = {}): Promise<ResolvedAudio> {
  const open = options.open ?? openAudio;
  const opened = await open(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS) });
  // Only the address and the length are wanted, never the episode.
  opened.body.destroy();
  if (opened.status < 200 || opened.status >= 300) throw new Error(`The episode's host answered ${opened.status}.`);
  const total = totalBytesOf(header(opened.headers['content-range']), header(opened.headers['content-length']));
  return { url: opened.url, identity: audioIdentity(opened.url, total) };
}
