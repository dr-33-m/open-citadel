import 'dotenv/config';

import { serve } from '@hono/node-server';
import { chat, toHttpResponse, type ModelMessage, type StreamChunk } from '@tanstack/ai';
import { openRouterText } from '@tanstack/ai-openrouter';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import {
  COMPASS_CLIENT_TOOL_DEFINITIONS,
  COMPASS_SYSTEM_PROMPT,
  ONBOARDING_CLIENT_TOOL_DEFINITIONS,
  ONBOARDING_SYSTEM_PROMPT,
  SAMWELL_APP_GUIDE_TOOL_PROMPT,
  SAMWELL_CLIENT_TOOL_DEFINITIONS,
  SAMWELL_JOURNEY_TOOL_PROMPT,
  SAMWELL_SYSTEM_PROMPT,
  PLAN_ORDER,
  CREDIT_PLANS,
  FORECAST_WORKLOAD,
  costToCredits,
  creditValueUsd,
  modelsForPlan,
  modelCostUsd,
  resolveCachedTokens,
  resolveContextTokens,
  type CloudModelOption,
  type ModelPricing,
  type PlanId,
} from 'samwell-shared';
import { z } from 'zod';

import { chatTitleRoutes } from './chat-title.js';
import { gutenbergRoutes } from './gutenberg.js';
import { onboardingRoutes } from './onboarding.js';
import { billingRoutes, insiderAdminRoutes } from './billing-routes.js';
import { billingWebhookRoutes } from './billing-webhook.js';
import {
  clearToolResults,
  composeStrategies,
  evictOldest,
  estimateMessageTokens,
  estimateTextTokens,
  summarizeOldest,
  withCompaction,
} from './compaction.js';
import { runStructuredAnalysis } from './structured-analysis.js';
import { fetchOpenRouterModel, startModelContextRefresh } from './model-context.js';
import { tagsRoutes } from './tags.js';
import { takeawayRoutes } from './takeaway.js';
import {
  deleteCloudModel,
  getDefaultModelId,
  claimHouseOnboardingTurn,
  getOnboardingModelId,
  initDb,
  insertCloudModel,
  listCloudModels,
  recordUsageEvent,
  resolveModelId,
  setDefaultModelToFront,
  updateCloudModel,
  updateUsageEvent,
} from './db.js';
import { requireAdminKey, requireOpenRouterKey } from './http-helpers.js';
import {
  TOOL_LOOP_CEILING,
  TOOL_LOOP_WINDOW_MS,
  admitRequest,
  sweepTurns,
  turnKey,
  type TurnStore,
} from './tool-loop.js';
import {
  admitTurnSpend,
  recordTurnSpend,
  sweepTurnSpends,
  type TurnSpendStore,
} from './credit-turn.js';
import {
  peekCredits,
  readEntitlement,
  releaseReservation,
  reserveCredits,
  settleCredits,
  sweepInsiderRegrants,
  sweepStaleReservations,
} from './billing.js';
import { readIdentity } from './identity.js';
type RunAgentInput = {
  threadId?: string;
  runId?: string;
  messages?: unknown[];
  forwardedProps?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

function readModelId(body: RunAgentInput, knownModelIds: string[]): string {
  const raw = body.forwardedProps?.modelId ?? body.data?.modelId;
  return resolveModelId(typeof raw === 'string' ? raw : undefined, knownModelIds);
}

/**
 * Which Samwell is answering: the reading companion, Compass, or the
 * introduction.
 *
 * Sent as a forwarded prop rather than inferred from the messages, because
 * the surfaces can carry identical text and only the caller knows which one it
 * is. Anything unrecognised is reading chat, so a stale client that predates
 * Compass-over-chat still gets a working assistant.
 *
 * `onboarding` reaching THIS route means the free grant is spent — the app
 * asked `/onboarding/status`, was told no, and sent the same conversation down
 * the metered path instead. Same Samwell, same tools, same script; the reader
 * is paying for it now. See `onboarding.ts`.
 */
type SamwellMode = 'reading' | 'compass' | 'onboarding';

function readMode(body: RunAgentInput): SamwellMode {
  const raw = body.forwardedProps?.mode ?? body.data?.mode;
  if (raw === 'compass') return 'compass';
  if (raw === 'onboarding') return 'onboarding';
  return 'reading';
}

/**
 * The persona each mode is turned toward, and nothing else.
 *
 * The one difference between reading chat, Compass and onboarding. Same
 * transport, same streaming, same compaction, same fallback chain, same
 * reasoning; what changes is which part of the reader's life Samwell is
 * turned toward and which tools he can reach for. Extracted rather than
 * inlined because the cost estimate below needs the same prompts - they are
 * re-sent on every request, so they are part of what the reader pays for -
 * and one mode-to-prompts decision is one chance to keep the two agreeing.
 */
function personaPromptsFor(mode: SamwellMode): string[] {
  // Compass names search_journey in its own prompt, since Compass only
  // ever runs here. The reading persona is shared with the on-device
  // engine, so the journey paragraph is added on this route alone.
  if (mode === 'compass') return [COMPASS_SYSTEM_PROMPT];
  if (mode === 'onboarding') return [ONBOARDING_SYSTEM_PROMPT];
  return [SAMWELL_SYSTEM_PROMPT, SAMWELL_JOURNEY_TOOL_PROMPT, SAMWELL_APP_GUIDE_TOOL_PROMPT];
}

/*
 * The one knob the app's cloud tune sheet dials, read from the same forwarded
 * props as the model id. A hint, not contract: a stale client that sends
 * nothing gets `medium`, and one that still sends the old four-way
 * `reasoningEffort` is understood too.
 */

const THINKING_BUDGETS = ['low', 'medium', 'high'] as const;
type ThinkingBudget = (typeof THINKING_BUDGETS)[number];

function readThinkingBudget(body: RunAgentInput): ThinkingBudget {
  const raw =
    body.forwardedProps?.thinkingBudget ??
    body.data?.thinkingBudget ??
    // Older builds sent a four-way reasoning effort; `off` had no reasoning at
    // all, which the floor now does a little of.
    body.forwardedProps?.reasoningEffort ??
    body.data?.reasoningEffort;
  if ((THINKING_BUDGETS as readonly unknown[]).includes(raw)) return raw as ThinkingBudget;
  if (raw === 'off') return 'low';
  return 'medium';
}

/*
 * No `max_completion_tokens`. A response ends when the model emits its stop
 * token, and every hosted model here enforces its own output ceiling; adding
 * ours on top only gave a long-but-legitimate answer one more place to get
 * clipped — which it did, three times. Length is a prompt concern (the persona
 * tells Samwell to match the question and never pad); depth is `reasoning.effort`.
 */

function isCountableUserTurn(messages: unknown[]): boolean {
  const last = messages.at(-1);
  if (!last || typeof last !== 'object') return true;
  return (last as { role?: unknown }).role === 'user';
}

/**
 * Answer a refusal, and close the event row the request already opened.
 *
 * The row is written before the money checks, because the credit reservation
 * stamps it - which leaves every refused turn with a `'started'` row nothing
 * will ever settle. Marking it here keeps the record honest: a refusal is a
 * thing that happened to this account, and a `'started'` row that never
 * settles is a lie the sweep would have to ignore forever.
 */
async function refuseEvent(
  c: Context,
  usageEventId: string,
  body: Record<string, unknown>,
  status: 402 | 429 | 503,
): Promise<Response> {
  await updateUsageEvent(usageEventId, {
    status: 'errored',
    error: `Refused: ${String(body.error)}`,
  });
  return c.json(body, status);
}

function extractUsage(chunk: StreamChunk): {
  promptTokens?: number | null;
  cachedPromptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
} {
  if (chunk.type !== 'RUN_FINISHED') return {};
  const usage = chunk.usage as
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        cost?: number;
        /**
         * The real cache split, and it does arrive.
         *
         * `buildOpenRouterUsage` copies `promptTokensDetails` through
         * verbatim, and OpenRouter's own `ChatUsagePromptTokensDetails`
         * carries `cachedTokens`. Reading it is what stops the charge being
         * built on an assumed ratio - and the assumption was the pessimistic
         * one, so believing it overcharged the reader on every cached turn.
         */
        promptTokensDetails?: { cachedTokens?: number } | null;
      }
    | undefined;

  const cached = usage?.promptTokensDetails?.cachedTokens;

  return {
    promptTokens: usage?.promptTokens ?? null,
    cachedPromptTokens: typeof cached === 'number' && cached >= 0 ? cached : null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    costUsd: usage?.cost ?? null,
  };
}

/**
 * The share of input tokens caching removes, on the traffic the forecast was
 * built from.
 *
 * Used by the ESTIMATE only, which is made before the request goes out and so
 * cannot know the real split. The SETTLE does know it: OpenRouter reports
 * `prompt_tokens_details.cached_tokens` and `@tanstack/ai-openrouter` copies
 * `promptTokensDetails` through verbatim, so `extractUsage` reads it and the
 * charge is built on what actually happened. This ratio is the settle's
 * fallback only, for a provider that reports no split at all.
 *
 * It is deliberately below the 95% the export observed. For the estimate that
 * is the safe direction - it holds slightly more than the turn will need. It
 * would be the WRONG direction for a charge, which is why the charge does not
 * use it when the real number is there: assuming less caching than happened
 * bills the reader for fresh tokens they never paid for.
 */
const CACHED_SHARE = FORECAST_WORKLOAD.cachedInputTokens / FORECAST_WORKLOAD.inputTokens;

/**
 * How much fatter than the forecast a reservation is allowed to be.
 *
 * The estimate is a median-shaped guess; the hold must absorb ordinary
 * variance without refusing honest turns, and the settle refunds whatever is
 * left over. One and a half times covers a p75-shaped turn with room for a
 * long reply, without holding so much that a reader near their balance is
 * locked out of the message they can actually afford.
 */
const RESERVE_SAFETY = 1.5;

type MeteredBilling = {
  pricing: ModelPricing;
  creditValue: number;
  turnKey: string;
  /** What this turn may spend in total, set when it was admitted. */
  turnCeiling: number;
};

async function* meterStream(
  stream: AsyncIterable<StreamChunk>,
  usageEventId: string,
  threadId: string | undefined,
  modelId: string,
  billing: MeteredBilling | null,
): AsyncIterable<StreamChunk> {
  let settled = false;

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'RUN_FINISHED') {
        settled = true;
        const usage = extractUsage(chunk);
        if (!billing) {
          // On the house: the turn costs real money and is recorded, but
          // there is no balance to charge and none must exist.
          await updateUsageEvent(usageEventId, { status: 'completed', ...usage });
        } else {
          const promptTokens = usage.promptTokens ?? 0;
          const completionTokens = usage.completionTokens ?? 0;
          /*
           * The reported split if there is one, the forecast ratio only when
           * there is not. The reader is charged on what actually happened
           * wherever that is knowable, which is the whole promise the credit
           * system makes.
           */
          const cachedTokens = resolveCachedTokens(
            promptTokens,
            usage.cachedPromptTokens,
            CACHED_SHARE,
          );
          const actual = costToCredits(
            modelCostUsd(
              billing.pricing,
              {
                inputTokens: promptTokens,
                cachedInputTokens: cachedTokens,
                outputTokens: completionTokens,
              },
            ),
            billing.creditValue,
          );
          const spend = recordTurnSpend(
            turnCredits,
            billing.turnKey,
            actual,
            billing.turnCeiling,
            Date.now(),
          );
          const settle = await settleCredits({
            usageEventId,
            actualCredits: actual,
            usage,
            priceSnapshot: {
              inputPricePerMillion: billing.pricing.inputPricePerMillion,
              outputPricePerMillion: billing.pricing.outputPricePerMillion,
            },
            description:
              spend.crossed
                ? `Turn passed its ${billing.turnCeiling} credit ceiling (${spend.total} spent).`
                : undefined,
          });
          /*
           * The balance, ahead of the terminal chunk, so the app can draw it
           * without a second round trip (spec §13.9). Deliberately yielded
           * BEFORE `RUN_FINISHED`, which the loop's trailing `yield chunk`
           * delivers after this: a client that stops reading at the terminal
           * event still gets the balance. Today's app ignores CUSTOM chunks
           * it does not know, which is what makes this safe to send before
           * the app-side work lands.
           */
          const fresh = await peekCredits(turnKeyOwner(billing.turnKey));
          yield {
            type: 'CUSTOM',
            name: 'samwell-credits',
            value: {
              balance: settle.settled ? settle.balance : fresh?.available ?? null,
              available: fresh?.available ?? null,
              spentThisTurn: spend.total,
            },
            threadId: threadId ?? '',
            runId: usageEventId,
            timestamp: Date.now(),
          } as StreamChunk;
        }
      } else if (chunk.type === 'RUN_ERROR') {
        settled = true;
        if (billing) {
          await releaseReservation({
            usageEventId,
            error: chunk.message ?? 'Run error',
          });
        } else {
          await updateUsageEvent(usageEventId, {
            status: 'errored',
            error: chunk.message ?? 'Run error',
          });
        }
      }

      yield chunk;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown stream error';
    console.error('[Samwell Cloud] Stream failed:', error);
    settled = true;
    if (billing) {
      // A failed turn costs nothing: the hold goes back and nothing is
      // charged, whatever the model managed to emit first.
      await releaseReservation({ usageEventId, error: message });
    } else {
      await updateUsageEvent(usageEventId, {
        status: 'errored',
        error: message,
      });
    }
    yield {
      type: 'RUN_ERROR',
      threadId: threadId ?? '',
      runId: usageEventId,
      model: modelId,
      timestamp: Date.now(),
      message,
    } as StreamChunk;
  } finally {
    if (!settled) {
      if (billing) {
        await releaseReservation({
          usageEventId,
          error: 'Stream closed before a terminal event.',
        });
      } else {
        await updateUsageEvent(usageEventId, {
          status: 'errored',
          error: 'Stream closed before a terminal event.',
        });
      }
    }
  }
}

/** The account a turn key belongs to. `turnKey` joins with `::`, and the
 * account id itself never contains that separator. */
function turnKeyOwner(key: string): string {
  return key.split('::')[0];
}

await initDb();

// Background, and deliberately not awaited: the first refresh must not hold
// up the server accepting requests, and every model already has a usable
// floor to fall back on until it lands.
startModelContextRefresh();

/**
 * Where each open turn's continuation count lives.
 *
 * In memory, and single-process by assumption - the Dockerfile runs one node
 * process, and the failure mode if that ever stops being true is lenient: a
 * turn whose continuations land on two instances is counted twice as two
 * shorter turns and gets more rope, not less. The hard stop on spend is the
 * credit balance; this is the guard that keeps an ordinary turn from ever
 * reaching it.
 */
const openTurns: TurnStore = new Map();

/**
 * What each open turn has actually spent, in credits.
 *
 * The ledger records every credit; this is the in-memory running total that
 * makes "how much has THIS message cost so far" a lookup instead of a
 * ledger query in front of every continuation. Same assumptions as
 * `openTurns` - single process, lenient if that ever stops being true, and
 * the balance itself remains the hard stop.
 */
const turnCredits: TurnSpendStore = new Map();

const turnSweeper = setInterval(() => {
  const nowMs = Date.now();
  sweepTurns(openTurns, nowMs);
  sweepTurnSpends(turnCredits, nowMs);
}, TOOL_LOOP_WINDOW_MS);
turnSweeper.unref?.();

/*
 * Two janitors for the credit ledger, on timers for the same reason the turn
 * sweeper is: the work must happen even when no request arrives to trigger
 * it, and it must never sit in front of a reply.
 *
 * The reservation sweep exists for the crash a stream's `finally` cannot
 * cover - the process died mid-turn and the hold is still on the balance.
 * Quarterly of the staleness window is often enough; the window itself is
 * deliberately much longer than any legitimate turn.
 *
 * The insider regrant is a subscription renewal with no store behind it, so
 * a timer plays the webhook's part. Hourly, against terms measured in weeks.
 */
const reservationSweeper = setInterval(() => {
  sweepStaleReservations().catch((error) => {
    console.error('[Samwell Cloud] Reservation sweep failed:', error);
  });
}, 5 * 60_000);
reservationSweeper.unref?.();

const insiderRegrantSweeper = setInterval(() => {
  sweepInsiderRegrants().catch((error) => {
    console.error('[Samwell Cloud] Insider regrant sweep failed:', error);
  });
}, 60 * 60_000);
insiderRegrantSweeper.unref?.();

const app = new Hono();

app.use('*', logger());

app.use(
  '*',
  cors({
    origin: process.env.SAMWELL_ALLOWED_ORIGIN ?? '*',
    // `Authorization` carries the Logto access token every metered route now
    // requires. The device header it replaced is gone: Grand Maester Samwell
    // runs on accounts, so there is nothing anonymous left to allow.
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.get('/health', async (c) => {
  const models = await listCloudModels();
  return c.json({
    ok: true,
    service: 'samwell-cloud',
    chatReady: Boolean(process.env.OPENROUTER_API_KEY),
    // Alongside `chatReady`, and for the same reason: this is the one piece of
    // configuration whose absence has no symptom until somebody tries to use
    // the thing. Without it every metered route answers 500, and from outside
    // that is indistinguishable from the server being broken. One curl now
    // says which it is.
    accountsReady: Boolean(process.env.LOGTO_ENDPOINT),
    /*
     * The two halves of billing, reported for the same reason as the flags
     * above: neither can be read back from outside, and each one's absence
     * has no symptom until somebody tries to pay.
     *
     * `webhookReady` false means a purchase can never grant credits - the
     * webhook route answers 500 and RevenueCat retries into it. `reconcileReady`
     * false is quieter and worse to debug: the webhook still works, but the
     * REST safety net that covers a late or missed one is silently skipped,
     * so a subscriber whose webhook went astray simply stays on "no plan"
     * with nothing in a log to say why.
     */
    webhookReady: Boolean(process.env.REVENUECAT_WEBHOOK_SECRET),
    reconcileReady: Boolean(process.env.REVENUECAT_SECRET_API_KEY),
    models: models.map((model) => model.id),
    // Which model the house is paying for on the onboarding route.
    //
    // Reported for the same reason as the two flags above: it is set by an
    // environment variable or a settings row, neither of which can be read
    // back from outside, and getting it wrong has no symptom until somebody's
    // first conversation is served by the wrong model and quietly billed to
    // nobody. Not sensitive — the catalogue is already in this response.
    onboardingModel: await getOnboardingModelId(),
    /*
     * How many models each plan can actually reach, and whether any of them
     * have prices yet.
     *
     * Both are silent failures otherwise. `min_plan` defaults to the dearest
     * tier, deliberately, so a catalogue carried across from before plans
     * existed leaves every cheaper plan with nothing to talk to — a paying
     * reader would open the picker and find it empty, and nothing in a log
     * would say why. A model with no price is the other half: it cannot be
     * charged for, so it has to refuse the turn.
     *
     * One curl says whether the catalogue has been set up for plans.
     */
    modelsByPlan: Object.fromEntries(
      PLAN_ORDER.map((plan) => [plan, modelsForPlan(models, plan).length]),
    ),
    modelsMissingPrices: models
      .filter((model) => model.inputPricePerMillion === null || model.outputPricePerMillion === null)
      .map((model) => model.id),
  });
});

app.get('/models', async (c) => {
  const models = await listCloudModels();
  return c.json({
    models,
    defaultModelId: await getDefaultModelId(),
  });
});

/** The single response shape every admin mutation returns, so one curl always
 * ends with the new full state in hand. */
async function adminModelState(c: Context) {
  return c.json({
    models: await listCloudModels(),
    defaultModelId: await getDefaultModelId(),
  });
}

/*
 * Model management at runtime.
 *
 * The admin sends an identifier and a tier; label, provider, context window,
 * capabilities and prices are pulled from OpenRouter's model metadata (the
 * same source the background refresh reads), so there is no second place where
 * a model's facts are written down and no deploy needed to swap one. A model ID
 * OpenRouter does not know is rejected before it can enter the fallback chain,
 * and OpenRouter being unreachable fails the mutation rather than storing a
 * half-known row.
 *
 * The tier is the one thing that cannot be derived. It is a pricing decision
 * rather than a fact about the model, and it is required rather than defaulted
 * so nobody adds a frontier model to the cheapest plan by omission.
 */
const AddModelSchema = z.object({
  id: z.string().min(1),
  minPlan: z.enum(PLAN_ORDER as unknown as [PlanId, ...PlanId[]]),
  makeDefault: z.boolean().optional(),
});

async function requireFetchedModel(
  id: string,
  minPlan: PlanId,
): Promise<{ model: CloudModelOption; canonicalId: string }> {
  const result = await fetchOpenRouterModel(id, minPlan);
  if (result.kind === 'unknown_id') {
    throw new HTTPException(400, { message: `OpenRouter has no model with id '${id}'.` });
  }
  if (result.kind === 'unreachable') {
    throw new HTTPException(502, { message: 'Could not reach OpenRouter to verify the model.' });
  }
  return { model: result.model, canonicalId: result.canonicalId };
}

app.post('/admin/models', async (c) => {
  requireAdminKey(c);

  const body = await c.req.json();
  const parsed = AddModelSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const { model, canonicalId } = await requireFetchedModel(parsed.data.id, parsed.data.minPlan);
  const existing = await listCloudModels();
  if (existing.some((m) => m.id === canonicalId)) {
    // Idempotent: adding an existing ID refreshes its metadata in place,
    // which is also how a stale row gets re-pulled.
    await updateCloudModel(model);
  } else {
    await insertCloudModel(model);
  }
  if (parsed.data.makeDefault) {
    await setDefaultModelToFront(canonicalId);
  }
  return adminModelState(c);
});

/*
 * Model IDs contain a slash ("openai/gpt-5.6-luna"), so these params use
 * `{.+}` to capture across slashes; a plain `:id` stops at the first slash
 * and every lookup would 404.
 */

/**
 * Re-pull a stored model's metadata from OpenRouter, and optionally move it
 * between tiers.
 *
 * The tier is kept unless the body names a new one. A refresh is about the
 * facts OpenRouter publishes, and silently resetting a model's tier because
 * somebody asked for fresh prices would be a pricing change disguised as
 * maintenance.
 */
app.patch('/admin/models/:id{.+}', async (c) => {
  requireAdminKey(c);

  const id = c.req.param('id');
  const known = await listCloudModels();
  const existing = known.find((m) => m.id === id);
  if (!existing) {
    throw new HTTPException(404, { message: `Model '${id}' is not in the catalog.` });
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = z
    .object({ minPlan: z.enum(PLAN_ORDER as unknown as [PlanId, ...PlanId[]]).optional() })
    .safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const { model } = await requireFetchedModel(id, parsed.data.minPlan ?? existing.minPlan);
  await updateCloudModel(model);
  return adminModelState(c);
});

app.delete('/admin/models/:id{.+}', async (c) => {
  requireAdminKey(c);

  const id = c.req.param('id');
  const known = await listCloudModels();
  if (!known.some((m) => m.id === id)) {
    throw new HTTPException(404, { message: `Model '${id}' is not in the catalog.` });
  }

  await deleteCloudModel(id);
  return adminModelState(c);
});

app.put('/admin/models/default', async (c) => {
  requireAdminKey(c);

  const body = await c.req.json();
  const parsed = z.object({ id: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const known = await listCloudModels();
  if (!known.some((m) => m.id === parsed.data.id)) {
    throw new HTTPException(404, { message: `Model '${parsed.data.id}' is not in the catalog.` });
  }

  await setDefaultModelToFront(parsed.data.id);
  return adminModelState(c);
});


app.route('/tags', tagsRoutes);
app.route('/chat', chatTitleRoutes);
// The reconciliation of a goal that just ended, beside the Compass routes it
// belongs to.
app.route('/compass', takeawayRoutes);
// The free introduction. Authenticated like everything else, granted once per
// account, and the only route here that never writes to `usage_events`.
app.route('/onboarding', onboardingRoutes);
// Free books for an empty library. Under /library because it is about what
// goes into one, not about who is asking.
app.route('/library', gutenbergRoutes);
// What a reader holds, what they spent it on, and insider codes. The store's
// own word about subscriptions arrives on the second of these, from
// RevenueCat, keyed to a secret only it and the deployment know.
app.route('/billing', billingRoutes);
app.route('/billing', billingWebhookRoutes);
app.route('/admin/insider', insiderAdminRoutes);

app.post('/chat/http', async (c) => {
  requireOpenRouterKey();

  const { id: accountId } = await readIdentity(c);
  const body = (await c.req.json()) as RunAgentInput;
  if (!Array.isArray(body.messages)) {
    throw new HTTPException(400, { message: 'messages must be an array.' });
  }

  const mode = readMode(body);

  /*
   * Onboarding is on the house, on this route as much as on the free one.
   *
   * Reaching `/chat/http` in onboarding mode means the grant is spent, which
   * says something about the account and nothing about who should pay. An
   * introduction to the app is Open Citadel's cost: a reader who reinstalls,
   * or picks up a second device, should not have their allowance spent being
   * told what the app is for. The event is still written, with its own kind,
   * so the spend is legible to us even though it is invisible to them.
   *
   * Bounded by a lifetime ceiling rather than by the grant, because "free" and
   * "unbounded" cannot both be true and `mode: 'onboarding'` is a claim the
   * client makes. Past that ceiling the turns count again, which degrades
   * rather than refuses.
   */
  const isNewUserTurn = isCountableUserTurn(body.messages);

  /*
   * How many times this message has already been round the tool loop.
   *
   * First, before the onboarding grant is touched and before anything is
   * reserved or sent. A turn past the ceiling has had every chance to finish,
   * so the cheapest thing to do with the next request is nothing at all -
   * and a request that is about to be refused must not spend one of the
   * house's onboarding turns on its way to being refused.
   *
   * See `tool-loop.ts` for why twelve.
   */
  const loop = admitRequest(
    openTurns,
    turnKey(accountId, body.threadId),
    isNewUserTurn,
    Date.now(),
  );
  if (!loop.allowed) {
    console.warn(
      `[Samwell Cloud] Tool loop ceiling hit: account=${accountId} ` +
        `thread=${body.threadId ?? '(none)'} continuations=${loop.continuations}`,
    );
    return c.json(
      {
        error: 'tool_loop_exhausted',
        ceiling: TOOL_LOOP_CEILING,
        continuations: loop.continuations,
      },
      429,
    );
  }

  const onTheHouse = mode === 'onboarding' && (await claimHouseOnboardingTurn(accountId));

  const knownModels = await listCloudModels();

  /*
   * Who pays, and what they may reach.
   *
   * A turn the reader pays for needs a plan, and the plan decides which
   * models exist for this request - not as a display nicety but as the
   * resolution universe: a stale client asking for an Archmaester model on a
   * Maester plan lands on the plan's default instead of being served
   * something it did not pay for, and the fallback chain below is built from
   * the same list, so OpenRouter cannot reroute a Maester turn to an
   * Archmaester model and bill the house the difference.
   */
  const entitlement = onTheHouse ? null : await readEntitlement(accountId);
  if (!onTheHouse && !entitlement?.plan) {
    return c.json(
      { error: 'no_subscription', message: 'Subscribe to talk with Samwell Cloud.' },
      402,
    );
  }
  const plan: PlanId = entitlement?.plan ?? 'maester';
  const planModels = modelsForPlan(knownModels, plan);
  const planModelIds = planModels.map((model) => model.id);

  const rawMessages = body.messages as { role?: string; content?: unknown }[];
  const sessionSystemPrompts = rawMessages
    .filter((m) => m?.role === 'system' && typeof m.content === 'string' && m.content.trim())
    .map((m) => m.content as string);
  const conversationMessages = rawMessages.filter((m) => m?.role !== 'system');

  /*
   * Onboarding runs on the onboarding model, whoever is paying for it.
   *
   * Reaching this route at all means the account's free grant is spent, so the
   * turn is billed. That decides who pays; it does not decide what to use. The
   * conversation is the same fixed script either way, tuned against the model
   * the house chose for it, and putting it on whatever frontier model the
   * reader happens to have selected makes their first run both more expensive
   * and less predictable than the one everybody else gets.
   *
   * Unvalidated against the catalogue on purpose, exactly as the free route
   * does it: the onboarding model is the server's own choice and has no reason
   * to appear in the list the app offers readers.
   */
  const modelId =
    mode === 'onboarding'
      ? await getOnboardingModelId()
      : readModelId(body, planModelIds);
  const thinkingBudget = readThinkingBudget(body);
  const usageEventId =
    body.runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // The event row exists before any hold is taken against it: the credit
  // reservation stamps `credits_reserved` onto it, and the sweep finds stale
  // holds by that stamp.
  await recordUsageEvent({
    id: usageEventId,
    accountId,
    modelId,
    countsTowardLimit: onTheHouse ? false : isNewUserTurn,
    // Metered separately so Compass spend is legible in the usage record,
    // even though it now travels the same route as reading chat.
    ...(mode === 'compass'
      ? { kind: 'compass_chat' }
      : mode === 'onboarding'
        ? // Onboarding reaching the metered route at all means the free grant
          // was spent. Recorded under its own kind so a repeat first run is
          // legible as one rather than looking like ordinary chat.
          { kind: 'onboarding_chat' }
        : {}),
  });

  /*
   * What this request is expected to cost, and whether it may proceed.
   *
   * The estimate is built the way the one shown to readers is: the request's
   * own prompt tokens at the model's snapshot prices, with the forecast's
   * cached share taken off and the forecast's output added. Both halves use
   * the same basis, so the number the app showed and the number the server
   * holds against cannot disagree by construction.
   *
   * The reservation is the atomic gate - `balance - reserved >= required` in
   * one UPDATE - so two concurrent turns cannot both spend the same credit
   * (spec §14). A refusal here is a 402 with the numbers, which the app
   * turns into the reader-facing message.
   */
  let metered: MeteredBilling | null = null;
  if (!onTheHouse) {
    /*
     * Onboarding billed to the reader still runs on the onboarding model -
     * it is the house's choice of model, not the reader's, and "who pays"
     * was decided above without touching "what to use". So the pricing
     * lookup reads the whole catalogue for this one mode; every other mode
     * is plan-scoped, where an unknown id is the 503 below.
     */
    const model =
      mode === 'onboarding'
        ? knownModels.find((m) => m.id === modelId)
        : planModels.find((m) => m.id === modelId);
    if (!model) {
      // The plan band is empty - the deployment state `/health` reports as
      // `modelsByPlan`. Refusing beats routing an unpayable model.
      return refuseEvent(c, usageEventId, { error: 'no_models_for_plan', plan }, 503);
    }
    if (model.inputPricePerMillion == null || model.outputPricePerMillion == null) {
      // A model with no price cannot be charged, and charging nothing is the
      // one way to lose money quietly. See the column comment in `db.ts`.
      return refuseEvent(c, usageEventId, { error: 'model_unpriced', model: model.id }, 503);
    }
    const pricing: ModelPricing = {
      inputPricePerMillion: model.inputPricePerMillion,
      outputPricePerMillion: model.outputPricePerMillion,
      cachedInputPricePerMillion: model.cachedInputPricePerMillion,
    };
    const creditValue = creditValueUsd(CREDIT_PLANS[plan]);

    const promptTokens =
      conversationMessages.reduce(
        (sum, message) => sum + estimateMessageTokens(message as unknown as ModelMessage),
        0,
      ) +
      // The persona and the book grounding are re-sent by the server on every
      // request; the client never sends them, so the estimate adds them.
      [...personaPromptsFor(mode), ...sessionSystemPrompts].reduce(
        (sum, text) => sum + estimateTextTokens(text),
        0,
      );
    // No reported split exists yet - the request has not gone out - so this
    // is the one place the ratio is the whole answer.
    const cachedTokens = resolveCachedTokens(promptTokens, null, CACHED_SHARE);
    const required = Math.ceil(
      costToCredits(
        modelCostUsd(pricing, {
          inputTokens: promptTokens,
          cachedInputTokens: cachedTokens,
          outputTokens: FORECAST_WORKLOAD.outputTokens,
        }),
        creditValue,
      ) * RESERVE_SAFETY,
    );

    /*
     * Guard 4 - the money backstop. One message may not cost more than its
     * share of what the reader has left; past it, the settle that crosses
     * carries a ledger note and every further request in the turn is
     * refused. The first three guards make this unreachable in practice;
     * this is what makes the unreachable case survivable.
     */
    const fresh = await peekCredits(accountId);
    const turn = admitTurnSpend(
      turnCredits,
      turnKey(accountId, body.threadId),
      isNewUserTurn,
      required,
      fresh?.available ?? 0,
      Date.now(),
    );
    if (!turn.allowed) {
      return refuseEvent(
        c,
        usageEventId,
        {
          error: 'credit_turn_ceiling',
          spent: turn.spent,
          ceiling: turn.ceiling,
          available: fresh?.available ?? 0,
        },
        429,
      );
    }

    const reserve = await reserveCredits({
      accountId,
      usageEventId,
      credits: required,
    });
    if (!reserve.allowed) {
      if (reserve.reason === 'insufficient_credits') {
        return refuseEvent(
          c,
          usageEventId,
          {
            error: 'insufficient_credits',
            required,
            available: reserve.available,
          },
          402,
        );
      }
      return refuseEvent(
        c,
        usageEventId,
        { error: 'no_subscription', message: 'Subscribe to talk with Samwell Cloud.' },
        402,
      );
    }
    metered = {
      pricing,
      creditValue,
      turnKey: turnKey(accountId, body.threadId),
      turnCeiling: turn.ceiling,
    };
  }

  /*
   * Fallbacks OpenRouter may reroute to if the primary is unavailable.
   *
   * From the plan's models ONLY. This is where a Maester turn is prevented
   * from quietly landing on an Archmaester model - the reroute would cost
   * the house the difference, which is exactly the leak credits exist to
   * close. Filtered by capability as well: this request carries tool
   * definitions, so a model that cannot call tools is not a substitute for
   * one that can - it is a destination where the request arrives broken.
   * Every model in the catalogue happens to support tools today, which is
   * exactly why this is worth pinning down now: `/admin/models` can add one
   * that does not, and nothing else would catch it.
   */
  const fallbackModels = planModels.filter(
    (model) => model.id !== modelId && model.capabilities.includes('tools'),
  );

  /*
   * Compact against the smallest window the request could actually land on,
   * not the primary's.
   *
   * A fallback is a different model with a different window. Sizing the
   * request for the primary alone means a conversation trimmed to fit
   * Gemini's million tokens can be rerouted to a 128k model and overflow
   * there - the exact failure compaction exists to prevent, arriving by the
   * one path that looks like it was handled.
   */
  const contextTokens = Math.min(
    ...[
      planModels.find((model) => model.id === modelId) ?? { contextTokens: null },
      ...fallbackModels,
    ].map(resolveContextTokens),
  );
  const compactionBudget = Math.min(
    Math.floor(contextTokens * CONTEXT_BUDGET_RATIO),
    ABSOLUTE_COMPACTION_CEILING,
  );

  const stream = chat({
    adapter: openRouterText(modelId as any, {
      httpReferer: process.env.OPENROUTER_HTTP_REFERER,
      appTitle: process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
    }),
    messages: conversationMessages as any,
    /*
     * The only difference between reading chat and Compass.
     *
     * Same transport, same streaming, same compaction, same fallback chain,
     * same reasoning. What changes is which part of the user's life Samwell is
     * turned toward and which tools he can reach for, which is what the two
     * surfaces were always supposed to differ by. Compass used to be a
     * separate structured-output route, and everything unstable about it came
     * from that separation rather than from anything Compass does.
     */
    systemPrompts: [...personaPromptsFor(mode), ...sessionSystemPrompts],
    tools:
      mode === 'compass'
        ? COMPASS_CLIENT_TOOL_DEFINITIONS
        : mode === 'onboarding'
          ? ONBOARDING_CLIENT_TOOL_DEFINITIONS
          : SAMWELL_CLIENT_TOOL_DEFINITIONS,
    threadId: body.threadId,
    runId: body.runId ?? usageEventId,
    /*
     * No `agentLoopStrategy` here on purpose.
     *
     * It looks like the answer to a runaway turn and it is not. It bounds
     * iterations INSIDE one server-side loop, and every tool Samwell has runs
     * on the device, so the run ends at the first tool call and the number it
     * would cap is always one. What actually bounds a turn is `tool-loop.ts`,
     * counting requests across the whole run.
     *
     * Nor is there a hole to close: `@tanstack/ai` already defaults this to
     * `maxIterations(5)`, which is a sensible bound for the day a server tool
     * is added. Replacing a reasonable default with our own arbitrary number
     * would be a change that reads as a safeguard while doing nothing, and
     * pairing it with a message-count clause would leave a trap - a long
     * thread silently losing its server-side continuation, on a line nobody
     * would think to look at.
     */
    middleware: [
      withCompaction({
        // A share of the window rather than all of it: the system prompts,
        // the tool schemas and the reply reserve are all charged against the
        // same budget and none of them are in `messages`, so compacting only
        // once the messages alone fill the window would still overflow.
        maxTokens: compactionBudget,
        strategy: composeStrategies(
          // Cheap and lossless in meaning: keeps every turn, drops only what
          // old tool calls returned.
          clearToolResults(),
          // Costs one model call, keeps what was actually said. A reading
          // companion whose whole value is continuity should not forget the
          // book you told it about two hundred messages ago.
          summarizeOldest({
            summarize: (dropped) =>
              summarizeForCompaction({ dropped, modelId, accountId }),
          }),
          // Last resort, if summarising failed or was not enough.
          evictOldest(),
        ),
        onCompact: (info) => {
          console.log(
            `[Compaction] ${info.messagesBefore}->${info.messagesAfter} messages, ` +
              `~${info.before}->${info.after} tokens (budget ${compactionBudget})`,
          );
        },
      }),
    ],
    modelOptions: {
      models: fallbackModels.map((model) => model.id) as any,
      temperature: 0.7,
      toolChoice: 'auto',
      /*
       * One tool per round trip, deliberately - but this is the most expensive
       * line in the file and it should not stay unexamined.
       *
       * Samwell's tools run on the device, so every tool call ends the run and
       * the answer arrives on a fresh request carrying the whole conversation
       * again. Serial calls therefore cost O(n^2) in tokens: a turn that needs
       * five things from the library re-sends the growing history five times.
       * That is how the worst turn on record reached 14.6 million prompt
       * tokens. Parallel calls would collapse those five into one.
       *
       * What was checked before leaving it off:
       *  - Approvals are NOT the blocker. `cloud-chat.ts` drains its own
       *    `approvals` queue one at a time, so the single pending slot per
       *    session in `stores/approval.ts` is never contended even if several
       *    gated calls arrive together.
       *  - The open risk is the tools themselves. They mutate the device
       *    database through `chat-tools.ts`, and nothing there is written to
       *    be safe against a sibling call interleaving with it - two goal or
       *    trackable writes in the same batch are the case to think about.
       *
       * So this is a product decision, not a billing one, and it is left as it
       * was found. The loop ceiling and the compaction ceiling already bound
       * what a turn can cost; turning this on would make turns cheaper AND
       * change how Samwell behaves, which wants its own change and its own
       * testing.
       */
      parallelToolCalls: false,
      /*
       * Ask for the reasoning back rather than leaving it internal, at the
       * effort the thinking budget names — the app's `low`/`medium`/`high` are
       * OpenRouter's own effort scale, so this is a pass-through.
       *
       * OpenRouter returns reasoning only when the request asks for it, so a
       * reasoning model's thinking was being spent and thrown away. `effort`
       * is the only reasoning field the OpenRouter SDK forwards (it strips the
       * rest), and supplying it is itself what enables reasoning. A model that
       * cannot reason ignores it and emits no reasoning deltas, which is what
       * makes this safe to send down the whole fallback chain rather than
       * gating on a capability flag the catalogue does not carry.
       */
      reasoning: { effort: thinkingBudget },
    },
  });

  console.log(
    `[Samwell Cloud] ${mode} turn: model=${modelId} thinkingBudget=${thinkingBudget}` +
      (mode === 'onboarding'
        ? ` billed=${onTheHouse ? 'house' : 'reader'}`
        : ` plan=${plan}`),
  );

  return toHttpResponse(meterStream(stream, usageEventId, body.threadId, modelId, metered), {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
});

/**
 * Share of a model's context window that conversation messages may occupy.
 *
 * The rest pays for what is not in `messages` and is charged anyway: the
 * Samwell persona and the session's book grounding (`systemPrompts`), the tool
 * schemas, and the room the reply itself needs. Two thirds leaves comfortable
 * headroom on every model in the catalogue while still only compacting a
 * conversation that has genuinely run long.
 */
const CONTEXT_BUDGET_RATIO = 0.66;

/**
 * The most conversation any single request may carry, whatever the window.
 *
 * The ratio above was written when the catalogue topped out at 200k tokens,
 * where two thirds is 132k and reads as generous. Every model in the catalogue
 * is now a million or more, where the same ratio is 660,000 - and because a
 * conversation is re-sent in full on every turn, that is licence for one
 * thread to grow until a single message costs more than a month of ordinary
 * use. Measured on real traffic, the worst 11% of turns were 91% of all spend,
 * and the worst single turn accumulated 14.6 million prompt tokens.
 *
 * A window being large is not a reason to fill it. The ratio still governs
 * small-window models, where it is the binding constraint; this governs
 * everything else, and it is what stops a long conversation from becoming an
 * expensive one.
 */
const ABSOLUTE_COMPACTION_CEILING = 60_000;

const CompactionSummarySchema = z.object({
  summary: z.string(),
});

const COMPACTION_SUMMARY_PROMPT = `You are compressing the earlier part of a conversation so it can be carried forward in a smaller context window.

Write a factual summary in the third person. Preserve, in this order of priority:
- what the reader is trying to understand or decide
- any book, chapter or passage being discussed, by name
- conclusions already reached, so they are not re-litigated
- commitments or preferences the reader stated

Leave out pleasantries, restated questions, and anything already obvious from the recent messages that follow. Do not invent detail that is not present. Aim for one short paragraph.`;

/**
 * Summarise the turns compaction is about to drop.
 *
 * Metered but not counted against the reader's cap: this is machinery they did
 * not ask for, so it should not consume their quota, while still being
 * recorded because it costs real money. A failure here is not fatal —
 * `summarizeOldest` leaves the history intact and the composed strategy falls
 * through to `evictOldest`.
 */
async function summarizeForCompaction({
  dropped,
  modelId,
  accountId,
}: {
  dropped: { role: string; content: unknown }[];
  modelId: string;
  accountId: string;
}): Promise<string> {
  const transcript = dropped
    .map((message) => {
      const text =
        typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content);
      return `${message.role}: ${text}`;
    })
    .join('\n\n');

  const usageEventId = `compaction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await recordUsageEvent({
    id: usageEventId,
    accountId,
    modelId,
    countsTowardLimit: false,
    kind: 'compaction_summary',
  });

  const result = await runStructuredAnalysis({
    modelId,
    systemPrompts: [COMPACTION_SUMMARY_PROMPT],
    messages: [{ role: 'user', content: transcript }],
    schema: CompactionSummarySchema,
    usageEventId,
    maxCompletionTokens: 600,
    failureCode: 'compaction_summary_failed',
  });

  return result.summary;
}

app.onError((err, c) => {
  console.error('[Samwell Cloud] Request failed:', err);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  return c.json({ error: 'internal_server_error' }, 500);
});

const port = Number(process.env.PORT ?? 8787);
serve(
  {
    fetch: app.fetch,
    hostname: '0.0.0.0',
    port,
  },
  () => {
    console.log(`Samwell Cloud server listening on http://0.0.0.0:${port}`);
  },
);
