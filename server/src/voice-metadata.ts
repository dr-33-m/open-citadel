/**
 * What OpenRouter says about a voice model: its price and its voices.
 *
 * The chat models' refresh (`model-context.ts`) reads `/api/v1/models`, and
 * that list leaves speech models out. Asking it for `output_modalities=speech`
 * brings them back, voices included, in one request, so the refresh here is
 * one call on the same twelve-hour rhythm. An admin adding one model uses the
 * single-model endpoint instead, which answers 404 for a typo.
 *
 * Fails soft everywhere, like the chat refresh: a slow or broken OpenRouter
 * leaves the last known price in place and never sits in front of a reader.
 */
import {
  CLOUD_VOICE_MAX_CHARACTERS,
  pricePerMillionCharactersFromTokens,
  withPcm,
  type CloudVoiceModel,
  type PlanId,
  type SpeechFormat,
} from 'samwell-shared';

import { MODEL_CONTEXT_REFRESH_MS } from './model-context.js';
import { voiceCatalog, type VoiceCatalog, type VoiceModelFacts } from './voice-catalog.js';

const SPEECH_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=speech';
const REQUEST_TIMEOUT_MS = 10_000;
const PER_MILLION = 1_000_000;

export interface OpenRouterSpeechModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown } | null;
  supported_voices?: unknown;
}

function positive(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * One model's price, as dollars per million characters.
 *
 * Two shapes reach here and they are told apart by the completion price.
 * Kokoro and ElevenLabs publish only a prompt price, and for them the prompt
 * IS the text read, priced per character. Gemini publishes a completion price
 * for its audio tokens, and is converted by the shared rule so the server and
 * the seed agree. Zero or missing reads as unknown, never as free.
 */
export function readVoicePrice(entry: OpenRouterSpeechModel): number | null {
  const prompt = positive(entry.pricing?.prompt);
  const completion = positive(entry.pricing?.completion);
  if (completion != null) return pricePerMillionCharactersFromTokens(prompt, completion);
  return prompt == null ? null : prompt * PER_MILLION;
}

export function readVoiceList(entry: OpenRouterSpeechModel): string[] | null {
  if (!Array.isArray(entry.supported_voices)) return null;
  const voices = entry.supported_voices.filter((v): v is string => typeof v === 'string' && !!v);
  return voices.length > 0 ? voices : null;
}

export function readVoiceFacts(entry: OpenRouterSpeechModel): VoiceModelFacts {
  return { pricePerMillionCharacters: readVoicePrice(entry), voices: readVoiceList(entry) };
}

/**
 * "Google: Gemini 3.8 Flash Lite TTS" as a reader would say it: the maker's
 * prefix and the trailing "TTS" come off.
 */
function readableName(name: string): string {
  const afterMaker = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  return afterMaker.replace(/\bTTS\b/g, '').replace(/\s+/g, ' ').trim() || name.trim();
}

export interface VoiceModelInput {
  minPlan: PlanId;
  label?: string;
  maker?: string;
  description?: string;
  defaultVoice?: string;
  speedSupported?: boolean;
  formats?: SpeechFormat[];
}

/**
 * A catalogue row from one OpenRouter model, or null when it cannot be one.
 *
 * A model with no fixed voices (Fish Audio, where a voice is made from an
 * uploaded recording) is refused here rather than stored: there would be
 * nothing for a reader to choose, and nothing `/tts/speak` could accept.
 */
export function toVoiceModel(
  entry: OpenRouterSpeechModel,
  input: VoiceModelInput,
): CloudVoiceModel | null {
  const id = typeof entry.id === 'string' ? entry.id : null;
  const name = typeof entry.name === 'string' ? entry.name : null;
  const voices = readVoiceList(entry);
  if (!id || !name || !voices) return null;

  const context = positive(entry.context_length);
  const defaultVoice =
    input.defaultVoice && voices.includes(input.defaultVoice) ? input.defaultVoice : voices[0];
  return {
    id,
    label: input.label ?? readableName(name),
    maker: input.maker ?? (name.includes(':') ? name.slice(0, name.indexOf(':')).trim() : id.split('/')[0]),
    description: input.description ?? readableName(name),
    minPlan: input.minPlan,
    pricePerMillionCharacters: readVoicePrice(entry),
    maxCharacters: Math.min(CLOUD_VOICE_MAX_CHARACTERS, context ?? CLOUD_VOICE_MAX_CHARACTERS),
    // Off unless somebody has heard it work: a maker that answers 400 to a
    // speed it does not take would fail every piece read at anything but 1x.
    speedSupported: input.speedSupported ?? false,
    // PCM unless told otherwise, for the same reason: a format the maker does
    // not take fails every piece, and OpenRouter does not publish which it takes.
    formats: withPcm(input.formats),
    voices,
    defaultVoice,
  };
}

export type FetchVoiceModelResult =
  | { kind: 'found'; entry: OpenRouterSpeechModel }
  | { kind: 'unknown_id' }
  | { kind: 'unreachable' };

/** Ids are interpolated into a URL path, so they are held to a strict shape. */
const MODEL_ID_RE = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._:-]+$/;

export async function fetchOpenRouterVoiceModel(
  modelId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchVoiceModelResult> {
  if (!MODEL_ID_RE.test(modelId)) return { kind: 'unknown_id' };
  try {
    const response = await fetchImpl(`https://openrouter.ai/api/v1/model/${modelId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) return { kind: 'unknown_id' };
    if (!response.ok) return { kind: 'unreachable' };
    const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
    if (!body?.data || typeof body.data !== 'object') return { kind: 'unreachable' };
    return { kind: 'found', entry: body.data as OpenRouterSpeechModel };
  } catch (error) {
    console.warn(`[Voices] OpenRouter lookup for ${modelId} failed:`, error);
    return { kind: 'unreachable' };
  }
}

/**
 * Bring stored prices and voice lists in line with OpenRouter's.
 *
 * Never trades a known value for an unknown one: a partial payload leaves the
 * stored price (or list) as it was, because a blanked price refuses every
 * piece and a blanked list refuses every voice.
 */
export async function refreshVoiceMetadata(
  catalog: VoiceCatalog = voiceCatalog,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  let entries: OpenRouterSpeechModel[];
  try {
    const response = await fetchImpl(SPEECH_MODELS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[Voices] OpenRouter speech models request failed: ${response.status}`);
      return 0;
    }
    const body = (await response.json()) as { data?: unknown };
    if (!Array.isArray(body.data)) return 0;
    entries = body.data as OpenRouterSpeechModel[];
  } catch (error) {
    console.warn('[Voices] Could not reach OpenRouter for voice metadata:', error);
    return 0;
  }

  const byId = new Map(entries.filter((e) => typeof e.id === 'string').map((e) => [e.id as string, e]));
  let updated = 0;
  for (const model of await catalog.list()) {
    const entry = byId.get(model.id);
    if (!entry) continue;
    const facts = readVoiceFacts(entry);
    const samePrice = (facts.pricePerMillionCharacters ?? model.pricePerMillionCharacters) ===
      model.pricePerMillionCharacters;
    const sameVoices =
      !facts.voices || JSON.stringify(facts.voices) === JSON.stringify(model.voices);
    if (samePrice && sameVoices) continue;
    if (!samePrice) {
      // The event that changes what an hour of listening costs a reader.
      console.log(
        `[Voices] ${model.id} price ${model.pricePerMillionCharacters} -> ` +
          `${facts.pricePerMillionCharacters} per million characters.`,
      );
    }
    await catalog.setFacts(model.id, facts);
    updated += 1;
  }
  return updated;
}

/** On boot and then on the chat refresh's rhythm. Never awaited by a request. */
export function startVoiceMetadataRefresh(): void {
  void refreshVoiceMetadata();
  const timer = setInterval(() => {
    void refreshVoiceMetadata();
  }, MODEL_CONTEXT_REFRESH_MS);
  timer.unref?.();
}
