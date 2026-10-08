/**
 * Managing the voice catalogue, and serving its samples.
 *
 * The admin half mirrors `/admin/models`: an id and a tier go in, everything
 * OpenRouter publishes (the price, the voice list, the length limit) is pulled
 * from OpenRouter, and an id it does not know is refused before it can reach
 * a reader. The tier is required, never defaulted, so a dear voice is never
 * added to the cheapest plan by omission.
 *
 * The other half is the samples: free, unmetered and unauthenticated, because
 * trying a voice must never cost anything, and capped per caller like the
 * other open routes.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { listedVoices, PLAN_ORDER, type PlanId } from 'samwell-shared';
import { z } from 'zod';

import { requireAdminKey, requireOpenRouterKey } from './http-helpers.js';
import { rateLimit } from './rate-limit.js';
import { voiceCatalog } from './voice-catalog.js';
import { fetchOpenRouterVoiceModel, toVoiceModel, type VoiceModelInput } from './voice-metadata.js';
import { generateSamples, readSample, samplePath, type SampleRun } from './voice-samples.js';

const PlanSchema = z.enum(PLAN_ORDER as unknown as [PlanId, ...PlanId[]]);

const VoiceFieldsSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  maker: z.string().min(1).max(40).optional(),
  description: z.string().min(1).max(200).optional(),
  defaultVoice: z.string().min(1).max(100).optional(),
  speedSupported: z.boolean().optional(),
});

const AddVoiceSchema = VoiceFieldsSchema.extend({ id: z.string().min(1), minPlan: PlanSchema });
const PatchVoiceSchema = VoiceFieldsSchema.extend({ minPlan: PlanSchema.optional() });

async function pullVoiceModel(id: string, input: VoiceModelInput) {
  const fetched = await fetchOpenRouterVoiceModel(id);
  if (fetched.kind === 'unknown_id') {
    throw new HTTPException(400, { message: `OpenRouter has no model with id '${id}'.` });
  }
  if (fetched.kind === 'unreachable') {
    throw new HTTPException(502, { message: 'Could not reach OpenRouter to verify the voice model.' });
  }
  const model = toVoiceModel(fetched.entry, input);
  if (!model) {
    // Fish Audio's shape: no fixed voices, a voice is made from a recording.
    throw new HTTPException(400, {
      message: `'${id}' lists no fixed voices, so there is nothing for a reader to choose.`,
    });
  }
  return model;
}

export const voiceAdminRoutes = new Hono();

voiceAdminRoutes.get('/', async (c) => {
  requireAdminKey(c);
  return c.json({ voices: await voiceCatalog.list() });
});

voiceAdminRoutes.post('/', async (c) => {
  requireAdminKey(c);
  const parsed = AddVoiceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });

  const { id, ...input } = parsed.data;
  const model = await pullVoiceModel(id, input);
  // Idempotent, like `/admin/models`: adding an existing id re-pulls it.
  if (await voiceCatalog.find(model.id)) await voiceCatalog.update(model);
  else await voiceCatalog.insert(model);
  return c.json({ voices: await voiceCatalog.list() });
});

/*
 * Samples, before the `:id` routes so the path is not read as a model id.
 *
 * A run is a few hundred short reads one after another, minutes in all, which
 * is longer than the proxy in front of this server holds a request open. So
 * the POST starts it in the background and answers at once, and the GET says
 * how far it has got. One run at a time; a second POST while one is going
 * just reports on it.
 */
let sampleRun: { running: boolean; startedAt: string; result: SampleRun | null; error: string | null } | null =
  null;

voiceAdminRoutes.post('/samples', async (c) => {
  requireAdminKey(c);
  requireOpenRouterKey();
  if (sampleRun?.running) return c.json(sampleRun, 202);

  const run: NonNullable<typeof sampleRun> = {
    running: true,
    startedAt: new Date().toISOString(),
    result: null,
    error: null,
  };
  sampleRun = run;
  void generateSamples({
    models: await voiceCatalog.list(),
    apiKey: process.env.OPENROUTER_API_KEY as string,
    force: c.req.query('force') === '1',
    voicesFor: listedVoices,
  })
    .then((result) => {
      run.result = result;
    })
    .catch((error) => {
      run.error = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      run.running = false;
    });
  return c.json(run, 202);
});

voiceAdminRoutes.get('/samples', async (c) => {
  requireAdminKey(c);
  return c.json(sampleRun ?? { running: false, startedAt: null, result: null, error: null });
});

/**
 * Re-pull a stored voice model, keeping anything the body does not name: a
 * refresh of the facts must never quietly move a voice between tiers or
 * switch its speed back off.
 */
voiceAdminRoutes.patch('/:id{.+}', async (c) => {
  requireAdminKey(c);
  const id = c.req.param('id');
  const existing = await voiceCatalog.find(id);
  if (!existing) throw new HTTPException(404, { message: `Voice model '${id}' is not in the catalogue.` });

  const parsed = PatchVoiceSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });

  const model = await pullVoiceModel(id, {
    minPlan: parsed.data.minPlan ?? existing.minPlan,
    label: parsed.data.label ?? existing.label,
    maker: parsed.data.maker ?? existing.maker,
    description: parsed.data.description ?? existing.description,
    defaultVoice: parsed.data.defaultVoice ?? existing.defaultVoice,
    speedSupported: parsed.data.speedSupported ?? existing.speedSupported,
  });
  await voiceCatalog.update(model);
  return c.json({ voices: await voiceCatalog.list() });
});

voiceAdminRoutes.delete('/:id{.+}', async (c) => {
  requireAdminKey(c);
  const id = c.req.param('id');
  if (!(await voiceCatalog.remove(id))) {
    throw new HTTPException(404, { message: `Voice model '${id}' is not in the catalogue.` });
  }
  return c.json({ voices: await voiceCatalog.list() });
});

export const voiceSampleRoutes = new Hono();

voiceSampleRoutes.use('/samples/*', rateLimit({ limit: 120, windowMs: 60_000 }));

/** `GET /tts/samples/<model id>/<voice>.mp3`. The model id carries a slash. */
voiceSampleRoutes.get('/samples/:path{.+}', async (c) => {
  const path = c.req.param('path');
  const split = path.lastIndexOf('/');
  const modelId = path.slice(0, split);
  const voice = path.slice(split + 1).replace(/\.mp3$/, '');
  const model = split > 0 ? await voiceCatalog.find(modelId) : null;
  const file = model ? samplePath(model, voice) : null;
  const audio = file ? await readSample(file) : null;
  if (!audio) return c.json({ error: 'no_sample' }, 404);
  return new Response(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      // A voice's sample never changes once made; a re-made one is asked for
      // again only by a reinstall, which is rare enough to accept.
      'Cache-Control': 'public, max-age=2592000',
    },
  });
});
