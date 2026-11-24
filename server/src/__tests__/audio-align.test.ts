import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { audioIdentity, toTranscriptTime, totalBytesOf } from 'samwell-shared';

import { alignFingerprints } from '../audio-align/align.js';
import {
  createFingerprinter,
  fingerprintFromText,
  fingerprintToText,
  FINGERPRINT_SAMPLE_RATE,
  FRAMES_PER_SECOND,
} from '../audio-align/fingerprint.js';
import { resolveAudioUrl } from '../audio-align/resolve.js';
import { openAudio, type OpenedAudio } from '../audio-align/safe-fetch.js';
import { isPublicAddress } from '../web-page-text.js';

/** A run of fingerprint words that stands in for a stretch of sound: random, so no stretch looks like another. */
function sound(seconds: number, seed: number): Uint32Array {
  const words = new Uint32Array(Math.round(seconds * FRAMES_PER_SECOND));
  let x = seed >>> 0 || 1;
  for (let i = 0; i < words.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    words[i] = x >>> 0;
  }
  return words;
}

function join(...parts: Uint32Array[]): Uint32Array {
  const out = new Uint32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The same sound heard again: a few bits of each word flipped, as re-encoding does. */
function reheard(words: Uint32Array, flips = 3): Uint32Array {
  const out = new Uint32Array(words.length);
  for (let i = 0; i < words.length; i++) {
    let w = words[i]!;
    for (let f = 0; f < flips; f++) w ^= 1 << ((i * 7 + f * 11) % 32);
    // Most words come through untouched; every fourth is noisy.
    out[i] = i % 4 === 0 ? w >>> 0 : words[i]!;
  }
  return out;
}

describe('alignFingerprints', () => {
  const show1 = sound(600, 1);
  const show2 = sound(900, 2);
  const show3 = sound(600, 3);
  const adA = sound(30, 101);
  const adB = sound(60, 102);

  it('finds each stretch of the show when the transcribed copy had ads the playing one has not', () => {
    const transcribed = join(adA, show1, adB, show2, show3);
    const playing = reheard(join(show1, show2, show3));
    const map = alignFingerprints(transcribed, playing);
    expect(map).toHaveLength(2);
    expect(map[0]!.audioStart).toBeCloseTo(0, 0);
    expect(map[0]!.transcriptStart).toBeCloseTo(30, 0);
    expect(map[1]!.audioStart).toBeCloseTo(600, 0);
    expect(map[1]!.transcriptStart).toBeCloseTo(690, 0);
    expect(map[1]!.audioEnd).toBeCloseTo(2100, 0);
  });

  it('leaves the playing copy’s own ads uncovered, so they map to nothing', () => {
    const transcribed = join(show1, show2);
    const playing = reheard(join(adA, show1, adB, show2));
    const map = alignFingerprints(transcribed, playing);
    expect(map).toHaveLength(2);
    expect(toTranscriptTime(map, 10)).toBeNull();
    expect(toTranscriptTime(map, 30 + 100)).toBeCloseTo(100, 0);
    expect(toTranscriptTime(map, 30 + 600 + 20)).toBeNull();
    expect(toTranscriptTime(map, 30 + 600 + 60 + 50)).toBeCloseTo(650, 0);
  });

  it('keeps a long stretch whole through a pause in the middle of it', () => {
    // Ten seconds in the middle of the show that come out different in the
    // playing copy (a music bed re-encoded), between ads on either side.
    const playing = reheard(join(adA, show1.subarray(0, 6_000), sound(10, 77), show1.subarray(6_200), show2));
    const transcribed = join(show1, adB, show2);
    const map = alignFingerprints(transcribed, playing);
    const first = map[0]!;
    expect(first.audioStart).toBeCloseTo(30, 0);
    expect(first.audioEnd).toBeGreaterThan(30 + 300 + 10 + 280);
  });

  it('answers nothing for a copy of something else altogether', () => {
    expect(alignFingerprints(join(show1, show2), sound(1200, 999))).toEqual([]);
  });
});

/** All the samples at once, through the streaming fingerprinter. */
function fingerprint(samples: Float32Array): Uint32Array {
  const fingerprinter = createFingerprinter();
  fingerprinter.push(samples);
  return fingerprinter.finish();
}

describe('fingerprint', () => {
  // Speech-like enough to fingerprint: tones that move, over a little noise.
  function voice(seconds: number, seed: number): Float32Array {
    const out = new Float32Array(seconds * FINGERPRINT_SAMPLE_RATE);
    let x = seed;
    for (let i = 0; i < out.length; i++) {
      const t = i / FINGERPRINT_SAMPLE_RATE;
      x = (x * 1103515245 + 12345) % 2147483648;
      const pitch = 400 + 300 * Math.sin(t * 1.7 + seed) + 200 * Math.sin(t * 5.3);
      out[i] = 0.5 * Math.sin(2 * Math.PI * pitch * t) + 0.05 * (x / 2147483648 - 0.5);
    }
    return out;
  }

  it('is the same whether the samples come at once or in pieces', () => {
    const samples = voice(20, 7);
    const whole = fingerprint(samples);
    const streamed = createFingerprinter();
    for (let at = 0; at < samples.length; at += 3_333) streamed.push(samples.subarray(at, at + 3_333));
    expect(Array.from(streamed.finish())).toEqual(Array.from(whole));
    // One word a frame, after the first window has filled.
    expect(whole.length).toBe(Math.floor((samples.length - 2_048) / 400));
  });

  it('places a stretch of real-sounding audio found inside a longer copy', () => {
    const show = voice(40, 3);
    const ad = voice(10, 42);
    const longer = new Float32Array(ad.length + show.length);
    longer.set(ad);
    longer.set(show, ad.length);
    const map = alignFingerprints(fingerprint(longer), fingerprint(show));
    expect(map).toHaveLength(1);
    expect(map[0]!.transcriptStart - map[0]!.audioStart).toBeCloseTo(10, 0);
  });

  it('round-trips through the text a transcript carries', () => {
    const words = sound(5, 9);
    expect(Array.from(fingerprintFromText(fingerprintToText(words)))).toEqual(Array.from(words));
  });
});

describe('resolveAudioUrl', () => {
  const opened = (status: number, url: string, headers: Record<string, string>) =>
    ({ url, status, headers, body: Readable.from(['x']) }) as unknown as OpenedAudio;

  it('reads the whole length from a ranged reply, else from a whole one', () => {
    expect(totalBytesOf('bytes 0-0/77457297', null)).toBe(77_457_297);
    expect(totalBytesOf(null, '1234')).toBe(1234);
    expect(totalBytesOf(null, null)).toBeNull();
  });

  it('answers the copy the redirects end at, asking for one byte of it', async () => {
    const open = vi.fn(async (_url: string, _options: { headers?: Record<string, string> }) =>
      opened(206, 'https://cdn.example.com/ep/default.mp3_abc_81711699.mp3?session=1', { 'content-range': 'bytes 0-0/81711699' }),
    );
    const resolved = await resolveAudioUrl('https://tracker.example.com/redirect.mp3/cdn.example.com/ep.mp3', { open });
    expect(resolved.url).toBe('https://cdn.example.com/ep/default.mp3_abc_81711699.mp3?session=1');
    expect(resolved.identity).toBe(audioIdentity('https://cdn.example.com/ep/default.mp3_abc_81711699.mp3', 81_711_699));
    expect(vi.mocked(open).mock.calls[0]![1]).toMatchObject({ headers: { Range: 'bytes=0-0' } });
  });

  it('throws on a host that refuses', async () => {
    const open = vi.fn(async () => opened(404, 'https://x.example.com/a.mp3', {}));
    await expect(resolveAudioUrl('https://x.example.com/a.mp3', { open })).rejects.toThrow('404');
  });
});

describe('openAudio', () => {
  it('knows the addresses an episode can never be served from', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe']) {
      expect(isPublicAddress(address)).toBe(false);
    }
    for (const address of ['8.8.8.8', '151.101.1.69', '2606:4700::1111']) expect(isPublicAddress(address)).toBe(true);
  });

  it('refuses a private address before connecting, however it is written', async () => {
    for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://2852039166/', 'http://[::1]/a.mp3', 'http://[::ffff:127.0.0.1]/a.mp3', 'http://localhost/a.mp3']) {
      await expect(openAudio(url)).rejects.toThrow('public address');
    }
  });
});
