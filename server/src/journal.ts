import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  JOURNAL_PROMPT,
  JournalModelSchema,
  JournalRequestSchema,
  JournalResponseSchema,
  modelsForPlan,
  normalizeJournalNotes,
} from 'samwell-shared';

import { readEntitlement } from './billing.js';
import { listCloudModels, recordUsageEvent, resolveModelId } from './db.js';
import { requireOpenRouterKey } from './http-helpers.js';
import { readIdentity } from './identity.js';
import { runStructuredAnalysis } from './structured-analysis.js';

export const journalRoutes = new Hono();

/**
 * What Samwell writes down about someone after a conversation goes quiet.
 *
 * Nothing is stored here: the notes go back to the device and live there, the
 * same as every other journey note. The transcript arrives with zero data
 * retention on the provider (see `openrouter.ts`) and only ever holds messages
 * that already went to the cloud as chat turns.
 *
 * On the house, like compaction, and for the same reason: it is upkeep the
 * reader never asked for by name, and spending their balance on it would be a
 * charge for something they cannot see. A plan is still required, so the route
 * is not a free summarizer for anyone holding an account.
 */
journalRoutes.post('/notes', async (c) => {
  requireOpenRouterKey();
  const { id: accountId } = await readIdentity(c);

  const parsed = JournalRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const entitlement = await readEntitlement(accountId);
  if (!entitlement?.plan) {
    return c.json({ error: 'no_subscription' }, 402);
  }

  // The plan's own models, so a stale client asking for one above its plan
  // lands on the plan's default rather than a model the house pays more for.
  const planModels = modelsForPlan(await listCloudModels(), entitlement.plan);
  const modelId = resolveModelId(
    parsed.data.modelId,
    planModels.map((model) => model.id),
  );
  const usageEventId = `journal-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await recordUsageEvent({
    id: usageEventId,
    accountId,
    modelId,
    countsTowardLimit: false,
    kind: 'journal_notes',
  });

  const { modelId: _requestedModel, ...payload } = parsed.data;
  const result = await runStructuredAnalysis({
    modelId,
    systemPrompts: [JOURNAL_PROMPT],
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    schema: JournalModelSchema,
    usageEventId,
    failureCode: 'journal_notes_failed',
  });

  return c.json(JournalResponseSchema.parse({ notes: normalizeJournalNotes(result) }));
});
