import { chat, toHttpResponse } from '@tanstack/ai';
import { openRouterText } from '@tanstack/ai-openrouter';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  ONBOARDING_CLIENT_TOOL_DEFINITIONS,
  ONBOARDING_SYSTEM_PROMPT,
  resolveContextTokens,
} from 'samwell-shared';

import { clearToolResults, composeStrategies, evictOldest, withCompaction } from './compaction.js';
import {
  claimOnboardingTurn,
  completeOnboardingGrant,
  getOnboardingModelId,
  listCloudModels,
  onboardingGrantOpen,
} from './db.js';
import { requireOpenRouterKey } from './http-helpers.js';
import { readIdentity } from './identity.js';

/**
 * The introduction, on the house.
 *
 * This is the one route in Samwell Cloud that costs the reader nothing. It is
 * somebody's first contact with the cloud, before they have chosen a model,
 * before they have a subscription, and quite possibly before they believe any
 * of this is worth paying for. Charging it against a quota they have not
 * spent yet would be billing them for the sales pitch.
 *
 * Three things make that safe, and all three are deliberate:
 *
 * 1. **It is still authenticated.** `readIdentity` runs exactly as it does on
 *    the metered route. Free does not mean open, and there is no anonymous
 *    path into this server.
 * 2. **It is granted once per account.** See `claimOnboardingTurn`. The grant
 *    normally closes when the app reports `finish_onboarding`; the turn
 *    ceiling is the backstop for a conversation that never gets there.
 * 3. **The model is ours to choose.** The client sends no model id, so a free
 *    conversation cannot be pointed at the most expensive thing in the
 *    catalogue.
 *
 * Nothing here writes to `usage_events`. That is the checkable form of the
 * claim: if a row for onboarding ever appears in the table where spend is
 * recorded, this route has stopped being what it says it is.
 */
export const onboardingRoutes = new Hono();

type RunInput = {
  threadId?: string;
  runId?: string;
  messages?: unknown[];
};

/** Same share of the window the metered route uses. See CONTEXT_BUDGET_RATIO. */
const CONTEXT_BUDGET_RATIO = 0.66;

/**
 * Whether this account still has its free conversation.
 *
 * Asked before the first turn rather than discovered by a 403 mid-stream. The
 * app needs the answer to decide which route to send the conversation down,
 * and reading it off a failed request would mean sniffing an error string for
 * a fact the server can simply be asked for.
 *
 * The case this exists for is real: somebody who onboarded, then reinstalled
 * or picked up a second device. Their phone thinks it is a first run; their
 * account knows better.
 */
onboardingRoutes.get('/status', async (c) => {
  const { id: accountId } = await readIdentity(c);
  return c.json({ open: await onboardingGrantOpen(accountId) });
});

onboardingRoutes.post('/chat', async (c) => {
  requireOpenRouterKey();

  const { id: accountId } = await readIdentity(c);

  const grant = await claimOnboardingTurn(accountId);
  if (!grant.open) {
    /*
     * 403 with a reason, not a 429.
     *
     * There is no quota here to be over and nothing to wait for: this account
     * has had its free conversation. The app reads `reason` and falls back to
     * the ordinary metered chat, so somebody re-running onboarding pays for it
     * rather than hitting a wall.
     */
    return c.json({ error: 'onboarding_grant_closed', reason: grant.reason }, 403);
  }

  const body = (await c.req.json()) as RunInput;
  if (!Array.isArray(body.messages)) {
    throw new HTTPException(400, { message: 'messages must be an array.' });
  }

  const rawMessages = body.messages as { role?: string; content?: unknown }[];
  // The setup notes ride in as a system message from the device, because every
  // fact in them is the device's: who is signed in, which platform, whether
  // there is already a library. See `onboardingSetupNotes`.
  const sessionSystemPrompts = rawMessages
    .filter((m) => m?.role === 'system' && typeof m.content === 'string' && m.content.trim())
    .map((m) => m.content as string);
  const conversationMessages = rawMessages.filter((m) => m?.role !== 'system');

  const modelId = await getOnboardingModelId();
  const knownModels = await listCloudModels();
  const contextTokens = resolveContextTokens(
    knownModels.find((model) => model.id === modelId) ?? { contextTokens: null },
  );

  const stream = chat({
    adapter: openRouterText(modelId as any, {
      httpReferer: process.env.OPENROUTER_HTTP_REFERER,
      appTitle: process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
    }),
    messages: conversationMessages as any,
    systemPrompts: [ONBOARDING_SYSTEM_PROMPT, ...sessionSystemPrompts],
    tools: ONBOARDING_CLIENT_TOOL_DEFINITIONS,
    threadId: body.threadId,
    runId: body.runId ?? `onboarding-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    middleware: [
      withCompaction({
        maxTokens: Math.floor(contextTokens * CONTEXT_BUDGET_RATIO),
        /*
         * No `summarizeOldest` here, unlike the metered route.
         *
         * Summarising costs a second model call, and on a route the house is
         * paying for that is real money spent to preserve the early turns of a
         * conversation whose early turns are a scripted greeting. The turn
         * ceiling means this should never fire at all; if it does, dropping
         * the greeting is the right thing to lose.
         */
        strategy: composeStrategies(clearToolResults(), evictOldest()),
        onCompact: (info) => {
          console.log(
            `[Onboarding] Compacted ${info.messagesBefore}->${info.messagesAfter} messages`,
          );
        },
      }),
    ],
    modelOptions: {
      // No fallback chain. The house picked this model and knows what it
      // costs; silently rerouting a free conversation to something else is how
      // an unmetered route becomes an unpredictable bill.
      temperature: 0.7,
      toolChoice: 'auto',
      parallelToolCalls: false,
    },
  });

  console.log(`[Onboarding] Free turn ${grant.turns} for ${accountId}: model=${modelId}`);

  return toHttpResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
});

/**
 * The app reporting that onboarding is over, which closes the grant.
 *
 * Reported from the device rather than detected here, because the tool that
 * ends onboarding runs on the device: the server sees a tool call go out and
 * has no idea whether it succeeded. Idempotent, so a retried report is not a
 * second onboarding.
 */
onboardingRoutes.post('/complete', async (c) => {
  const { id: accountId } = await readIdentity(c);
  await completeOnboardingGrant(accountId);
  return c.json({ ok: true });
});
