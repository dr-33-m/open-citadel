/**
 * An episode's fingerprint, from its address or from a stream of its bytes.
 *
 * The episode is fetched here (`safe-fetch.ts`, every hop checked) and piped
 * into ffmpeg, which may read only its pipe: it never touches the network
 * itself. ffmpeg decodes to 8 kHz mono and the fingerprint is made as the
 * samples stream out, so the episode is never held in memory or written to
 * disk. ffmpeg is already on the server for the voices (`tts-encode.ts`).
 */
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

import { createFingerprinter, FINGERPRINT_SAMPLE_RATE } from './fingerprint.js';
import { openAudio } from './safe-fetch.js';

/** Long enough for a three-hour episode on a slow host; past it the work is given up. */
const DECODE_TIMEOUT_MS = 3 * 60_000;
/** Nothing an app plays is longer. Stops a stream that never ends. */
const MAX_SECONDS = 4 * 3600;

/** The fingerprint of whatever audio `source` streams. */
async function fingerprintStream(source: Readable, options: { signal?: AbortSignal }): Promise<Uint32Array> {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-protocol_whitelist', 'pipe',
      '-i', 'pipe:0',
      '-t', String(MAX_SECONDS),
      '-vn',
      '-ac', '1',
      '-ar', String(FINGERPRINT_SAMPLE_RATE),
      '-f', 'f32le',
      'pipe:1',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const fingerprinter = createFingerprinter();
  let carry = Buffer.alloc(0);
  let errors = '';
  source.on('error', () => ffmpeg.kill('SIGKILL'));
  // ffmpeg stops reading once it has its `-t`, or on a bad file: that is not
  // a failure of the source.
  ffmpeg.stdin.on('error', () => undefined);
  source.pipe(ffmpeg.stdin);
  ffmpeg.stdout.on('data', (chunk: Buffer) => {
    const bytes = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
    const whole = bytes.length - (bytes.length % 4);
    // Copied: a Buffer's offset need not be 4-aligned for a Float32Array view.
    fingerprinter.push(new Float32Array(new Uint8Array(bytes.subarray(0, whole)).buffer));
    carry = Buffer.from(bytes.subarray(whole));
  });
  ffmpeg.stderr.on('data', (chunk: Buffer) => {
    if (errors.length < 2_000) errors += chunk.toString();
  });
  const stop = () => {
    ffmpeg.kill('SIGKILL');
    source.destroy();
  };
  const timer = setTimeout(stop, DECODE_TIMEOUT_MS);
  options.signal?.addEventListener('abort', stop, { once: true });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      ffmpeg.on('error', reject);
      ffmpeg.on('close', resolve);
    });
    if (options.signal?.aborted) throw new Error('Stopped.');
    if (code !== 0) throw new Error(`ffmpeg could not decode the episode (${code}): ${errors.trim().slice(0, 300)}`);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', stop);
    source.destroy();
  }
  return fingerprinter.finish();
}

/** The fingerprint of the episode at `url`. */
export async function fingerprintAudio(url: string, options: { signal?: AbortSignal } = {}): Promise<Uint32Array> {
  const opened = await openAudio(url, { signal: options.signal });
  if (opened.status < 200 || opened.status >= 300) {
    opened.body.destroy();
    throw new Error(`The episode's host answered ${opened.status}.`);
  }
  return fingerprintStream(opened.body, options);
}
