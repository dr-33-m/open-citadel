import { createClient } from '@libsql/client';

import { CLOUD_LIMITS, CLOUD_MODEL_CATALOG, type CloudModelCapability, type CloudModelOption, type CloudUsageState } from 'samwell-shared';

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

  const modelCount = await db.execute('SELECT COUNT(*) as count FROM cloud_models');
  if (Number(modelCount.rows[0]?.count ?? 0) === 0) {
    const now = Date.now();
    await db.batch(
      CLOUD_MODEL_CATALOG.map((model, index) => ({
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
      'write',
    );
  } else {
    // Catalog drift: rows seeded from an older catalog can outlive their model.
    // A model ID OpenRouter no longer routes ("No endpoints found") fails
    // every request that lands on it, so on boot the table is re-synced:
    // catalog rows take their catalog sort order (the first is the default),
    // admin-added models keep their relative order but sink below the
    // catalog, and explicitly retired IDs are removed.
    const now = Date.now();
    const catalogIds = CLOUD_MODEL_CATALOG.map((model) => model.id);
    const existing = await db.execute('SELECT id FROM cloud_models');
    const existingIds = new Set(existing.rows.map((row) => String(row.id)));

    await db.batch(
      [
        {
          // Push non-catalog rows past the catalog's range so their sort order
          // never ties with a catalog index. The guard keeps it idempotent.
          sql: `UPDATE cloud_models
                SET sort_order = ? + sort_order
                WHERE sort_order < ?
                  AND id NOT IN (${catalogIds.map(() => '?').join(', ')})`,
          args: [catalogIds.length, catalogIds.length, ...catalogIds],
        },
        ...CLOUD_MODEL_CATALOG.map((model, index) => ({
          sql: `INSERT INTO cloud_models (
              id, label, provider, description, capabilities, sort_order, created_at_ms, updated_at_ms
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              label = excluded.label,
              provider = excluded.provider,
              description = excluded.description,
              capabilities = excluded.capabilities,
              sort_order = excluded.sort_order,
              updated_at_ms = excluded.updated_at_ms`,
          args: [
            model.id,
            model.label,
            model.provider,
            model.description,
            JSON.stringify(model.capabilities),
            index,
            now,
            now,
          ],
        })),
        // Requests still naming a retired ID fall back to the default via
        // resolveModelId, so removing the row heals clients too.
        ...RETIRED_CLOUD_MODEL_IDS.filter((id) => existingIds.has(id)).map((id) => ({
          sql: 'DELETE FROM cloud_models WHERE id = ?',
          args: [id],
        })),
      ],
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

export async function upsertCloudModel(model: CloudModelOption): Promise<void> {
  const now = Date.now();
  const maxOrder = await db.execute('SELECT MAX(sort_order) as maxOrder FROM cloud_models');
  const nextOrder = Number(maxOrder.rows[0]?.maxOrder ?? -1) + 1;

  await db.execute({
    sql: `INSERT INTO cloud_models (
        id, label, provider, description, capabilities, sort_order, created_at_ms, updated_at_ms, context_tokens
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        provider = excluded.provider,
        description = excluded.description,
        capabilities = excluded.capabilities,
        updated_at_ms = excluded.updated_at_ms,
        -- Never overwrite a refreshed window with a catalogue floor: the
        -- refresh knows the real number, an upsert from the catalogue does not.
        context_tokens = COALESCE(excluded.context_tokens, cloud_models.context_tokens)`,
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

function resetTime(events: Array<{ created_at_ms: number }>, windowMs: number): string | null {
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
