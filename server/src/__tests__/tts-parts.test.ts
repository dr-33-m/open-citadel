import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { CLOUD_VOICE_CATALOG } from 'samwell-shared';

import { createSpeechGuards } from '../tts-guards.js';
import { lookupGenerationCost, parseAudioFormat, speechBody } from '../tts-upstream.js';
import { createVoiceCatalog, VOICE_MODELS_DDL } from '../voice-catalog.js';
import { voiceFigures } from '../voice-figures.js';
import { readVoicePrice, refreshVoiceMetadata, toVoiceModel } from '../voice-metadata.js';
import { generateSamples, readSample, samplePath, wavFile } from '../voice-samples.js';

describe('parseAudioFormat', () => {
  it('reads the rate and channels a PCM reply names, however it spells them', () => {
    expect(parseAudioFormat('audio/pcm;rate=24000;channels=1')).toEqual({ kind: 'pcm', sampleRate: 24_000, channels: 1 });
    expect(parseAudioFormat('audio/pcm; sample_rate=22050')).toEqual({ kind: 'pcm', sampleRate: 22_050, channels: 1 });
    expect(parseAudioFormat('audio/L16; rate=44100; channels=2')).toEqual({ kind: 'pcm', sampleRate: 44_100, channels: 2 });
  });

  it('assumes 24 kHz mono only when nothing is said', () => {
    expect(parseAudioFormat('audio/pcm')).toEqual({ kind: 'pcm', sampleRate: 24_000, channels: 1 });
  });

  it('tells mp3 and anything else apart from PCM', () => {
    expect(parseAudioFormat('audio/mpeg').kind).toBe('mp3');
    expect(parseAudioFormat('application/json').kind).toBe('unknown');
    expect(parseAudioFormat(null).kind).toBe('unknown');
  });
});

describe('speechBody', () => {
  it('asks for zero retention, and leaves speed out unless given', () => {
    const body = speechBody({ modelId: 'm/x', voice: 'v', text: 't', format: 'pcm' });
    expect(body).toEqual({ model: 'm/x', input: 't', voice: 'v', response_format: 'pcm', provider: { zdr: true } });
  });
});

describe('lookupGenerationCost', () => {
  it('asks again while the record is not written yet', async () => {
    const answers = [new Response('', { status: 404 }), Response.json({ data: { total_cost: 0.0042 } })];
    const fetchImpl = vi.fn(async () => answers.shift() as Response) as unknown as typeof fetch;
    const waits: number[] = [];
    const cost = await lookupGenerationCost('gen-1', {
      apiKey: 'k',
      fetchImpl,
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    expect(cost).toBe(0.0042);
    expect(waits).toEqual([1_000, 2_000]);
  });

  it('gives up with null rather than inventing a cost', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await lookupGenerationCost('gen-1', { apiKey: 'k', fetchImpl, wait: async () => undefined })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe('speech guards', () => {
  it('lets two pieces through at once and refuses a third', () => {
    const guards = createSpeechGuards();
    const a = guards.admit('acct', 100);
    const b = guards.admit('acct', 100);
    expect(a.allowed && b.allowed).toBe(true);
    expect(guards.admit('acct', 100)).toEqual({ allowed: false, reason: 'too_many_in_flight' });
    if (a.allowed) a.release();
    expect(guards.admit('acct', 100).allowed).toBe(true);
    // Somebody else is not held up by this reader.
    expect(guards.admit('other', 100).allowed).toBe(true);
  });

  it('stops a day at the ceiling, gives back what a failed piece took, and starts again tomorrow', () => {
    const guards = createSpeechGuards({ dailyCeiling: 1_000 });
    const first = guards.admit('acct', 900, 0);
    if (first.allowed) first.release(true);
    const second = guards.admit('acct', 900, 0);
    expect(second.allowed).toBe(true);
    if (second.allowed) second.release();
    expect(guards.admit('acct', 200, 0)).toEqual({ allowed: false, reason: 'daily_limit' });
    expect(guards.admit('acct', 200, 86_400_000).allowed).toBe(true);
  });
});

describe('voice metadata', () => {
  it('reads a character price as it is, and converts a token price', () => {
    expect(readVoicePrice({ pricing: { prompt: '0.00000062', completion: '0' } })).toBeCloseTo(0.62, 10);
    expect(readVoicePrice({ pricing: { prompt: '0.0000005', completion: '0.000006' } })).toBeCloseTo(10.125, 10);
    expect(readVoicePrice({ pricing: { prompt: '0', completion: '0' } })).toBeNull();
    expect(readVoicePrice({ pricing: null })).toBeNull();
  });

  it('builds a row from OpenRouter, and refuses a model with no fixed voices', () => {
    const model = toVoiceModel(
      {
        id: 'google/gemini-3.8-flash-tts',
        name: 'Google: Gemini 3.8 Flash TTS',
        context_length: 32_768,
        pricing: { prompt: '0.0000005', completion: '0.000009' },
        supported_voices: ['Zephyr', 'Kore'],
      },
      { minPlan: 'grand_maester', defaultVoice: 'Kore' },
    );
    expect(model).toMatchObject({
      label: 'Gemini 3.8 Flash',
      maker: 'Google',
      minPlan: 'grand_maester',
      maxCharacters: 1_500,
      speedSupported: false,
      // OpenRouter does not say which formats a maker takes: PCM until told.
      formats: ['pcm'],
      voices: ['Zephyr', 'Kore'],
      defaultVoice: 'Kore',
    });
    const told = toVoiceModel(
      { id: 'hexgrad/kokoro-82m', name: 'Kokoro', supported_voices: ['af_heart'] },
      { minPlan: 'maester', formats: ['mp3'] },
    );
    expect(told?.formats).toEqual(['pcm', 'mp3']);
    expect(toVoiceModel({ id: 'fish-audio/s2-pro', name: 'Fish', supported_voices: null }, { minPlan: 'archmaester' })).toBeNull();
  });

  it('refreshes prices and voices without ever blanking them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'samwell-voices-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    try {
      const catalog = createVoiceCatalog(client);
      await catalog.ensureSchema();
      const fetchImpl = vi.fn(async () =>
        Response.json({
          data: [
            { id: 'hexgrad/kokoro-82m', pricing: { prompt: '0.0000007', completion: '0' }, supported_voices: ['af_heart', 'am_adam'] },
            { id: 'elevenlabs/eleven-v4', pricing: null, supported_voices: null },
          ],
        }),
      ) as unknown as typeof fetch;
      expect(await refreshVoiceMetadata(catalog, fetchImpl)).toBe(1);
      const kokoro = await catalog.find('hexgrad/kokoro-82m');
      expect(kokoro?.pricePerMillionCharacters).toBeCloseTo(0.7, 10);
      expect(kokoro?.voices).toEqual(['af_heart', 'am_adam']);
      const eleven = await catalog.find('elevenlabs/eleven-v4');
      expect(eleven?.pricePerMillionCharacters).toBe(40);
      expect(eleven?.voices.length).toBe(21);
    } finally {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives a table made before formats existed the seed formats, once, on the next boot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'samwell-voices-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    try {
      // The table as the preview has it: no audio_formats column.
      await client.execute(VOICE_MODELS_DDL.replace(`  audio_formats TEXT NOT NULL DEFAULT '["pcm"]',\n`, ''));
      for (const [index, id] of ['hexgrad/kokoro-82m', 'google/gemini-3.8-flash-tts', 'someone/added-by-hand'].entries()) {
        await client.execute({
          sql: `INSERT INTO cloud_voice_models (id, label, maker, description, min_plan, sort_order,
                  max_characters, voices, default_voice, created_at_ms, updated_at_ms)
                VALUES (?, 'L', 'M', 'D', 'maester', ?, 1500, '["Kore","af_heart"]', 'Kore', 0, 0)`,
          args: [id, index],
        });
      }
      const catalog = createVoiceCatalog(client);
      await catalog.ensureSchema();
      expect((await catalog.find('hexgrad/kokoro-82m'))?.formats).toEqual(['pcm', 'mp3']);
      expect((await catalog.find('google/gemini-3.8-flash-tts'))?.formats).toEqual(['pcm']);
      expect((await catalog.find('someone/added-by-hand'))?.formats).toEqual(['pcm']);
      // A second boot leaves a format set since alone.
      const added = await catalog.find('someone/added-by-hand');
      await catalog.update({ ...added!, formats: ['pcm', 'mp3'] });
      await catalog.ensureSchema();
      expect((await catalog.find('someone/added-by-hand'))?.formats).toEqual(['pcm', 'mp3']);
    } finally {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('voice figures', () => {
  it('sends Neurons and hours, never a price', () => {
    const figures = voiceFigures(CLOUD_VOICE_CATALOG, 'grand_maester');
    expect(JSON.stringify(figures)).not.toMatch(/price/i);
    expect(figures.defaultModelId).toBe('google/gemini-3.8-flash-lite-tts');
    const lite = figures.models.find((m) => m.id === 'google/gemini-3.8-flash-lite-tts');
    expect(lite?.hours).toBe(14.6);
    expect(lite?.chapterCredits).toBeGreaterThan(0);
  });

  it('counts a locked voice on the plan that opens it', () => {
    const figures = voiceFigures(CLOUD_VOICE_CATALOG, 'maester');
    expect(figures.models.find((m) => m.id === 'elevenlabs/eleven-v4-turbo')?.hours).toBe(22.2);
    expect(figures.models.find((m) => m.id === 'hexgrad/kokoro-82m')?.hours).toBe(59.7);
  });

  it('gives each voice its hours on every plan that reaches it, and none it does not', () => {
    const kokoro = voiceFigures(CLOUD_VOICE_CATALOG, null).models[0];
    expect(Object.keys(kokoro.hoursByPlan)).toEqual(['maester', 'grand_maester', 'archmaester']);
    // The same voice lasts longer on a bigger grant.
    expect(kokoro.hoursByPlan.archmaester).toBeGreaterThan(kokoro.hoursByPlan.maester as number);
    const eleven = voiceFigures(CLOUD_VOICE_CATALOG, null).models.find((m) => m.id === 'elevenlabs/eleven-v4');
    expect(Object.keys(eleven?.hoursByPlan ?? {})).toEqual(['archmaester']);
  });

  it('describes every plan for the plan cards, with or without a reader', () => {
    const figures = voiceFigures(CLOUD_VOICE_CATALOG, null);
    expect(figures.defaultModelId).toBeNull();
    expect(figures.byPlan.maester).toEqual({ makers: ['Kokoro'], defaultModelId: 'hexgrad/kokoro-82m', hours: 59.7 });
    expect(figures.byPlan.archmaester.makers).toEqual(['Kokoro', 'Google', 'ElevenLabs']);
  });

  it('lists Kokoro in English accents only', () => {
    const kokoro = voiceFigures(CLOUD_VOICE_CATALOG, 'maester').models[0];
    expect(kokoro.voices.every((voice) => /^[ab]/.test(voice))).toBe(true);
  });
});

describe('samples', () => {
  const kokoro = CLOUD_VOICE_CATALOG[0];
  const gemini = CLOUD_VOICE_CATALOG.find((model) => model.id.startsWith('google/'))!;

  it('never builds a path out of a voice the model does not have', () => {
    expect(samplePath(kokoro, '../../etc/passwd', 'mp3', '/s')).toBeNull();
    expect(samplePath(kokoro, 'not_a_voice', 'mp3', '/s')).toBeNull();
    expect(samplePath(kokoro, 'af_heart', 'mp3', '/s')).toBe('/s/hexgrad_kokoro-82m/af_heart.mp3');
    expect(samplePath(kokoro, 'af_heart', 'wav', '/s')).toBe('/s/hexgrad_kokoro-82m/af_heart.wav');
  });

  it('wraps PCM in a WAV header a player reads', () => {
    const file = wavFile(new Uint8Array([1, 0, 2, 0]), 24_000, 1);
    const view = new DataView(file.buffer);
    const text = (at: number) => String.fromCharCode(...file.slice(at, at + 4));
    expect(file.byteLength).toBe(48);
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(40);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint32(28, true)).toBe(48_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4);
    expect([...file.slice(44)]).toEqual([1, 0, 2, 0]);
  });

  it('asks a PCM-only maker for PCM, keeps it as WAV, and serves it as WAV', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'samwell-samples-'));
    try {
      const bodies: Record<string, unknown>[] = [];
      const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(new Uint8Array(480), { status: 200, headers: { 'Content-Type': 'audio/pcm;rate=24000;channels=1' } });
      }) as unknown as typeof fetch;
      const model = { ...gemini, voices: ['Kore'] };
      const run = await generateSamples({ models: [model], apiKey: 'k', fetchImpl, dir });
      expect(run).toEqual({ made: 1, skipped: 0, failed: [] });
      expect(bodies[0]).toMatchObject({ response_format: 'pcm' });
      const sample = await readSample(model, 'Kore', dir);
      expect(sample?.contentType).toBe('audio/wav');
      expect(sample?.audio.byteLength).toBe(44 + 480);
      // Made once: the next run skips it.
      expect((await generateSamples({ models: [model], apiKey: 'k', fetchImpl, dir })).skipped).toBe(1);
      expect(await readSample(model, 'Puck', dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('makes each missing clip once as mp3, and reports a failure without stopping', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'samwell-samples-'));
    try {
      const bodies: Record<string, unknown>[] = [];
      const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        return body.voice === 'am_adam'
          ? new Response('no', { status: 500 })
          : new Response(new Uint8Array([0xff, 0xfb]), { status: 200 });
      }) as unknown as typeof fetch;
      const model = { ...kokoro, voices: ['af_heart', 'am_adam'] };
      const first = await generateSamples({ models: [model], apiKey: 'k', fetchImpl, dir });
      expect(first).toEqual({ made: 1, skipped: 0, failed: [{ modelId: kokoro.id, voice: 'am_adam', status: 500 }] });
      expect(bodies[0]).toMatchObject({ response_format: 'mp3' });
      expect((await readSample(model, 'af_heart', dir))?.contentType).toBe('audio/mpeg');
      const second = await generateSamples({ models: [model], apiKey: 'k', fetchImpl, dir });
      expect(second.skipped).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
