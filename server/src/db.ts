import { createClient } from '@libsql/client';

import { CLOUD_LIMITS, CLOUD_MODEL_CATALOG, DEFAULT_CLOUD_MODEL_ID, type CloudModelCapability, type CloudModelOption, type CloudUsageState } from 'samwell-shared';

const dbUrl = process.env.DATABASE_URL ?? 'file:./samwell-cloud.sqlite';

export const db = createClient({ url: dbUrl });

export interface UsageLimitCheck {
  allowed: boolean;
  usage: CloudUsageState;
  reason?: 'fiveHour' | 'weekly';
}

export interface UsageEventUpdate {
  status: 'completed' | 'errored';
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
  error?: string | null;
}

export async function initDb(): Promise<void> {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'started',
        counts_toward_limit INTEGER NOT NULL DEFAULT 1,
        created_at_ms INTEGER NOT NULL,
        completed_at_ms INTEGER,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        cost_usd REAL,
        error TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS usage_events_device_time_idx
        ON usage_events (device_id, created_at_ms)`,
      `CREATE TABLE IF NOT EXISTS cloud_models (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        provider TEXT NOT NULL,
        description TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        context_tokens INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS server_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
    'write',
  );

  // Nullable with no default: null means "not refreshed from OpenRouter yet",
  // which `resolveContextTokens` reads as the conservative floor rather than
  // as a real window.
  const modelInfo = await db.execute('PRAGMA table_info(cloud_models)');
  const modelColumns = new Set(modelInfo.rows.map((row) => String(row.name)));
  if (!modelColumns.has('context_tokens')) {
    await db.execute('ALTER TABLE cloud_models ADD context_tokens INTEGER');
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
              id, label, provider, description, capabilities, sort_order, created_at_ms, updated_at_ms, context_tokens
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

function rowToCloudModel(row: Record<string, unknown>): CloudModelOption {
  return {
    id: String(row.id),
    label: String(row.label),
    provider: String(row.provider),
    description: String(row.description),
    capabilities: JSON.parse(String(row.capabilities)) as CloudModelCapability[],
    contextTokens: row.context_tokens == null ? null : Number(row.context_tokens),
  };
}

/**
 * Record what OpenRouter says a model's context window is.
 *
 * Called by the refresh below rather than by request handling, so a slow or
 * failing provider never sits in front of a chat turn.
 */
export async function setCloudModelContextTokens(
  modelId: string,
  contextTokens: number | null,
): Promise<void> {
  await db.execute({
    sql: 'UPDATE cloud_models SET context_tokens = ?, updated_at_ms = ? WHERE id = ?',
    args: [contextTokens, Date.now(), modelId],
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
        id, label, provider, description, capabilities, sort_order, created_at_ms, updated_at_ms, context_tokens
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        updated_at_ms = ?
      WHERE id = ?`,
    args: [
      model.label,
      model.provider,
      model.description,
      JSON.stringify(model.capabilities),
      model.contextTokens,
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

function resetTime(events: { created_at_ms: number }[], windowMs: number): string | null {
  if (events.length === 0) return null;
  const oldest = Math.min(...events.map((event) => event.created_at_ms));
  return new Date(oldest + windowMs).toISOString();
}

export async function getUsageState(deviceId: string, nowMs = Date.now()): Promise<CloudUsageState> {
  const sinceWeekly = nowMs - CLOUD_LIMITS.weeklyWindowMs;
  const result = await db.execute({
    sql: `SELECT created_at_ms FROM usage_events
      WHERE device_id = ? AND created_at_ms >= ? AND counts_toward_limit = 1
      ORDER BY created_at_ms ASC`,
    args: [deviceId, sinceWeekly],
  });

  const weeklyEvents = result.rows.map((row) => ({
    created_at_ms: Number(row.created_at_ms),
  }));
  const sinceFiveHour = nowMs - CLOUD_LIMITS.fiveHourWindowMs;
  const fiveHourEvents = weeklyEvents.filter(
    (event) => event.created_at_ms >= sinceFiveHour,
  );

  return {
    fiveHour: {
      used: fiveHourEvents.length,
      cap: CLOUD_LIMITS.fiveHourMessageCap,
      remaining: Math.max(0, CLOUD_LIMITS.fiveHourMessageCap - fiveHourEvents.length),
      resetsAt: resetTime(fiveHourEvents, CLOUD_LIMITS.fiveHourWindowMs),
    },
    weekly: {
      used: weeklyEvents.length,
      cap: CLOUD_LIMITS.weeklyMessageCap,
      remaining: Math.max(0, CLOUD_LIMITS.weeklyMessageCap - weeklyEvents.length),
      resetsAt: resetTime(weeklyEvents, CLOUD_LIMITS.weeklyWindowMs),
    },
  };
}

/**
 * Checks the usage cap and records the event in one atomic statement. The
 * previous approach (a separate SELECT-based check, then a separate INSERT)
 * left a race window between the two round-trips: two concurrent requests
 * from the same device could both observe "room remaining" before either had
 * inserted, letting them both through and overshooting the cap. Folding the
 * cap check into the INSERT's own WHERE clause means the count-and-decide
 * happens as part of a single statement, which SQLite (and libsql/Turso,
 * which is SQLite-compatible) executes atomically with respect to other
 * connections — a concurrent writer can't observe or interleave with a
 * partially-applied statement.
 */
export async function reserveUsageEvent(args: {
  id: string;
  deviceId: string;
  modelId: string;
  countsTowardLimit: boolean;
  kind?: string;
}): Promise<UsageLimitCheck> {
  const now = Date.now();

  if (!args.countsTowardLimit) {
    // Not subject to the cap — always allowed, still recorded for the log.
    await db.execute({
      sql: `INSERT INTO usage_events (
          id, device_id, model_id, status, counts_toward_limit, kind, created_at_ms
        )
        VALUES (?, ?, ?, 'started', 0, ?, ?)`,
      args: [args.id, args.deviceId, args.modelId, args.kind ?? 'chat', now],
    });
    return { allowed: true, usage: await getUsageState(args.deviceId, now) };
  }

  const sinceFiveHour = now - CLOUD_LIMITS.fiveHourWindowMs;
  const sinceWeekly = now - CLOUD_LIMITS.weeklyWindowMs;

  const result = await db.execute({
    sql: `INSERT INTO usage_events (
        id, device_id, model_id, status, counts_toward_limit, kind, created_at_ms
      )
      SELECT ?, ?, ?, 'started', 1, ?, ?
      WHERE (
        SELECT COUNT(*) FROM usage_events
        WHERE device_id = ? AND created_at_ms >= ? AND counts_toward_limit = 1
      ) < ?
      AND (
        SELECT COUNT(*) FROM usage_events
        WHERE device_id = ? AND created_at_ms >= ? AND counts_toward_limit = 1
      ) < ?`,
    args: [
      args.id,
      args.deviceId,
      args.modelId,
      args.kind ?? 'chat',
      now,
      args.deviceId,
      sinceFiveHour,
      CLOUD_LIMITS.fiveHourMessageCap,
      args.deviceId,
      sinceWeekly,
      CLOUD_LIMITS.weeklyMessageCap,
    ],
  });

  const usage = await getUsageState(args.deviceId, now);
  if (result.rowsAffected === 0) {
    const reason: 'fiveHour' | 'weekly' = usage.fiveHour.remaining <= 0 ? 'fiveHour' : 'weekly';
    return { allowed: false, usage, reason };
  }

  return { allowed: true, usage };
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
        completion_tokens = ?,
        total_tokens = ?,
        cost_usd = ?,
        error = ?
      WHERE id = ?`,
    args: [
      update.status,
      Date.now(),
      update.promptTokens ?? null,
      update.completionTokens ?? null,
      update.totalTokens ?? null,
      update.costUsd ?? null,
      update.error ?? null,
      id,
    ],
  });
}
