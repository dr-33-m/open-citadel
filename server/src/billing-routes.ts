/**
 * The routes a reader (or the founder, for insiders) calls about credits.
 *
 * Everything the app draws about its subscription comes from here: the
 * balance, the plan's models with their estimates and multipliers. The
 * numbers are computed on this side, per the spec's rule that the app never
 * sees a price - OpenRouter stays an implementation detail, and a stale
 * client cannot turn a model's real cost into a display decision.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import {
  CREDIT_PLANS,
  creditValueUsd,
  forecastCredits,
  forecastMultipliersByBand,
  modelsForPlan,
  PLAN_ORDER,
  type CloudModelOption,
  type PlanId,
} from 'samwell-shared';

import { billing } from './billing.js';
import { getDefaultModelIdForPlan, getForecastWorkload, listCloudModels } from './db.js';
import { requireAdminKey } from './http-helpers.js';
import { readIdentity } from './identity.js';

export const billingRoutes = new Hono();

/**
 * The catalogue as the plan cards draw it.
 *
 * Shared by `/me` and the public `/plans` below, because the two must agree:
 * the credits a plan is advertised as buying before somebody signs in are the
 * same credits they are told about afterwards, and two copies of this
 * arithmetic would be two chances for those numbers to drift apart.
 *
 * `pricingPlan` is whose credit value the estimates are computed against. A
 * reader without a plan previews the entry band, which is what the carousel
 * is selling.
 */
async function readCatalogue(pricingPlan: PlanId) {
  const models = await listCloudModels();
  const forecast = await getForecastWorkload();
  const multipliers = forecastMultipliersByBand(models, forecast);
  const creditValue = creditValueUsd(CREDIT_PLANS[pricingPlan]);

  const toPlanModel = (model: CloudModelOption) => {
    const priced =
      model.inputPricePerMillion != null && model.outputPricePerMillion != null
        ? {
            inputPricePerMillion: model.inputPricePerMillion,
            outputPricePerMillion: model.outputPricePerMillion,
            cachedInputPricePerMillion: model.cachedInputPricePerMillion,
          }
        : null;
    return {
      ...model,
      forecastCredits: priced ? forecastCredits(priced, creditValue, forecast) : null,
      multiplier: multipliers[model.id] ?? 1,
    };
  };

  return {
    models,
    toPlanModel,
    /*
     * How many models each plan reaches, for the plan cards.
     *
     * Answered here because only this side knows: the catalogue lives in the
     * database and a tier can gain or lose a model through `/admin/models`
     * without a deploy. The app counting them itself would mean hardcoding
     * "three per tier", which is true today and becomes a lie the first time
     * a model is added.
     */
    modelsByPlan: Object.fromEntries(
      PLAN_ORDER.map((plan) => [plan, modelsForPlan(models, plan).length]),
    ),
    /*
     * The whole catalogue, each model with the tier it belongs to, for the
     * plan carousel's info sheets. A sheet selling a tier the reader does not
     * hold yet still has to name what that tier opens up - `models` in `/me`
     * is band-filtered and cannot answer for a plan above the reader's own.
     *
     * This is not a new exposure: `/models` already publishes the catalogue
     * whole, and what is added here is each model's credit estimate against
     * the forecast - a credits number, never a price. The picker's own rule
     * stands: models above the reader's plan are not listed THERE.
     */
    catalogue: models.map(toPlanModel),
  };
}

billingRoutes.get('/me', async (c) => {
  const { id: accountId } = await readIdentity(c);
  const balance = await billing.readEntitlement(accountId);

  const { models, toPlanModel, modelsByPlan, catalogue } = await readCatalogue(
    balance.plan ?? 'maester',
  );
  /*
   * A reader without a plan is shown the entry band: what the cheapest plan
   * buys is exactly the thing the plan carousel is selling, and an empty list
   * would draw an empty picker on a route whose whole job is to answer "what
   * can I reach". The app does not draw the model card without a plan, so
   * this is a preview at worst.
   */
  const visible = modelsForPlan(models, balance.plan ?? 'maester');

  return c.json({
    balance,
    // The top of their own band. A reader without a plan is previewing the
    // entry tier, so that is the one they are shown.
    defaultModelId: await getDefaultModelIdForPlan(balance.plan ?? 'maester'),
    modelsByPlan,
    models: visible.map(toPlanModel),
    catalogue,
  });
});

/**
 * What is on sale, to anybody who asks.
 *
 * The one route here that takes no account, and it is the point: App Review
 * reads a plan carousel behind a sign-in wall as registration required in
 * order to buy, so the cards have to be able to draw before there is anybody
 * to draw them for. Nothing here is about a person - it is the same
 * catalogue `/models` already publishes, plus the credit estimates the cards
 * quote - so there is nothing to meter and nobody to identify.
 *
 * Priced against the entry band, matching what `/me` shows a reader who has
 * no plan yet. Signing in must not change the numbers they were just reading.
 */
billingRoutes.get('/plans', async (c) => {
  const { modelsByPlan, catalogue } = await readCatalogue('maester');
  return c.json({ modelsByPlan, catalogue });
});

billingRoutes.get('/ledger', async (c) => {
  const { id: accountId } = await readIdentity(c);
  const rawLimit = Number(c.req.query('limit') ?? '50');
  const limit = Math.max(1, Math.min(200, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50));

  return c.json({ entries: await billing.readLedger(accountId, limit) });
});

const RedeemSchema = z.object({ code: z.string().min(1) });

billingRoutes.post('/insider/redeem', async (c) => {
  const { id: accountId } = await readIdentity(c);

  const parsed = RedeemSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const result = await billing.redeemInsiderInvite({ accountId, code: parsed.data.code });
  if (!result.redeemed) {
    if (result.reason === 'unknown_code') {
      throw new HTTPException(404, { message: 'That code does not exist.' });
    }
    if (result.reason === 'already_subscribed') {
      throw new HTTPException(409, {
        message: 'This account already has a subscription. Keep the code for somebody who needs it.',
      });
    }
    throw new HTTPException(409, { message: 'That code has already been redeemed.' });
  }
  return c.json({ ok: true, balance: result.balance });
});

/*
 * The founder's side of insiders: minting codes. Behind the admin key like
 * every other mutation that is not a reader's business.
 */
export const insiderAdminRoutes = new Hono();

const InviteSchema = z.object({
  plan: z.enum(PLAN_ORDER as unknown as [PlanId, ...PlanId[]]),
  durationDays: z.number().int().min(1).max(365),
  note: z.string().max(500).optional(),
});

insiderAdminRoutes.post('/invites', async (c) => {
  requireAdminKey(c);

  const parsed = InviteSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const invite = await billing.issueInsiderInvite({
    plan: parsed.data.plan,
    durationDays: parsed.data.durationDays,
    note: parsed.data.note,
  });
  return c.json({ ok: true, ...invite });
});
