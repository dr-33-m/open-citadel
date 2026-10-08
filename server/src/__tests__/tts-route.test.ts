import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLOUD_VOICE_CATALOG, CREDIT_PLANS, creditValueUsd, type PlanId } from 'samwell-shared';

import { createBillingService, type BillingService } from '../billing.js';
import { ensureBillingSchema, USAGE_EVENTS_DDL, type UsageEventUpdate } from '../db.js';
import { createTtsRoutes } from '../tts.js';
import { createSpeechCharging } from '../tts-billing.js';
import { createSpeechGuards } from '../tts-guards.js';
import { createVoiceCatalog, type VoiceCatalog } from '../voice-catalog.js';

/*
 * The whole route, against a real database and a fake maker. Nothing here has
 * heard a real voice: the maker's replies are shaped from OpenRouter's
 * documentation, which is exactly what CLOUD-VOICES-HANDOVER.md asks to be
 * checked against live traffic first.
 */

const NOW = 1_757_400_000_000;
const ACCOUNT = 'account:listener';
const PCM = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);

let client: Client;
let billing: BillingService;
let catalog: VoiceCatalog;
let dir: string;
let settles: Promise<void>[];
let speechCalls: { url: string; body: Record<string, unknown> }[];
let speechReply: () => Response;
let generationCost: number | null;

function fakeFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/audio/speech')) {
      speechCalls.push({ url, body: JSON.parse(String(init?.body)) });
      return speechReply();
    }
    if (url.includes('/generation')) {
      return generationCost == null
        ? new Response('{}', { status: 404 })
        : Response.json({ data: { total_cost: generationCost } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

function app(apiKey: string | undefined = 'sk-test') {
  const charging = createSpeechCharging({ client, billing, now: () => NOW });
  return createTtsRoutes({
    identify: async () => ({ id: ACCOUNT }),
    billing,
    charging,
    findVoiceModel: (id) => catalog.find(id),
    recordUsageEvent: async (args) => {
      await client.execute({
        sql: `INSERT INTO usage_events (id, account_id, model_id, status, counts_toward_limit, kind, created_at_ms)
              VALUES (?, ?, ?, 'started', 1, ?, ?)`,
        args: [args.id, args.accountId, args.modelId, args.kind, NOW],
      });
    },
    updateUsageEvent: async (id: string, update: UsageEventUpdate) => {
      await client.execute({
        sql: 'UPDATE usage_events SET status = ?, error = ? WHERE id = ?',
        args: [update.status, update.error ?? null, id],
      });
    },
    guards: createSpeechGuards(),
    apiKey: () => apiKey,
    fetchImpl: fakeFetch(),
    wait: async () => undefined,
    onSettled: (settling) => settles.push(settling),
  });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'samwell-tts-route-'));
  client = createClient({ url: `file:${join(dir, 'test.db')}` });
  await client.execute(USAGE_EVENTS_DDL);
  await ensureBillingSchema(client);
  billing = createBillingService({ client, now: () => NOW });
  catalog = createVoiceCatalog(client, () => NOW);
  await catalog.ensureSchema();
  settles = [];
  speechCalls = [];
  generationCost = null;
  speechReply = () =>
    new Response(PCM, {
      status: 200,
      headers: { 'Content-Type': 'audio/pcm;rate=24000;channels=1', 'X-Generation-Id': 'gen-1' },
    });
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

async function seedPlan(plan: PlanId | null, balance = 500): Promise<void> {
  await client.execute({
    sql: `INSERT INTO account_credits (account_id, plan, source, balance, reserved, period_end_ms, updated_at_ms)
          VALUES (?, ?, 'subscription', ?, 0, ?, ?)`,
    args: [ACCOUNT, plan, balance, NOW + 30 * 86_400_000, NOW],
  });
}

function speak(body: Record<string, unknown>, apiKey?: string) {
  return app(apiKey).request('/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const kokoro = { modelId: 'hexgrad/kokoro-82m', voice: 'af_heart', text: 'It was a quiet evening.' };

async function row(sql: string): Promise<Record<string, unknown>> {
  return (await client.execute({ sql, args: [ACCOUNT] })).rows[0] as Record<string, unknown>;
}

describe('POST /tts/speak', () => {
  it('streams the maker audio through, with its rate, and charges the real cost', async () => {
    await seedPlan('maester');
    generationCost = creditValueUsd(CREDIT_PLANS.maester) * 2.5;
    const response = await speak(kokoro);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-audio-sample-rate')).toBe('24000');
    expect(response.headers.get('x-audio-format')).toBe('pcm');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PCM);
    await Promise.all(settles);

    expect(speechCalls[0].body).toMatchObject({
      model: 'hexgrad/kokoro-82m',
      voice: 'af_heart',
      input: kokoro.text,
      response_format: 'pcm',
      provider: { zdr: true },
    });
    const credits = await row('SELECT balance, reserved FROM account_credits WHERE account_id = ?');
    expect(credits).toMatchObject({ balance: 498, reserved: 0 });
    const event = await row("SELECT status, kind, cost_usd FROM usage_events WHERE account_id = ?");
    expect(event).toMatchObject({ status: 'completed', kind: 'tts' });
    expect(Number(event.cost_usd)).toBeCloseTo(generationCost, 12);
  });

  it('falls back to the listed price when OpenRouter never reports the cost', async () => {
    await seedPlan('maester');
    const response = await speak(kokoro);
    await response.arrayBuffer();
    await Promise.all(settles);
    const event = await row('SELECT cost_usd FROM usage_events WHERE account_id = ?');
    expect(Number(event.cost_usd)).toBeCloseTo((kokoro.text.length / 1e6) * 0.62, 12);
  });

  it('refuses a reader with no plan before the maker is asked', async () => {
    await seedPlan(null);
    const response = await speak(kokoro);
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: 'no_subscription' });
    expect(speechCalls).toHaveLength(0);
  });

  it('names the plan a locked voice needs', async () => {
    await seedPlan('maester');
    const response = await speak({ modelId: 'elevenlabs/eleven-v4', voice: 'george', text: 'Hello.' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'plan_required', plan: 'archmaester' });
  });

  it('refuses an empty balance with the numbers, and closes the event', async () => {
    await seedPlan('maester', 0);
    const response = await speak(kokoro);
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: 'insufficient_credits', available: 0 });
    expect(speechCalls).toHaveLength(0);
    expect(await row('SELECT status FROM usage_events WHERE account_id = ?')).toMatchObject({ status: 'errored' });
  });

  it('refuses a voice the model does not have, and text over the limit', async () => {
    await seedPlan('archmaester');
    expect((await speak({ ...kokoro, voice: 'Kore' })).status).toBe(400);
    expect((await speak({ ...kokoro, text: 'a'.repeat(1_501) })).status).toBe(413);
    expect((await speak({ ...kokoro, modelId: 'nobody/nothing' })).status).toBe(404);
  });

  it('gives the hold back and says the maker failed when it answers an error', async () => {
    await seedPlan('maester');
    speechReply = () => Response.json({ error: { message: 'boom' } }, { status: 500 });
    const response = await speak(kokoro);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'maker_failed' });
    expect(await row('SELECT balance, reserved FROM account_credits WHERE account_id = ?')).toMatchObject({
      balance: 500,
      reserved: 0,
    });
  });

  it('tells a busy maker apart', async () => {
    await seedPlan('maester');
    speechReply = () => Response.json({ error: 'rate limited' }, { status: 429 });
    const response = await speak(kokoro);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'maker_busy' });
  });

  it('forwards speed only to a maker that takes it', async () => {
    await seedPlan('grand_maester');
    await (await speak({ ...kokoro, speed: 1.25 })).arrayBuffer();
    await (await speak({ modelId: 'google/gemini-3.8-flash-lite-tts', voice: 'Kore', text: 'Hello.', speed: 1.25 })).arrayBuffer();
    await (await speak({ ...kokoro, speed: 1 })).arrayBuffer();
    expect(speechCalls[0].body.speed).toBe(1.25);
    expect(speechCalls[1].body).not.toHaveProperty('speed');
    expect(speechCalls[2].body).not.toHaveProperty('speed');
  });

  it('asks the maker for MP3 when the app can play it, and says so', async () => {
    await seedPlan('maester');
    speechReply = () =>
      new Response(new Uint8Array([0xff, 0xf3, 0x44, 0xc0]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg', 'X-Generation-Id': 'gen-2' },
      });
    const response = await speak({ ...kokoro, format: 'mp3' });
    expect(response.headers.get('x-audio-format')).toBe('mp3');
    expect(new Uint8Array(await response.arrayBuffer()).length).toBe(4);
    expect(speechCalls[0].body.response_format).toBe('mp3');
    // Without saying, it is PCM, as every older build expects.
    await (await speak(kokoro)).arrayBuffer();
    expect(speechCalls[1].body.response_format).toBe('pcm');
  });

  it('answers 500 rather than a silent failure when the key is missing', async () => {
    await seedPlan('maester');
    expect((await speak(kokoro, '')).status).toBe(500);
  });

  it('seeds the catalogue it reads from, once', async () => {
    await catalog.ensureSchema();
    expect((await catalog.list()).map((m) => m.id)).toEqual(CLOUD_VOICE_CATALOG.map((m) => m.id));
  });
});
