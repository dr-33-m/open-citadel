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
        updated_at_ms INTEGER NOT NULL
      )`,
    ],
    'write',
  );

  const info = await db.execute('PRAGMA table_info(usage_events)');
  const columns = new Set(info.rows.map((row) => String(row.name)));
  if (!columns.has('counts_toward_limit')) {
    await db.execute(
      `ALTER TABLE usage_events
        ADD counts_toward_limit INTEGER NOT NULL DEFAULT 1`,
    );
  }

  const modelCount = await db.execute('SELECT COUNT(*) as count FROM cloud_models');
  if (Number(modelCount.rows[0]?.count ?? 0) === 0) {
    const now = Date.now();
    await db.batch(
      CLOUD_MODEL_CATALOG.map((model, index) => ({
        sql: `INSERT INTO cloud_models (
            id, label, provider, description, capabilities, sort_order, created_at_ms, updated_at_ms
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      'write',
    );
  }
}

function rowToCloudModel(row: Record<string, unknown>): CloudModelOption {
  return {
    id: String(row.id),
    label: String(row.label),
    provider: String(row.provider),
    description: String(row.description),
    capabilities: JSON.parse(String(row.capabilities)) as CloudModelCapability[],
  };
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
        id, label, provider, description, capabilities, sort_order, created_at_ms, updated_at_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        provider = excluded.provider,
        description = excluded.description,
        capabilities = excluded.capabilities,
        updated_at_ms = excluded.updated_at_ms`,
    args: [
      model.id,
      model.label,
      model.provider,
      model.description,
      JSON.stringify(model.capabilities),
      nextOrder,
      now,
      now,
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

export async function checkUsageLimit(deviceId: string): Promise<UsageLimitCheck> {
  const usage = await getUsageState(deviceId);

  if (usage.fiveHour.remaining <= 0) {
    return { allowed: false, usage, reason: 'fiveHour' };
  }

  if (usage.weekly.remaining <= 0) {
    return { allowed: false, usage, reason: 'weekly' };
  }

  return { allowed: true, usage };
}

export async function createUsageEvent(args: {
  id: string;
  deviceId: string;
  modelId: string;
  countsTowardLimit: boolean;
}): Promise<void> {
  await db.execute({
    sql: `INSERT INTO usage_events (
        id,
        device_id,
        model_id,
        status,
        counts_toward_limit,
        created_at_ms
      )
      VALUES (?, ?, ?, 'started', ?, ?)`,
    args: [
      args.id,
      args.deviceId,
      args.modelId,
      args.countsTowardLimit ? 1 : 0,
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
