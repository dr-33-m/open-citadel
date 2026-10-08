import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { CLOUD_VOICE_CATALOG } from 'samwell-shared';

import { createSpeechGuards } from '../tts-guards.js';
import { lookupGenerationCost, parseAudioFormat, speechBody } from '../tts-upstream.js';
import { createVoiceCatalog } from '../voice-catalog.js';
import { voiceFigures } from '../voice-figures.js';
import { readVoicePrice, refreshVoiceMetadata, toVoiceModel } from '../voice-metadata.js';
import { generateSamples, samplePath } from '../voice-samples.js';

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
      voices: ['Zephyr', 'Kore'],
      defaultVoice: 'Kore',
    });
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

  it('never builds a path out of a voice the model does not have', () => {
    expect(samplePath(kokoro, '../../etc/passwd', '/s')).toBeNull();
    expect(samplePath(kokoro, 'not_a_voice', '/s')).toBeNull();
    expect(samplePath(kokoro, 'af_heart', '/s')).toBe('/s/hexgrad_kokoro-82m/af_heart.mp3');
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
      const second = await generateSamples({ models: [model], apiKey: 'k', fetchImpl, dir });
      expect(second.skipped).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
