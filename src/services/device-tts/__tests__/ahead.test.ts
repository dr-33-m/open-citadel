import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The prefetch against a fake engine that behaves as the real one does where
 * it matters: one sentence at a time, chunks as they are made, and a stop
 * that ends the running sentence as if it had finished.
 */

type Run = { text: string; push: (count: number) => void; finish: () => void; fail: () => void };

const runs: Run[] = [];
let stops = 0;

vi.mock('@/services/device-tts/engine', () => ({
  stop: () => {
    stops += 1;
    runs.at(-1)?.finish();
  },
  synthesize: (text: string) => {
    const made: number[] = [];
    let ended: 'done' | 'failed' | null = null;
    let wake: (() => void) | null = null;
    const poke = () => {
      wake?.();
      wake = null;
    };
    runs.push({
      text,
      push: (count) => {
        for (let i = 0; i < count; i++) made.push(i);
        poke();
      },
      finish: () => {
        ended ??= 'done';
        poke();
      },
      fail: () => {
        ended ??= 'failed';
        poke();
      },
    });
    return (async function* () {
      let index = 0;
      for (;;) {
        if (index < made.length) {
          yield { audio: new Float32Array(10), sampleRate: 24_000, duration: 0.1, chunkIndex: index++, totalChunks: 3 };
          continue;
        }
        if (ended === 'failed') throw new Error('boom');
        if (ended === 'done') return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    })();
  },
}));

const { DeviceSpeechAhead } = await import('@/services/device-tts/ahead');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** How many chunks a taken sentence yields, or -1 when nothing was taken. */
async function drain(source: AsyncGenerator<unknown> | null): Promise<number> {
  if (!source) return -1;
  const chunks: unknown[] = [];
  for await (const chunk of source) chunks.push(chunk);
  return chunks.length;
}

beforeEach(() => {
  runs.length = 0;
  stops = 0;
});

describe('DeviceSpeechAhead', () => {
  it('makes the next sentence while the engine is free, and hands it over whole', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.want('Next one.', 'af_heart', 1);
    await flush();
    expect(runs.map((r) => r.text)).toEqual(['Next one.']);
    runs[0].push(3);
    runs[0].finish();
    await flush();
    expect(await drain(ahead.take('Next one.', 'af_heart', 1))).toBe(3);
    // Taken once: a second request for it is made live.
    expect(ahead.take('Next one.', 'af_heart', 1)).toBeNull();
  });

  it('streams a sentence still being made: what is ready, then the rest', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.want('Next one.', 'af_heart', 1);
    await flush();
    runs[0].push(1);
    const counting = drain(ahead.take('Next one.', 'af_heart', 1));
    await flush();
    runs[0].push(2);
    runs[0].finish();
    expect(await counting).toBe(3);
  });

  it('waits for the sentence being answered before making the next', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.begin();
    ahead.want('Next one.', 'af_heart', 1);
    await flush();
    expect(runs).toHaveLength(0);
    ahead.end();
    await flush();
    expect(runs.map((r) => r.text)).toEqual(['Next one.']);
  });

  it('matches the rate Readium hands back through a float', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.want('Next one.', 'af_heart', 1.1);
    await flush();
    runs[0].finish();
    await flush();
    expect(ahead.take('Next one.', 'af_heart', Math.fround(1.1))).not.toBeNull();
  });

  it('gives nothing for another sentence, voice or speed', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.want('Next one.', 'af_heart', 1);
    await flush();
    runs[0].finish();
    await flush();
    expect(ahead.take('Another.', 'af_heart', 1)).toBeNull();
    expect(ahead.take('Next one.', 'am_adam', 1)).toBeNull();
    expect(ahead.take('Next one.', 'af_heart', 1.5)).toBeNull();
  });

  it('stops a sentence cut short and never plays it as whole', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.want('Next one.', 'af_heart', 1);
    await flush();
    runs[0].push(1);
    ahead.cancel();
    await flush();
    expect(stops).toBe(1);
    expect(ahead.take('Next one.', 'af_heart', 1)).toBeNull();
  });

  it('keeps a whole sentence through a pause, for the resume that asks for it', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.want('Next one.', 'af_heart', 1);
    await flush();
    runs[0].push(2);
    runs[0].finish();
    await flush();
    ahead.cancel();
    expect(stops).toBe(0);
    expect(await drain(ahead.take('Next one.', 'af_heart', 1))).toBe(2);
  });

  it('gives nothing when making it failed, so the request is made live', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.want('Next one.', 'af_heart', 1);
    await flush();
    runs[0].fail();
    await flush();
    expect(ahead.take('Next one.', 'af_heart', 1)).toBeNull();
  });

  it('fails a taken sentence that fails partway, so the bridge can say so', async () => {
    const ahead = new DeviceSpeechAhead();
    ahead.want('Next one.', 'af_heart', 1);
    await flush();
    runs[0].push(1);
    const counting = drain(ahead.take('Next one.', 'af_heart', 1));
    await flush();
    runs[0].fail();
    await expect(counting).rejects.toThrow();
  });
});
