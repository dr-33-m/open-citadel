/**
 * The cloud voice catalogue, as this server holds it.
 *
 * Its own table beside `cloud_models` rather than rows in it, because a voice
 * is priced and chosen differently from a chat model: by the character, with
 * a list of voices to pick from, and without a context window or tools. One
 * table bent to hold both would have every column meaning two things.
 *
 * The same rules as the chat catalogue otherwise. The seed in samwell-shared
 * fills an EMPTY table and nothing more, so a voice added or retired through
 * `/admin/voices` stays that way across deploys; `min_plan` defaults to the
 * dearest tier, so a row added by hand without one is never sold cheap; and a
 * null price refuses to speak rather than speaking for nothing. `audio_formats`
 * defaults to PCM alone for the same reason: a maker asked for a format it
 * does not take refuses the whole piece.
 *
 * A factory over a client, like `billing.ts`, so the tests can run it against
 * a throwaway database.
 */
import type { Client } from '@libsql/client';

import { CLOUD_VOICE_CATALOG, isPlanId, withPcm, type CloudVoiceModel, type SpeechFormat } from 'samwell-shared';

import { db } from './db.js';

export const VOICE_MODELS_DDL = `CREATE TABLE IF NOT EXISTS cloud_voice_models (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  maker TEXT NOT NULL,
  description TEXT NOT NULL,
  min_plan TEXT NOT NULL DEFAULT 'archmaester',
  sort_order INTEGER NOT NULL,
  price_per_million_characters REAL,
  max_characters INTEGER NOT NULL,
  speed_supported INTEGER NOT NULL DEFAULT 0,
  audio_formats TEXT NOT NULL DEFAULT '["pcm"]',
  voices TEXT NOT NULL,
  default_voice TEXT NOT NULL,
  pricing_fetched_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
)`;

/** What a refresh may change about a stored model. Null means "not published". */
export interface VoiceModelFacts {
  pricePerMillionCharacters: number | null;
  voices: string[] | null;
}

export interface VoiceCatalog {
  ensureSchema(): Promise<void>;
  list(): Promise<CloudVoiceModel[]>;
  find(id: string): Promise<CloudVoiceModel | null>;
  insert(model: CloudVoiceModel): Promise<void>;
  update(model: CloudVoiceModel): Promise<void>;
  remove(id: string): Promise<boolean>;
  setFacts(id: string, facts: VoiceModelFacts): Promise<void>;
}

function rowToVoiceModel(row: Record<string, unknown>): CloudVoiceModel {
  const voices = parseVoices(row.voices);
  const defaultVoice = String(row.default_voice);
  return {
    id: String(row.id),
    label: String(row.label),
    maker: String(row.maker),
    description: String(row.description),
    // Unreadable reads as the dearest tier, for the reason the column defaults
    // to it: an unknown value must not hand a dear voice to the cheapest plan.
    minPlan: isPlanId(row.min_plan) ? row.min_plan : 'archmaester',
    pricePerMillionCharacters:
      row.price_per_million_characters == null ? null : Number(row.price_per_million_characters),
    maxCharacters: Number(row.max_characters),
    speedSupported: Number(row.speed_supported) === 1,
    formats: parseFormats(row.audio_formats),
    voices,
    // A default the list no longer has would be refused by `/tts/speak`, so
    // it falls back to the first voice the maker still offers.
    defaultVoice: voices.includes(defaultVoice) ? defaultVoice : (voices[0] ?? defaultVoice),
  };
}

function parseVoices(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** PCM is always there: it is what every maker answers in, and the app always plays. */
function parseFormats(raw: unknown): SpeechFormat[] {
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    return withPcm(Array.isArray(parsed) ? parsed : null);
  } catch {
    return withPcm(null);
  }
}

export function createVoiceCatalog(client: Client, now: () => number = Date.now): VoiceCatalog {
  async function ensureSchema(): Promise<void> {
    await client.execute(VOICE_MODELS_DDL);
    await addFormatsColumn();
    const count = await client.execute('SELECT COUNT(*) AS count FROM cloud_voice_models');
    if (Number(count.rows[0]?.count ?? 0) > 0) return;
    const atMs = now();
    await client.batch(
      CLOUD_VOICE_CATALOG.map((model, index) => insertStatement(model, index, atMs, null)),
      'write',
    );
  }

  /**
   * A table made before `audio_formats` existed gets it once, and the models
   * it shares with the seed take the seed's formats, so a deploy alone puts
   * Gemini on PCM. Any other row stays on the column's PCM default.
   */
  async function addFormatsColumn(): Promise<void> {
    const columns = await client.execute('PRAGMA table_info(cloud_voice_models)');
    if (columns.rows.some((row) => row.name === 'audio_formats')) return;
    await client.execute(`ALTER TABLE cloud_voice_models ADD COLUMN audio_formats TEXT NOT NULL DEFAULT '["pcm"]'`);
    await client.batch(
      CLOUD_VOICE_CATALOG.map((model) => ({
        sql: 'UPDATE cloud_voice_models SET audio_formats = ? WHERE id = ?',
        args: [JSON.stringify(model.formats), model.id],
      })),
      'write',
    );
  }

  function insertStatement(
    model: CloudVoiceModel,
    sortOrder: number,
    atMs: number,
    fetchedAtMs: number | null,
  ) {
    return {
      sql: `INSERT INTO cloud_voice_models (
          id, label, maker, description, min_plan, sort_order, price_per_million_characters,
          max_characters, speed_supported, audio_formats, voices, default_voice, pricing_fetched_at_ms,
          created_at_ms, updated_at_ms
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        model.id,
        model.label,
        model.maker,
        model.description,
        model.minPlan,
        sortOrder,
        model.pricePerMillionCharacters,
        model.maxCharacters,
        model.speedSupported ? 1 : 0,
        JSON.stringify(model.formats),
        JSON.stringify(model.voices),
        model.defaultVoice,
        fetchedAtMs,
        atMs,
        atMs,
      ],
    };
  }

  async function list(): Promise<CloudVoiceModel[]> {
    const result = await client.execute('SELECT * FROM cloud_voice_models ORDER BY sort_order ASC');
    return result.rows.map((row) => rowToVoiceModel(row as unknown as Record<string, unknown>));
  }

  async function find(id: string): Promise<CloudVoiceModel | null> {
    const result = await client.execute({
      sql: 'SELECT * FROM cloud_voice_models WHERE id = ?',
      args: [id],
    });
    const row = result.rows[0];
    return row ? rowToVoiceModel(row as unknown as Record<string, unknown>) : null;
  }

  /** Appends at the end of the picker order. The row must not exist. */
  async function insert(model: CloudVoiceModel): Promise<void> {
    const max = await client.execute('SELECT MAX(sort_order) AS maxOrder FROM cloud_voice_models');
    const next = Number(max.rows[0]?.maxOrder ?? -1) + 1;
    const atMs = now();
    await client.execute(insertStatement(model, next, atMs, atMs));
  }

  /** Overwrites everything but the sort order. */
  async function update(model: CloudVoiceModel): Promise<void> {
    const atMs = now();
    await client.execute({
      sql: `UPDATE cloud_voice_models SET
          label = ?, maker = ?, description = ?, min_plan = ?,
          price_per_million_characters = ?, max_characters = ?, speed_supported = ?,
          audio_formats = ?, voices = ?, default_voice = ?, pricing_fetched_at_ms = ?, updated_at_ms = ?
        WHERE id = ?`,
      args: [
        model.label,
        model.maker,
        model.description,
        model.minPlan,
        model.pricePerMillionCharacters,
        model.maxCharacters,
        model.speedSupported ? 1 : 0,
        JSON.stringify(model.formats),
        JSON.stringify(model.voices),
        model.defaultVoice,
        atMs,
        atMs,
        model.id,
      ],
    });
  }

  async function remove(id: string): Promise<boolean> {
    const result = await client.execute({
      sql: 'DELETE FROM cloud_voice_models WHERE id = ?',
      args: [id],
    });
    return result.rowsAffected > 0;
  }

  /**
   * What the background refresh learned. Stamped even when nothing came
   * back, so "asked, and OpenRouter publishes nothing" can be told apart
   * from "never asked", as `setCloudModelFacts` does for the chat models.
   */
  async function setFacts(id: string, facts: VoiceModelFacts): Promise<void> {
    const atMs = now();
    await client.execute({
      sql: `UPDATE cloud_voice_models SET
          price_per_million_characters = COALESCE(?, price_per_million_characters),
          voices = COALESCE(?, voices),
          pricing_fetched_at_ms = ?,
          updated_at_ms = ?
        WHERE id = ?`,
      args: [
        facts.pricePerMillionCharacters,
        facts.voices && facts.voices.length > 0 ? JSON.stringify(facts.voices) : null,
        atMs,
        atMs,
        id,
      ],
    });
  }

  return { ensureSchema, list, find, insert, update, remove, setFacts };
}

/** The production catalogue, on the shared database. */
export const voiceCatalog = createVoiceCatalog(db);
