import { createClient, type Client } from '@libsql/client';

import {
  CLOUD_MODEL_CATALOG,
  DEFAULT_CLOUD_MODEL_ID,
  FORECAST_WORKLOAD,
  isPlanId,
  type CloudModelCapability,
  type CloudModelOption,
  type TokenWorkload,
} from 'samwell-shared';

const dbUrl = process.env.DATABASE_URL ?? 'file:./samwell-cloud.sqlite';

export const db = createClient({ url: dbUrl });

export interface UsageEventUpdate {
  status: 'completed' | 'errored';
  promptTokens?: number | null;
  /** Of `promptTokens`, how many the provider served from cache. */
  cachedPromptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
  error?: string | null;
}

/*
 * The current shape of `usage_events`, as a fresh install is created with.
 *
 * Exported because the billing tests need to construct the same table the
 * server boots with - a second copy of a CREATE TABLE in the tests is a
 * second place for the schema to drift, and this table is the one the credit
 * ledger joins against. Existing databases keep getting older shapes healed
 * up to this one by the PRAGMA checks in `initDb` and `ensureBillingSchema`;
 * this string is what they converge on, and what a fresh database starts at.
 */
export const USAGE_EVENTS_DDL = `CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  counts_toward_limit INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL DEFAULT 'chat',
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd REAL,
  error TEXT
)`;

export async function initDb(): Promise<void> {
  await db.batch(
    [
      USAGE_EVENTS_DDL,
      `CREATE TABLE IF NOT EXISTS cloud_models (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        provider TEXT NOT NULL,
        description TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        context_tokens INTEGER,
        min_plan TEXT NOT NULL DEFAULT 'archmaester',
        input_price_per_million REAL,
        output_price_per_million REAL,
        cached_input_price_per_million REAL,
        pricing_fetched_at_ms INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS server_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      /*
       * The free onboarding conversation, one per account.
       *
       * Its own table rather than a row in `usage_events`, because the whole
       * point of the onboarding route is that it never touches that table:
       * "unmetered" has to be checkable, and it is only checkable if there is
       * nothing of onboarding's in the place spend is recorded.
       *
       * `turns` is the backstop, not the limit. The grant is meant to be
       * closed by `finish_onboarding`; the counter is what stops a
       * conversation that never finishes from being an open tab on the house.
       */
      `CREATE TABLE IF NOT EXISTS onboarding_grants (
        account_id TEXT PRIMARY KEY,
        turns INTEGER NOT NULL DEFAULT 0,
        started_at_ms INTEGER NOT NULL,
        completed_at_ms INTEGER
      )`,
    ],
    'write',
  );

  // Everything the credit ledger needs, including the rename the credit work
  // earns. Runs after the batch because several of its statements touch
  // `usage_events`, and it has to go before anything reads or writes that
  // table by its new column name. See `ensureBillingSchema`.
  await ensureBillingSchema(db);
  await seedForecastDefaults();

  // Nullable with no default: null means "not refreshed from OpenRouter yet",
  // which `resolveContextTokens` reads as the conservative floor rather than
  // as a real window.
  const modelInfo = await db.execute('PRAGMA table_info(cloud_models)');
  const modelColumns = new Set(modelInfo.rows.map((row) => String(row.name)));
  if (!modelColumns.has('context_tokens')) {
    await db.execute('ALTER TABLE cloud_models ADD context_tokens INTEGER');
  }
  /*
   * The plan tier, and what the model costs.
   *
   * `min_plan` defaults to the dearest tier rather than the cheapest, because
   * the two ways of being wrong here are not symmetric: a frontier model that
   * lands in the Maester tier by accident is sold at a tenth of what it costs,
   * while a cheap model stranded in Archmaester is only an oversight somebody
   * notices and fixes. An existing row from before this migration is corrected
   * with one admin call.
   *
   * Prices are nullable with no default, meaning "not refreshed yet". A null
   * price refuses the turn rather than charging zero: see `priceModel`.
   */
  if (!modelColumns.has('min_plan')) {
    await db.execute(
      "ALTER TABLE cloud_models ADD min_plan TEXT NOT NULL DEFAULT 'archmaester'",
    );
  }
  if (!modelColumns.has('input_price_per_million')) {
    await db.execute('ALTER TABLE cloud_models ADD input_price_per_million REAL');
  }
  if (!modelColumns.has('output_price_per_million')) {
    await db.execute('ALTER TABLE cloud_models ADD output_price_per_million REAL');
  }
  if (!modelColumns.has('cached_input_price_per_million')) {
    await db.execute('ALTER TABLE cloud_models ADD cached_input_price_per_million REAL');
  }
  if (!modelColumns.has('pricing_fetched_at_ms')) {
    await db.execute('ALTER TABLE cloud_models ADD pricing_fetched_at_ms INTEGER');
  }

  const info = await db.execute('PRAGMA table_info(usage_events)');
  const columns = new Set(info.rows.map((row) => String(row.name)));
  if (!columns.has('counts_toward_limit')) {
    await db.execute(
      `ALTER TABLE usage_events
        ADD counts_toward_limit INTEGER NOT NULL DEFAULT 1`,
    );
  }
  if (!columns.has('kind')) {
    await db.execute(
      `ALTER TABLE usage_events
        ADD kind TEXT NOT NULL DEFAULT 'chat'`,
    );
  }

  /*
   * The database owns the catalog; the catalog in samwell-shared only seeds a
   * fresh one. Re-syncing on every boot (the old behavior) meant a deploy
   * re-pinned sort order, re-labeled rows, and sank anything added at runtime
   * — which made hot-swapping a model impossible: it un-swapped itself on the
   * next deploy. Existing rows are now never rewritten by code; model changes
   * go through the admin API, which pulls live metadata from OpenRouter.
   */
  const modelCount = await db.execute('SELECT COUNT(*) as count FROM cloud_models');
  if (Number(modelCount.rows[0]?.count ?? 0) === 0) {
    const now = Date.now();
    await db.batch(
      [
        ...CLOUD_MODEL_CATALOG.map((model, index) => ({
          sql: `INSERT INTO cloud_models (
              id, label, provider, description, capabilities, sort_order,
              created_at_ms, updated_at_ms, context_tokens, min_plan,
              input_price_per_million, output_price_per_million,
              cached_input_price_per_million
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            model.id,
            model.label,
            model.provider,
            model.description,
            JSON.stringify(model.capabilities),
            index,
            now,
            now,
            model.contextTokens,
            model.minPlan,
            model.inputPricePerMillion,
            model.outputPricePerMillion,
            model.cachedInputPricePerMillion,
          ],
        })),
        {
          sql: `INSERT INTO server_settings (key, value) VALUES ('default_model_id', ?)
                ON CONFLICT(key) DO NOTHING`,
          args: [CLOUD_MODEL_CATALOG[0].id],
        },
      ],
      'write',
    );
  }

  // Emergency kill switch only: an ID listed here is pruned on boot, and
  // requests still naming it fall back to the default via resolveModelId.
  // Day-to-day retirement is DELETE /admin/models/:id, not this array.
  if (RETIRED_CLOUD_MODEL_IDS.length > 0) {
    await db.batch(
      RETIRED_CLOUD_MODEL_IDS.map((id) => ({
        sql: 'DELETE FROM cloud_models WHERE id = ?',
        args: [id],
      })),
      'write',
    );
  }
}

/** Catalog IDs OpenRouter no longer routes; pruned from cloud_models on boot. */
const RETIRED_CLOUD_MODEL_IDS = ['openai/gpt-5.2-chat'];

/*
 * The schema the credit ledger stands on.
 *
 * Exported rather than private to `initDb` because it has to be constructible
 * on its own: the billing tests build a throwaway database and need the exact
 * same statements the live server self-heals with, and a second copy of the
 * DDL in the tests is a second place for the schema to drift.
 *
 * Safe to run against a database of any age - a fresh one, one from before
 * plans existed, or one already carrying credits. Every statement is guarded
 * by a PRAGMA check or an IF [NOT] EXISTS, so it converges on the same shape
 * however many times it runs.
 */
export async function ensureBillingSchema(client: Client): Promise<void> {
  const usageInfo = await client.execute('PRAGMA table_info(usage_events)');
  const columns = new Set(usageInfo.rows.map((row) => String(row.name)));

  /*
   * The column was named `device_id` when it held exactly that, and it has
   * held `account:<sub>` since Samwell Cloud moved onto accounts - an opaque
   * key either way, which is why nothing needed migrating at the time. The
   * credit ledger is the change that finally earns the honest name, because
   * `billing.ts` now joins on it: a column called `device_id` appearing in a
   * join against `account_credits` reads as a bug even when it is not one.
   */
  if (columns.has('device_id')) {
    await client.execute('ALTER TABLE usage_events RENAME COLUMN device_id TO account_id');
  }

  /*
   * What a turn reserved and what it was charged, and the prices it was
   * charged at (spec §18: a historical row stays accurate after a price
   * change because the price is written into it).
   *
   * All four nullable with no default: null means "this row predates credits"
   * or "never got that far", which is a different fact from zero and must not
   * be rewritten into it.
   */
  if (!columns.has('credits_reserved')) {
    await client.execute('ALTER TABLE usage_events ADD credits_reserved INTEGER');
  }
  if (!columns.has('credits_charged')) {
    await client.execute('ALTER TABLE usage_events ADD credits_charged INTEGER');
  }
  if (!columns.has('input_price_snapshot')) {
    await client.execute('ALTER TABLE usage_events ADD input_price_snapshot REAL');
  }
  if (!columns.has('output_price_snapshot')) {
    await client.execute('ALTER TABLE usage_events ADD output_price_snapshot REAL');
  }
  /*
   * How many of the prompt tokens the provider served from cache.
   *
   * Recorded because it is most of what a turn costs: 95% of the median call
   * on real traffic, and a cached token is a tenth the price of a fresh one.
   * Also the number the weekly forecast recalibration needs - without it,
   * `cachedInputTokens` in the forecast can only ever be a guess.
   *
   * Null means the provider reported no split, which is a different fact from
   * "nothing was cached" and must not be rewritten into zero.
   */
  if (!columns.has('cached_prompt_tokens')) {
    await client.execute('ALTER TABLE usage_events ADD cached_prompt_tokens INTEGER');
  }

  /*
   * `account_credits` is the hot-path cache of what an account can spend; the
   * ledger is the truth it is a cache OF. Every mutation goes through the
   * ledger, and `reconcileBalance` rebuilds the cache from it, so a crash
   * between the two writes heals on the next reconcile rather than losing
   * money silently.
   */
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS account_credits (
        account_id      TEXT PRIMARY KEY,
        plan            TEXT,
        source          TEXT,
        balance         INTEGER NOT NULL DEFAULT 0,
        reserved        INTEGER NOT NULL DEFAULT 0,
        period_start_ms INTEGER,
        period_end_ms   INTEGER,
        updated_at_ms   INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS credit_ledger (
        id             TEXT PRIMARY KEY,
        account_id     TEXT NOT NULL,
        type           TEXT NOT NULL,
        credits        INTEGER NOT NULL,
        balance_after  INTEGER NOT NULL,
        model_id       TEXT,
        request_id     TEXT,
        description    TEXT,
        created_at_ms  INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS credit_ledger_account_time_idx
        ON credit_ledger (account_id, created_at_ms)`,
      /* Founder-issued codes that grant a plan without a store purchase.
         Unused until the insider routes land; created here so the schema
         arrives complete rather than in a second migration. */
      `CREATE TABLE IF NOT EXISTS insider_invites (
        code            TEXT PRIMARY KEY,
        plan            TEXT NOT NULL,
        duration_days   INTEGER NOT NULL,
        note            TEXT,
        created_at_ms   INTEGER NOT NULL,
        redeemed_by     TEXT,
        redeemed_at_ms  INTEGER,
        expires_at_ms   INTEGER
      )`,
      /*
       * The usage index follows the rename. The old name survives on
       * databases created before it, so it is dropped and rebuilt under the
       * new one rather than left as a duplicate with a lying name.
       */
      'DROP INDEX IF EXISTS usage_events_device_time_idx',
      `CREATE INDEX IF NOT EXISTS usage_events_account_time_idx
        ON usage_events (account_id, created_at_ms)`,
    ],
    'write',
  );
}

function num(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function rowToCloudModel(row: Record<string, unknown>): CloudModelOption {
  return {
    id: String(row.id),
    label: String(row.label),
    provider: String(row.provider),
    description: String(row.description),
    capabilities: JSON.parse(String(row.capabilities)) as CloudModelCapability[],
    contextTokens: num(row.context_tokens),
    // Anything unrecognised reads as the dearest tier, for the same reason the
    // column defaults to it: an unreadable value must not hand a frontier
    // model to the cheapest plan.
    minPlan: isPlanId(row.min_plan) ? row.min_plan : 'archmaester',
    inputPricePerMillion: num(row.input_price_per_million),
    outputPricePerMillion: num(row.output_price_per_million),
    cachedInputPricePerMillion: num(row.cached_input_price_per_million),
  };
}

/**
 * Record what OpenRouter says about a model: its window and its prices.
 *
 * Called by the background refresh rather than by request handling, so a slow
 * or failing provider never sits in front of a chat turn.
 *
 * `pricing_fetched_at_ms` is stamped even when the prices came back null, so
 * "we asked and OpenRouter publishes nothing" is distinguishable from "we have
 * never asked". Only the first of those is worth alerting on.
 */
export async function setCloudModelFacts(
  modelId: string,
  facts: {
    contextTokens: number | null;
    inputPricePerMillion: number | null;
    outputPricePerMillion: number | null;
    cachedInputPricePerMillion: number | null;
  },
): Promise<void> {
  const now = Date.now();
  await db.execute({
    sql: `UPDATE cloud_models SET
        context_tokens = ?,
        input_price_per_million = ?,
        output_price_per_million = ?,
        cached_input_price_per_million = ?,
        pricing_fetched_at_ms = ?,
        updated_at_ms = ?
      WHERE id = ?`,
    args: [
      facts.contextTokens,
      facts.inputPricePerMillion,
      facts.outputPricePerMillion,
      facts.cachedInputPricePerMillion,
      now,
      now,
      modelId,
    ],
  });
}

export async function listCloudModels(): Promise<CloudModelOption[]> {
  const result = await db.execute('SELECT * FROM cloud_models ORDER BY sort_order ASC');
  return result.rows.map((row) => rowToCloudModel(row as unknown as Record<string, unknown>));
}

async function readServerSetting(key: string): Promise<string | null> {
  const result = await db.execute({
    sql: 'SELECT value FROM server_settings WHERE key = ?',
    args: [key],
  });
  return result.rows[0] ? String(result.rows[0].value) : null;
}

export async function getDefaultModelId(): Promise<string> {
  const stored = await readServerSetting('default_model_id');
  return stored ?? DEFAULT_CLOUD_MODEL_ID;
}

export async function setDefaultModelId(modelId: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO server_settings (key, value) VALUES ('default_model_id', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [modelId],
  });
}

// ── The forecast workload ───────────────────────────────────────────────────

/*
 * What one typical turn is priced against, as three settings rows.
 *
 * Seeded on boot from the measured p75 in samwell-shared and corrected from
 * real traffic by the recalibration job, so the number a reader is shown
 * tracks what readers actually do rather than what somebody once estimated.
 * Rows rather than code, because correcting a forecast is a data write, the
 * same way swapping a model is.
 */
const FORECAST_SETTING_KEYS = {
  inputTokens: 'forecast_input_tokens',
  cachedInputTokens: 'forecast_cached_tokens',
  outputTokens: 'forecast_output_tokens',
} as const;

export async function seedForecastDefaults(): Promise<void> {
  await db.batch(
    Object.entries(FORECAST_SETTING_KEYS).map(([field, key]) => ({
      sql: `INSERT INTO server_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO NOTHING`,
      args: [key, String(FORECAST_WORKLOAD[field as keyof TokenWorkload])],
    })),
    'write',
  );
}

export async function setForecastWorkload(workload: TokenWorkload): Promise<void> {
  await db.batch(
    Object.entries(FORECAST_SETTING_KEYS).map(([field, key]) => ({
      sql: `INSERT INTO server_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [key, String(workload[field as keyof TokenWorkload])],
    })),
    'write',
  );
}

export async function getForecastWorkload(): Promise<TokenWorkload> {
  const [input, cached, output] = await Promise.all(
    Object.values(FORECAST_SETTING_KEYS).map((key) => readServerSetting(key)),
  );
  return {
    inputTokens: input == null ? FORECAST_WORKLOAD.inputTokens : Number(input),
    cachedInputTokens: cached == null ? FORECAST_WORKLOAD.cachedInputTokens : Number(cached),
    outputTokens: output == null ? FORECAST_WORKLOAD.outputTokens : Number(output),
  };
}

/**
 * Make a model the default and move it to the front of the picker order, so
 * the stored default and what clients see first never disagree.
 */
export async function setDefaultModelToFront(modelId: string): Promise<void> {
  await db.batch(
    [
      {
        sql: `UPDATE cloud_models
              SET sort_order = (SELECT MIN(sort_order) FROM cloud_models) - 1
              WHERE id = ?`,
        args: [modelId],
      },
      {
        sql: `INSERT INTO server_settings (key, value) VALUES ('default_model_id', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: [modelId],
      },
    ],
    'write',
  );
}

/**
 * The one place that decides which model serves a request.
 *
 * The default lives in server_settings, so hot-swapping it is a data write,
 * not a deploy. The first-row fallback is the old derived default; it only
 * matters if the setting row is somehow missing or stale, and it keeps this
 * total: a request always resolves to a known model ID.
 */
export function resolveModelId(
  requested: string | null | undefined,
  knownModelIds: string[],
): string {
  if (requested && knownModelIds.includes(requested)) return requested;
  return knownModelIds[0] ?? DEFAULT_CLOUD_MODEL_ID;
}

/** Append a model at the end of the picker order. The row must not exist. */
export async function insertCloudModel(model: CloudModelOption): Promise<void> {
  const now = Date.now();
  const maxOrder = await db.execute('SELECT MAX(sort_order) as maxOrder FROM cloud_models');
  const nextOrder = Number(maxOrder.rows[0]?.maxOrder ?? -1) + 1;

  await db.execute({
    sql: `INSERT INTO cloud_models (
        id, label, provider, description, capabilities, sort_order,
        created_at_ms, updated_at_ms, context_tokens, min_plan,
        input_price_per_million, output_price_per_million,
        cached_input_price_per_million, pricing_fetched_at_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      model.id,
      model.label,
      model.provider,
      model.description,
      JSON.stringify(model.capabilities),
      nextOrder,
      now,
      now,
      model.contextTokens,
      model.minPlan,
      model.inputPricePerMillion,
      model.outputPricePerMillion,
      model.cachedInputPricePerMillion,
      now,
    ],
  });
}

/** Overwrite the mutable fields of an existing row, keeping its sort order. */
export async function updateCloudModel(model: CloudModelOption): Promise<void> {
  await db.execute({
    sql: `UPDATE cloud_models SET
        label = ?,
        provider = ?,
        description = ?,
        capabilities = ?,
        context_tokens = ?,
        min_plan = ?,
        input_price_per_million = ?,
        output_price_per_million = ?,
        cached_input_price_per_million = ?,
        pricing_fetched_at_ms = ?,
        updated_at_ms = ?
      WHERE id = ?`,
    args: [
      model.label,
      model.provider,
      model.description,
      JSON.stringify(model.capabilities),
      model.contextTokens,
      model.minPlan,
      model.inputPricePerMillion,
      model.outputPricePerMillion,
      model.cachedInputPricePerMillion,
      Date.now(),
      Date.now(),
      model.id,
    ],
  });
}

/**
 * Remove a model. If it was the default, the next model by sort order is
 * promoted, so the server can never be left defaultless through the API.
 * Devices still holding the removed ID heal on their next /models fetch.
 */
export async function deleteCloudModel(modelId: string): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM cloud_models WHERE id = ?',
    args: [modelId],
  });

  const stored = await readServerSetting('default_model_id');
  if (stored !== modelId) return;

  const remaining = await db.execute('SELECT id FROM cloud_models ORDER BY sort_order ASC');
  const next = remaining.rows[0] ? String(remaining.rows[0].id) : null;
  if (next) {
    await setDefaultModelId(next);
  } else {
    // Table is empty; fall back to the seed catalog's first entry so a
    // subsequent seed-on-boot (or admin add) has a sane anchor.
    await setDefaultModelId(DEFAULT_CLOUD_MODEL_ID);
  }
}

/**
 * Open a usage event for a turn about to happen.
 *
 * It was called `reserveUsageEvent` and did two jobs at once: it recorded the
 * event, and it enforced the message-count caps of `CLOUD_LIMITS` with the
 * atomic count-and-insert trick documented below. Credits meter turns now,
 * and the second job is gone: the only thing that can refuse a turn is a
 * balance, checked atomically in `billing.ts`'s `reserveCredits`. What is
 * left is the recording - and the name says what it does.
 *
 * The old trick is worth remembering, because the same reasoning is why
 * `reserveCredits` is a single UPDATE: two concurrent requests must never
 * both observe the same headroom and both act on it.
 */
export async function recordUsageEvent(args: {
  id: string;
  accountId: string;
  modelId: string;
  countsTowardLimit: boolean;
  kind?: string;
}): Promise<void> {
  await db.execute({
    sql: `INSERT INTO usage_events (
        id, account_id, model_id, status, counts_toward_limit, kind, created_at_ms
      )
      VALUES (?, ?, ?, 'started', ?, ?, ?)`,
    args: [
      args.id,
      args.accountId,
      args.modelId,
      args.countsTowardLimit ? 1 : 0,
      args.kind ?? 'chat',
      Date.now(),
    ],
  });
}

export async function updateUsageEvent(
  id: string,
  update: UsageEventUpdate,
): Promise<void> {
  await db.execute({
    sql: `UPDATE usage_events
      SET status = ?,
        completed_at_ms = ?,
        prompt_tokens = ?,
        cached_prompt_tokens = ?,
        completion_tokens = ?,
        total_tokens = ?,
        cost_usd = ?,
        error = ?
      WHERE id = ?`,
    args: [
      update.status,
      Date.now(),
      update.promptTokens ?? null,
      update.cachedPromptTokens ?? null,
      update.completionTokens ?? null,
      update.totalTokens ?? null,
      update.costUsd ?? null,
      update.error ?? null,
      id,
    ],
  });
}

// ── The free onboarding conversation ────────────────────────────────────────

/**
 * How many turns the house will pay for before the grant closes itself.
 *
 * Generous, because the ceiling is not the mechanism. `finish_onboarding` is
 * what normally ends a grant, and a scripted introduction that reaches thirty
 * turns has gone wrong in some way this number cannot fix. It exists so that a
 * conversation which never calls that tool cannot stay open forever.
 */
const ONBOARDING_TURN_CEILING = 60;

/*
 * Sixty, not the six or so exchanges the script actually has, because a turn
 * here is a REQUEST and one exchange is rarely one request. Every client tool
 * the model calls produces a continuation, so a single "yes, set up my
 * library" is two: the call, then the answer written from its result. The
 * scripted path runs to somewhere around fifteen. The headroom is deliberate,
 * because the ceiling is not what is supposed to end a conversation —
 * `finish_onboarding` is — and a reader cut off mid-introduction because they
 * asked more questions than expected is a far worse outcome than a few extra
 * requests on the house.
 */

export type OnboardingGrant =
  | { open: true; turns: number }
  | { open: false; reason: 'completed' | 'exhausted' };

/**
 * Claim one turn of the free conversation for this account.
 *
 * Opens the grant on first sight, so an account that never onboards leaves no
 * row. Every later call spends a turn, and a spent-out or completed grant is
 * refused — the client then falls back to the ordinary metered route, so a
 * second run costs the reader rather than failing in their face.
 */
export async function claimOnboardingTurn(accountId: string): Promise<OnboardingGrant> {
  const existing = await db.execute({
    sql: 'SELECT turns, completed_at_ms FROM onboarding_grants WHERE account_id = ?',
    args: [accountId],
  });

  const row = existing.rows[0];
  if (!row) {
    await db.execute({
      sql: `INSERT INTO onboarding_grants (account_id, turns, started_at_ms)
            VALUES (?, 1, ?)`,
      args: [accountId, Date.now()],
    });
    return { open: true, turns: 1 };
  }

  if (row.completed_at_ms !== null) return { open: false, reason: 'completed' };

  const turns = Number(row.turns) + 1;
  if (turns > ONBOARDING_TURN_CEILING) return { open: false, reason: 'exhausted' };

  await db.execute({
    sql: 'UPDATE onboarding_grants SET turns = ? WHERE account_id = ?',
    args: [turns, accountId],
  });
  return { open: true, turns };
}

/**
 * How many onboarding turns the house will carry for one account, ever.
 *
 * The grant above is the bound on ONE first run. This is the bound on the
 * account, and it exists because onboarding stopped being billable: without a
 * ceiling, a client that simply keeps saying `mode: 'onboarding'` would have
 * an unlimited free conversation with a scripted persona and five tools.
 *
 * Three first runs' worth. A real reader uses one and never sees this; a
 * reinstall or a second device uses another; past that the turns start
 * counting against the reader again rather than being refused, because a
 * conversation that degrades is kinder than one that stops.
 */
const ONBOARDING_HOUSE_CEILING = ONBOARDING_TURN_CEILING * 3;

/**
 * Spend one onboarding turn that Open Citadel is paying for.
 *
 * Unlike `claimOnboardingTurn` this does not care whether the grant was
 * completed. Completion means "this reader has been onboarded", which is worth
 * knowing and is not a reason to start charging them for an introduction. Only
 * the lifetime ceiling can refuse.
 */
export async function claimHouseOnboardingTurn(accountId: string): Promise<boolean> {
  const existing = await db.execute({
    sql: 'SELECT turns FROM onboarding_grants WHERE account_id = ?',
    args: [accountId],
  });

  const row = existing.rows[0];
  if (!row) {
    await db.execute({
      sql: `INSERT INTO onboarding_grants (account_id, turns, started_at_ms)
            VALUES (?, 1, ?)`,
      args: [accountId, Date.now()],
    });
    return true;
  }

  const turns = Number(row.turns) + 1;
  if (turns > ONBOARDING_HOUSE_CEILING) return false;

  await db.execute({
    sql: 'UPDATE onboarding_grants SET turns = ? WHERE account_id = ?',
    args: [turns, accountId],
  });
  return true;
}

/**
 * Close the grant. Idempotent, and deliberately so: the client reports the
 * finish after `finish_onboarding` runs on the device, and a retried report
 * must not look like a second onboarding.
 */
export async function completeOnboardingGrant(accountId: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO onboarding_grants (account_id, turns, started_at_ms, completed_at_ms)
          VALUES (?, 0, ?, ?)
          ON CONFLICT(account_id) DO UPDATE
            SET completed_at_ms = COALESCE(onboarding_grants.completed_at_ms, excluded.completed_at_ms)`,
    args: [accountId, Date.now(), Date.now()],
  });
}

/** Whether this account has any of its free conversation left. */
export async function onboardingGrantOpen(accountId: string): Promise<boolean> {
  const result = await db.execute({
    sql: 'SELECT turns, completed_at_ms FROM onboarding_grants WHERE account_id = ?',
    args: [accountId],
  });
  const row = result.rows[0];
  if (!row) return true;
  if (row.completed_at_ms !== null) return false;
  return Number(row.turns) <= ONBOARDING_TURN_CEILING;
}

/**
 * The model the house pays for during onboarding.
 *
 * Not the reader's choice, because they have not been asked to make one yet
 * and because the bill is ours.
 *
 * Three sources, most specific first. A `server_settings` row wins, so the
 * model can be swapped by writing one value without a deploy; there is no
 * setter for it yet, which is deliberate rather than missing — nothing should
 * be able to change what the house pays for through an ordinary request, and
 * an admin route can be added the day one is wanted. `ONBOARDING_MODEL_ID` is
 * how it is actually pinned today. The ordinary default is the floor, so this
 * always resolves to something.
 *
 * `/health` reports the result, because none of these three can be read back
 * from outside and a wrong answer here has no symptom until somebody's first
 * conversation is served by the wrong model.
 */
export async function getOnboardingModelId(): Promise<string> {
  const stored = await readServerSetting('onboarding_model_id');
  return stored ?? process.env.ONBOARDING_MODEL_ID ?? (await getDefaultModelId());
}
