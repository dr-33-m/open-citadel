import { describe, expect, it } from 'vitest';

import { audioFormatFor, isPublicAudioUrl, keytermsFrom, requestTranscription, transcriptionBody } from '../transcribe-upstream.js';

describe('isPublicAudioUrl', () => {
  it('takes a public http or https URL', () => {
    expect(isPublicAudioUrl('https://traffic.megaphone.fm/ABC123.mp3?updated=1')).toBe(true);
    expect(isPublicAudioUrl('http://feeds.example.com/ep.m4a')).toBe(true);
  });

  it('refuses private, local and odd addresses', () => {
    for (const url of [
      'ftp://example.com/a.mp3',
      'file:///etc/passwd',
      'http://localhost/a.mp3',
      'http://127.0.0.1/a.mp3',
      'http://10.0.0.5/a.mp3',
      'http://172.20.1.1/a.mp3',
      'http://192.168.1.1/a.mp3',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/a.mp3',
      'http://[fd00::1]/a.mp3',
      'http://intranet/a.mp3',
      'http://user:pass@example.com/a.mp3',
      'not a url',
      `https://example.com/${'a'.repeat(2_100)}`,
    ]) {
      expect(isPublicAudioUrl(url), url).toBe(false);
    }
  });
});

describe('audioFormatFor', () => {
  it('reads the extension, then the MIME type, then guesses MP3', () => {
    expect(audioFormatFor('https://x.com/ep.m4a?t=1')).toBe('m4a');
    expect(audioFormatFor('https://x.com/redirect/abc', 'audio/x-m4a')).toBe('m4a');
    expect(audioFormatFor('https://x.com/redirect/abc')).toBe('mp3');
  });
});

describe('keytermsFrom', () => {
  it('pulls names out of the notes', () => {
    const terms = keytermsFrom('#412 Sam Altman: OpenAI', 'Lex Fridman talks to Sam Altman about the Federal Reserve Bank.');
    expect(terms).toEqual(expect.arrayContaining(['Sam Altman', 'Lex Fridman', 'Federal Reserve Bank']));
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe('transcriptionBody', () => {
  it("asks for times and zero retention, with speakers and key terms in ElevenLabs' own options", () => {
    const body = transcriptionBody({ audioUrl: 'https://x.com/a.mp3', format: 'mp3', keyterms: ['Lex Fridman'] });
    expect(body).toMatchObject({
      model: 'elevenlabs/scribe-v2',
      input_audio: { url: 'https://x.com/a.mp3', format: 'mp3' },
      response_format: 'verbose_json',
      provider: { zdr: true, options: { elevenlabs: { diarize: true, keyterms: ['Lex Fridman'] } } },
    });
    expect(body).not.toHaveProperty('diarize');
    expect(body).not.toHaveProperty('keyterms');
  });

  it('leaves key terms out when there are none', () => {
    const body = transcriptionBody({ audioUrl: 'https://x.com/a.mp3', format: 'mp3', keyterms: [] }) as { provider: { options: { elevenlabs: object } } };
    expect(body.provider.options.elevenlabs).toEqual({ diarize: true });
  });
});

describe('requestTranscription', () => {
  it('asks again without key terms when the provider refuses them', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return body.provider.options.elevenlabs.keyterms
        ? new Response('{"error":{"message":"keyterms not supported"}}', { status: 400 })
        : Response.json({ text: 'ok', usage: { cost: 0.01, seconds: 10 } });
    }) as unknown as typeof fetch;
    const outcome = await requestTranscription({ audioUrl: 'https://x.com/a.mp3', format: 'mp3', keyterms: ['Ada Lovelace'] }, { apiKey: 'k', fetchImpl });
    expect(outcome.ok).toBe(true);
    expect(bodies).toHaveLength(2);
  });

  it('does not retry any other refusal', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('{"error":{"message":"Failed to download audio from URL"}}', { status: 400 });
    }) as unknown as typeof fetch;
    const outcome = await requestTranscription({ audioUrl: 'https://x.com/a.mp3', format: 'mp3', keyterms: ['Ada Lovelace'] }, { apiKey: 'k', fetchImpl });
    expect(outcome).toMatchObject({ ok: false, reason: 'audio_unreachable' });
    expect(calls).toBe(1);
  });
});
