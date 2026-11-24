import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { transcriptionCredits, type PlanId } from 'samwell-shared';

import { createBillingService, type BillingService } from '../billing.js';
import { ensureBillingSchema, USAGE_EVENTS_DDL } from '../db.js';
import { createTranscribeRoutes } from '../transcribe.js';
import { COLLECT_WINDOW_MS, createTranscribeJobs, type TranscribeJobs } from '../transcribe-jobs.js';
import { createTranscribeWorker, type TranscribeWorker } from '../transcribe-worker.js';

/*
 * The whole job, against a real database and a fake Scribe whose replies are
 * shaped from OpenRouter's documented `verbose_json`.
 */

const ACCOUNT = 'account:listener';
let now = 1_757_400_000_000;
let client: Client;
let billing: BillingService;
let jobs: TranscribeJobs;
let worker: TranscribeWorker;
let dir: string;
let scribeReply: () => Response;
let scribeCalls: Record<string, unknown>[];

const words = [
  { word: 'Welcome', start: 0, end: 0.5, speaker_label: 'speaker_0' },
  { word: 'back.', start: 0.5, end: 1, speaker_label: 'speaker_0' },
  { word: 'Thanks.', start: 1.2, end: 1.8, speaker_label: 'speaker_1' },
];

function fakeFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes('/audio/transcriptions')) throw new Error(`unexpected fetch ${String(input)}`);
    scribeCalls.push(JSON.parse(String(init?.body)));
    return scribeReply();
  }) as unknown as typeof fetch;
}

function app() {
  return createTranscribeRoutes({
    identify: async () => ({ id: ACCOUNT }),
    billing,
    jobs,
    worker,
    recordUsageEvent: async (args) => {
      await client.execute({
        sql: `INSERT INTO usage_events (id, account_id, model_id, status, counts_toward_limit, kind, created_at_ms)
              VALUES (?, ?, ?, 'started', 1, ?, ?)`,
        args: [args.id, args.accountId, args.modelId, args.kind, now],
      });
    },
    apiKey: () => 'sk-test',
    now: () => now,
  });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'samwell-transcribe-'));
  client = createClient({ url: `file:${join(dir, 'test.db')}` });
  await client.execute(USAGE_EVENTS_DDL);
  await ensureBillingSchema(client);
  billing = createBillingService({ client, now: () => now });
  jobs = createTranscribeJobs(client, () => now);
  await jobs.ensureSchema();
  worker = createTranscribeWorker({
    jobs,
    billing,
    apiKey: () => 'sk-test',
    fetchImpl: fakeFetch(),
    nameSpeakers: async (doc) => ({ doc: { ...doc, speakers: ['Lex Fridman', doc.speakers[1]] }, costUsd: 0.002 }),
  });
  scribeCalls = [];
  scribeReply = () => Response.json({ text: 'Welcome back. Thanks.', language: 'en', duration: 5400, words, usage: { cost: 0.33, seconds: 5400 } });
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

async function seedPlan(plan: PlanId | null, balance = 2_500): Promise<void> {
  await client.execute({
    sql: `INSERT INTO account_credits (account_id, plan, source, balance, reserved, period_end_ms, updated_at_ms)
          VALUES (?, ?, 'subscription', ?, 0, ?, ?)`,
    args: [ACCOUNT, plan, balance, now + 30 * 86_400_000, now],
  });
}

const episode = {
  audioUrl: 'https://traffic.example.com/ep412.mp3',
  durationSec: 5_400,
  episodeKey: 'guid-412',
  title: '#412 Sam Altman',
  showTitle: 'Lex Fridman Podcast',
  notes: 'Lex Fridman talks to Sam Altman.',
};

const post = (body: Record<string, unknown> = episode) =>
  app().request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const get = (path: string) => app().request(path);
const credits = async () =>
  (await client.execute({ sql: 'SELECT balance, reserved FROM account_credits WHERE account_id = ?', args: [ACCOUNT] })).rows[0];

describe('/transcribe', () => {
  it('reserves the estimate, transcribes by URL, and charges only on collection', async () => {
    await seedPlan('maester');
    const started = await post();
    expect(started.status).toBe(200);
    const { jobId, credits: estimate } = (await started.json()) as { jobId: string; credits: number };
    expect(estimate).toBe(transcriptionCredits(5_400));
    await worker.settled(jobId);

    expect(scribeCalls[0]).toMatchObject({ input_audio: { url: episode.audioUrl, format: 'mp3' }, provider: { options: { elevenlabs: { diarize: true } } } });
    const sent = scribeCalls[0] as { provider: { options: { elevenlabs: { keyterms: string[] } } } };
    expect(sent.provider.options.elevenlabs.keyterms).toEqual(expect.arrayContaining(['Sam Altman', 'Lex Fridman']));
    expect(await credits()).toMatchObject({ balance: 2_500, reserved: estimate });

    const status = (await (await get(`/${jobId}`)).json()) as { status: string; progress: number };
    expect(status).toMatchObject({ status: 'ready', progress: 1 });

    const result = await get(`/${jobId}/result`);
    const body = (await result.json()) as { transcript: { speakers: string[]; segments: unknown[] }; credits: number };
    // $0.33 + $0.002 at $0.0008 a Neuron, rounded up once.
    expect(body.credits).toBe(415);
    expect(body.transcript.speakers).toEqual(['Lex Fridman', 'Speaker 2']);
    expect(body.transcript.segments).toHaveLength(2);
    expect(await credits()).toMatchObject({ balance: 2_500 - 415, reserved: 0 });

    // A repeat fetch hands the same transcript over and never charges twice.
    const again = (await (await get(`/${jobId}/result`)).json()) as { credits: number };
    expect(again.credits).toBe(415);
    expect(await credits()).toMatchObject({ balance: 2_085 });
  });

  it('hands back the running job for a second tap on the same episode', async () => {
    await seedPlan('maester');
    const first = (await (await post()).json()) as { jobId: string };
    const second = (await (await post()).json()) as { jobId: string };
    expect(second.jobId).toBe(first.jobId);
    await worker.settled(first.jobId);
    expect(scribeCalls).toHaveLength(1);
  });

  it('allows one job in flight per account', async () => {
    await seedPlan('maester');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const reply = scribeReply;
    scribeReply = () => reply();
    worker = createTranscribeWorker({
      jobs,
      billing,
      apiKey: () => 'sk-test',
      fetchImpl: (async () => {
        await gate;
        return reply();
      }) as unknown as typeof fetch,
      nameSpeakers: async (doc) => ({ doc, costUsd: 0 }),
    });
    const first = (await (await post()).json()) as { jobId: string };
    const busy = await post({ ...episode, episodeKey: 'other' });
    expect(busy.status).toBe(429);
    expect(await busy.json()).toEqual({ error: 'busy' });
    release();
    await worker.settled(first.jobId);
  });

  it('refuses without a plan, and with too few Neurons, before anything runs', async () => {
    const none = await post();
    expect(none.status).toBe(403);
    await seedPlan('maester', 100);
    const poor = await post();
    expect(poor.status).toBe(402);
    expect(await poor.json()).toMatchObject({ error: 'insufficient_credits', available: 100, required: 413 });
    expect(scribeCalls).toHaveLength(0);
  });

  it('refuses an episode over four hours, and a private address', async () => {
    await seedPlan('maester');
    expect((await post({ ...episode, durationSec: 4 * 3_600 + 1 })).status).toBe(413);
    expect((await post({ ...episode, audioUrl: 'http://169.254.169.254/x.mp3' })).status).toBe(400);
  });

  it('stops at ten hours a day, counted by what Scribe heard', async () => {
    await seedPlan('archmaester', 30_000);
    scribeReply = () => Response.json({ words, usage: { cost: 0.88, seconds: 4 * 3_600 } });
    for (let i = 0; i < 2; i++) {
      const { jobId } = (await (await post({ ...episode, durationSec: 4 * 3_600, episodeKey: `e${i}` })).json()) as { jobId: string };
      await worker.settled(jobId);
    }
    const third = await post({ ...episode, durationSec: 3 * 3_600, episodeKey: 'e3' });
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: 'daily_limit' });
  });

  it('releases the hold when Scribe cannot reach the audio', async () => {
    await seedPlan('maester');
    scribeReply = () => new Response('{"error":{"message":"Failed to download audio from URL"}}', { status: 400 });
    const { jobId } = (await (await post()).json()) as { jobId: string };
    await worker.settled(jobId);
    expect(await (await get(`/${jobId}`)).json()).toMatchObject({ status: 'failed', error: 'audio_unreachable' });
    expect(await credits()).toMatchObject({ balance: 2_500, reserved: 0 });
    expect((await get(`/${jobId}/result`)).status).toBe(410);
  });

  it('stops a job uncharged', async () => {
    await seedPlan('maester');
    const { jobId } = (await (await post()).json()) as { jobId: string };
    const stopped = await app().request(`/${jobId}`, { method: 'DELETE' });
    expect(stopped.status).toBe(200);
    await worker.settled(jobId);
    expect(await credits()).toMatchObject({ balance: 2_500, reserved: 0 });
    expect((await get(`/${jobId}`)).status).toBe(404);
  });

  it('lists what a closed phone has to pick up, and releases what nobody collects', async () => {
    await seedPlan('maester');
    const { jobId } = (await (await post()).json()) as { jobId: string };
    await worker.settled(jobId);
    expect(await (await get('/pending')).json()).toEqual([{ jobId, episodeKey: 'guid-412', status: 'ready', progress: 1 }]);

    now += COLLECT_WINDOW_MS + 1;
    await worker.sweep();
    expect(await credits()).toMatchObject({ balance: 2_500, reserved: 0 });
    expect(await (await get(`/${jobId}`)).json()).toMatchObject({ status: 'failed', error: 'expired' });
  });

  it('keeps default names when naming fails', async () => {
    await seedPlan('maester');
    worker = createTranscribeWorker({
      jobs,
      billing,
      apiKey: () => 'sk-test',
      fetchImpl: fakeFetch(),
      nameSpeakers: async () => {
        throw new Error('model down');
      },
    });
    const { jobId } = (await (await post()).json()) as { jobId: string };
    await worker.settled(jobId);
    const body = (await (await get(`/${jobId}/result`)).json()) as { transcript: { speakers: string[] }; credits: number };
    expect(body.transcript.speakers).toEqual(['Speaker 1', 'Speaker 2']);
    expect(body.credits).toBe(413);
  });
});

describe('/transcribe, for shows that stitch ads into each download', () => {
  const COPY = 'https://cdn.example.com/ep412/default.mp3_ads-for-here_81711699.mp3?session=abc';

  function withAudio(fingerprint: (url: string) => Promise<Uint32Array>) {
    worker = createTranscribeWorker({
      jobs,
      billing,
      apiKey: () => 'sk-test',
      fetchImpl: fakeFetch(),
      nameSpeakers: async (doc) => ({ doc, costUsd: 0 }),
      audio: { resolve: async () => ({ url: COPY, identity: 'copy-412' }), fingerprint },
    });
  }

  it('transcribes the resolved copy, and the transcript carries that copy’s fingerprint', async () => {
    await seedPlan('maester');
    const heard: string[] = [];
    withAudio(async (url) => {
      heard.push(url);
      return new Uint32Array([1, 2, 3]);
    });
    const { jobId } = (await (await post()).json()) as { jobId: string };
    await worker.settled(jobId);
    expect(scribeCalls[0]).toMatchObject({ input_audio: { url: COPY } });
    expect(heard).toEqual([COPY]);
    const body = (await (await get(`/${jobId}/result`)).json()) as { transcript: { audio?: { identity: string; fingerprint: string } } };
    expect(body.transcript.audio?.identity).toBe('copy-412');
    expect(Buffer.from(body.transcript.audio!.fingerprint, 'base64').byteLength).toBe(12);
  });

  it('still hands over the transcript when the fingerprint cannot be made', async () => {
    await seedPlan('maester');
    withAudio(async () => {
      throw new Error('ffmpeg missing');
    });
    const { jobId } = (await (await post()).json()) as { jobId: string };
    await worker.settled(jobId);
    const body = (await (await get(`/${jobId}/result`)).json()) as { transcript: { audio?: unknown; segments: unknown[] } };
    expect(body.transcript.segments.length).toBeGreaterThan(0);
    expect(body.transcript.audio).toBeUndefined();
  });
});

describe('POST /transcribe/align', () => {
  const fingerprint = Buffer.from(new Uint32Array(2_000).fill(7).buffer).toString('base64');
  const route = (align?: (url: string, words: Uint32Array) => Promise<{ audioStart: number; audioEnd: number; transcriptStart: number }[]>) =>
    createTranscribeRoutes({
      identify: async () => ({ id: ACCOUNT }),
      billing,
      jobs,
      worker,
      recordUsageEvent: async () => undefined,
      apiKey: () => 'sk-test',
      align,
    });
  const ask = (app: ReturnType<typeof route>, body: unknown) =>
    app.request('/align', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('answers the map of the copy the phone plays', async () => {
    const seen: { url: string; words: number }[] = [];
    const app = route(async (url, words) => {
      seen.push({ url, words: words.length });
      return [{ audioStart: 0, audioEnd: 100, transcriptStart: 30 }];
    });
    const answer = await ask(app, { audioUrl: 'https://cdn.example.com/ep.mp3', fingerprint });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ segments: [{ audioStart: 0, audioEnd: 100, transcriptStart: 30 }] });
    expect(seen).toEqual([{ url: 'https://cdn.example.com/ep.mp3', words: 2_000 }]);
  });

  it('refuses a private address and a fingerprint too short to place anything', async () => {
    const app = route(async () => []);
    expect((await ask(app, { audioUrl: 'http://127.0.0.1/ep.mp3', fingerprint })).status).toBe(400);
    expect((await ask(app, { audioUrl: 'https://cdn.example.com/ep.mp3', fingerprint: 'AAAA' })).status).toBe(400);
  });

  it('says the episode could not be reached when its host fails', async () => {
    const app = route(async () => {
      throw new Error('404');
    });
    const answer = await ask(app, { audioUrl: 'https://cdn.example.com/ep.mp3', fingerprint });
    expect(answer.status).toBe(502);
    expect(await answer.json()).toEqual({ error: 'audio_unreachable' });
  });

  it('is not offered by a server without the means', async () => {
    expect((await ask(route(), { audioUrl: 'https://cdn.example.com/ep.mp3', fingerprint })).status).toBe(500);
  });
});

describe('/transcribe, asked afresh', () => {
  it('makes a new transcript rather than handing back the one just collected', async () => {
    await seedPlan('maester');
    const first = (await (await post()).json()) as { jobId: string };
    await worker.settled(first.jobId);
    expect((await get(`/${first.jobId}/result`)).status).toBe(200);

    const again = (await (await post()).json()) as { jobId: string };
    expect(again.jobId).toBe(first.jobId);

    const fresh = (await (await post({ ...episode, fresh: true })).json()) as { jobId: string };
    expect(fresh.jobId).not.toBe(first.jobId);
    await worker.settled(fresh.jobId);
    expect(scribeCalls).toHaveLength(2);
  });
});
