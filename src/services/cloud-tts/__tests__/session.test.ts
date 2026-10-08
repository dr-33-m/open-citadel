import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The session against a fake server and a fake cache: what is under test is
 * which sentence is fetched when, what Readium is handed, and what happens
 * when a fetch fails. The network and the disk are the two things replaced.
 */

type StreamOptions = {
  text: string;
  signal: AbortSignal;
  onFormat: (format: { kind: 'pcm' | 'mp3'; sampleRate: number; channels: number }) => void;
  onBytes: (bytes: Uint8Array) => void;
};

const calls: StreamOptions[] = [];
let behaviour: (options: StreamOptions) => Promise<void>;
type Cached = { kind: 'pcm'; samples: Float32Array; sampleRate: number } | { kind: 'mp3'; bytes: Uint8Array };
const cache = new Map<string, Cached>();

vi.mock('@/services/cloud-tts/request', () => {
  class CloudVoiceError extends Error {
    constructor(
      readonly failure: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    CloudVoiceError,
    streamPiece: (options: StreamOptions) => {
      calls.push(options);
      return behaviour(options);
    },
  };
});

vi.mock('@/services/cloud-tts/audio-cache', () => ({
  readCachedPiece: async (key: string) => cache.get(key) ?? null,
  writeCachedPiece: async () => undefined,
}));

const { CloudVoiceSession } = await import('@/services/cloud-tts/session');
const { CloudVoiceError } = (await import('@/services/cloud-tts/request')) as unknown as {
  CloudVoiceError: new (failure: string, message: string) => Error;
};
const { pieceCacheKey } = await import('@/services/cloud-tts/cache-key');

const CHOICE = { modelId: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: null, maxCharacters: 1_500, format: 'pcm' as const };
const MP3_CHOICE = { ...CHOICE, format: 'mp3' as const };
const RATE = 24_000;

/** A second of audio, in two network chunks, the first ending mid-sample. */
function speakOneSecond(options: StreamOptions): Promise<void> {
  options.onFormat({ kind: 'pcm', sampleRate: RATE, channels: 1 });
  const bytes = new Uint8Array(RATE * 2);
  options.onBytes(bytes.slice(0, 1001));
  options.onBytes(bytes.slice(1001));
  return Promise.resolve();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A sentence in MP3, as three network chunks. */
function speakMp3(options: StreamOptions): Promise<void> {
  options.onFormat({ kind: 'mp3', sampleRate: RATE, channels: 1 });
  for (const size of [400, 300, 200]) options.onBytes(new Uint8Array(size));
  return Promise.resolve();
}

function makeSession() {
  const provided: { requestId: string; samples: number; isLast: boolean }[] = [];
  const encoded: { requestId: string; bytes: number; mimeType: string; isLast: boolean }[] = [];
  const failures: { requestId: string; failure: string }[] = [];
  const waiting: boolean[] = [];
  const session = new CloudVoiceSession('book-1', {
    provide: (requestId, samples, _rate, isLast) => provided.push({ requestId, samples: samples.byteLength / 4, isLast }),
    provideEncoded: (requestId, data, mimeType, isLast) => encoded.push({ requestId, bytes: data.byteLength, mimeType, isLast }),
    onFailure: (requestId, failure) => failures.push({ requestId, failure }),
    onWaiting: (value) => waiting.push(value),
  });
  return { session, provided, encoded, failures, waiting };
}

beforeEach(() => {
  calls.length = 0;
  cache.clear();
  behaviour = speakOneSecond;
});

describe('CloudVoiceSession', () => {
  it('hands the audio on as it arrives, every sample of it, and ends the sentence once', async () => {
    const { session, provided, waiting } = makeSession();
    session.request('r1', 'It was late.', CHOICE);
    await flush();
    expect(provided.reduce((sum, p) => sum + p.samples, 0)).toBe(RATE);
    expect(provided.filter((p) => p.isLast)).toHaveLength(1);
    expect(provided.at(-1)?.isLast).toBe(true);
    expect(waiting[0]).toBe(true);
    expect(waiting.at(-1)).toBe(false);
  });

  it('plays a sentence heard before from the phone, without asking the server', async () => {
    const key = pieceCacheKey({ bookId: 'book-1', modelId: CHOICE.modelId, voice: CHOICE.voice, speed: null, text: 'It was late.' });
    cache.set(key, { kind: 'pcm', samples: new Float32Array(100), sampleRate: RATE });
    const { session, provided } = makeSession();
    session.request('r1', 'It was late.', CHOICE);
    await flush();
    expect(calls).toHaveLength(0);
    expect(provided).toEqual([{ requestId: 'r1', samples: 100, isLast: true }]);
  });

  it('fetches the next sentence ahead, and answers its request from that fetch', async () => {
    const { session, provided } = makeSession();
    session.utterance('The door opened. Nobody came in.', CHOICE);
    await flush();
    expect(calls.map((call) => call.text)).toEqual(['The door opened.', 'Nobody came in.']);
    session.request('r2', 'The door opened.', CHOICE);
    await flush();
    expect(calls).toHaveLength(2);
    expect(provided.filter((p) => p.requestId === 'r2' && p.isLast)).toHaveLength(1);
  });

  it('never has more than two fetches open, and the awaited sentence goes first', async () => {
    const gates: (() => void)[] = [];
    behaviour = (options) =>
      new Promise((resolve) => {
        gates.push(() => {
          void speakOneSecond(options).then(resolve);
        });
      });
    const { session } = makeSession();
    session.utterance('One. Two.', CHOICE);
    await flush();
    session.request('r0', 'Zero.', CHOICE);
    await flush();
    expect(calls.map((call) => call.text)).toEqual(['One.', 'Two.']);
    gates.shift()?.();
    await flush();
    expect(calls.map((call) => call.text)).toEqual(['One.', 'Two.', 'Zero.']);
  });

  it('fetches what Readium says comes next, across paragraphs, and stops guessing', async () => {
    const { session, provided } = makeSession();
    session.upcoming(['The end of one.', 'The start of the next.', 'And a third.'], CHOICE);
    await flush();
    expect(calls.map((call) => call.text)).toEqual(['The end of one.', 'The start of the next.']);
    session.utterance('Guessed here. Never fetched.', CHOICE);
    await flush();
    expect(calls).toHaveLength(2);
    session.request('r1', 'The end of one.', CHOICE);
    await flush();
    expect(calls).toHaveLength(2);
    expect(provided.filter((p) => p.requestId === 'r1' && p.isLast)).toHaveLength(1);
  });

  it('hands MP3 over as it lands, for the native player to decode, and ends it once', async () => {
    behaviour = speakMp3;
    const { session, provided, encoded, waiting } = makeSession();
    session.request('r1', 'It was late.', MP3_CHOICE);
    await flush();
    expect(provided).toEqual([]);
    expect(encoded.map((e) => e.bytes)).toEqual([400, 300, 200, 0]);
    expect(encoded.map((e) => e.isLast)).toEqual([false, false, false, true]);
    expect(encoded.every((e) => e.mimeType === 'audio/mpeg')).toBe(true);
    expect(waiting.at(-1)).toBe(false);
  });

  it('replays an MP3 fetched ahead, whole, when its request comes', async () => {
    behaviour = speakMp3;
    const { session, encoded } = makeSession();
    session.upcoming(['It was late.'], MP3_CHOICE);
    await flush();
    session.request('r1', 'It was late.', MP3_CHOICE);
    await flush();
    expect(calls).toHaveLength(1);
    expect(encoded.reduce((sum, e) => sum + e.bytes, 0)).toBe(900);
    expect(encoded.filter((e) => e.isLast)).toHaveLength(1);
  });

  it('plays an MP3 heard before from the phone, in one piece', async () => {
    const key = pieceCacheKey({ bookId: 'book-1', modelId: CHOICE.modelId, voice: CHOICE.voice, speed: null, text: 'It was late.' });
    cache.set(key, { kind: 'mp3', bytes: new Uint8Array(512) });
    const { session, encoded } = makeSession();
    session.request('r1', 'It was late.', MP3_CHOICE);
    await flush();
    expect(calls).toHaveLength(0);
    expect(encoded).toEqual([{ requestId: 'r1', bytes: 512, mimeType: 'audio/mpeg', isLast: true }]);
  });

  it('tries a failing maker once more in silence before saying anything', async () => {
    let attempts = 0;
    behaviour = (options) => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new CloudVoiceError('maker_failed', 'boom')) : speakOneSecond(options);
    };
    const { session, provided, failures } = makeSession();
    session.request('r1', 'It was late.', CHOICE);
    await flush();
    await flush();
    expect(attempts).toBe(2);
    expect(failures).toEqual([]);
    expect(provided.at(-1)?.isLast).toBe(true);
  });

  it('holds the sentence and says why when the Neurons run out, and answers it after a retry', async () => {
    behaviour = () => Promise.reject(new CloudVoiceError('out_of_credits', '402'));
    const { session, provided, failures } = makeSession();
    session.request('r1', 'It was late.', CHOICE);
    await flush();
    expect(failures).toEqual([{ requestId: 'r1', failure: 'out_of_credits' }]);
    expect(provided).toEqual([]);

    behaviour = speakOneSecond;
    session.retry('r1');
    await flush();
    expect(provided.at(-1)).toMatchObject({ requestId: 'r1', isLast: true });
  });

  it('still ends a sentence the maker answered with nothing', async () => {
    behaviour = () => Promise.resolve();
    const { session, provided, waiting } = makeSession();
    session.request('r1', 'It was late.', CHOICE);
    await flush();
    expect(provided).toEqual([{ requestId: 'r1', samples: 0, isLast: true }]);
    expect(waiting.at(-1)).toBe(false);
  });

  it('stops every fetch when the book is put away', async () => {
    behaviour = (options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const { session, failures } = makeSession();
    session.request('r1', 'It was late.', CHOICE);
    await flush();
    session.dispose();
    await flush();
    expect(calls[0].signal.aborted).toBe(true);
    expect(failures).toEqual([]);
  });
});
