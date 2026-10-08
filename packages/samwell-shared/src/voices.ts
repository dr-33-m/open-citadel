/**
 * Cloud reading voices: which makers there are, what each plan reaches, and
 * what an hour of listening costs.
 *
 * Shared for the same reason `billing.ts` is. The server charges for speech
 * and the app draws "about so many hours on your plan"; if the two did the
 * arithmetic separately they would drift, and the first sign would be a
 * reader told one thing and charged another.
 *
 * Prices here are a seed, never the truth. The server stores the catalogue in
 * its own table, refreshes the prices from OpenRouter on a timer, and sends
 * the app figures (Neurons, hours) rather than dollars. Nothing in the app may
 * price a voice from this file.
 *
 * Pure and dependency-free, so it can be tested on its own.
 */
import { CREDIT_PLANS, creditValueUsd, planIncludes, type PlanId } from './billing';

export interface CloudVoiceModel {
  /** OpenRouter's model id, which is also what the speech endpoint is sent. */
  id: string;
  /** Shown in the picker: "Gemini Flash Lite", "Eleven v4 Turbo". */
  label: string;
  /** Who makes it, drawn as the maker chip: "Kokoro", "Google", "ElevenLabs". */
  maker: string;
  /** One line under the model, in the reader's terms. */
  description: string;
  /**
   * The cheapest plan that may use it. Cumulative, as with the chat models:
   * an Archmaester reaches Kokoro too, and spending slowly is a fair choice.
   */
  minPlan: PlanId;
  /**
   * What OpenRouter charges, as dollars per million characters read.
   *
   * One unit for every maker, because characters are what a reader has and
   * what a piece is cut by. Two makers price by the character already; Gemini
   * prices by the token and is converted once, on the server, by
   * `pricePerMillionCharactersFromTokens`. Null until a price is known, and
   * a model with no price refuses to speak rather than speaking for nothing.
   */
  pricePerMillionCharacters: number | null;
  /** The longest piece one request may carry. */
  maxCharacters: number;
  /**
   * Whether the maker honours a `speed` other than 1.
   *
   * Some makers ignore it and some answer 400, so the server only forwards a
   * speed for a model marked true, and the app hides the reading speed
   * stepper for the rest. Seeded true for Kokoro alone, and that seed is
   * unverified against live traffic: see CLOUD-VOICES-HANDOVER.md.
   */
  speedSupported: boolean;
  /** The maker's own voice ids, exactly as the speech endpoint takes them. */
  voices: string[];
  defaultVoice: string;
}

/**
 * The longest piece of text sent in one request.
 *
 * Readium hands over a sentence at a time, so this only bites on a sentence
 * that runs on for a paragraph; the app cuts those at clause ends and streams
 * the parts in order. Kept well under every maker's own limit (Kokoro's
 * context is 4,096), so a piece is never refused for its length.
 */
export const CLOUD_VOICE_MAX_CHARACTERS = 1_500;

// -- Converting token prices -------------------------------------------------

/**
 * How fast a voice reads, for turning prices into hours.
 *
 * Measured on the books themselves rather than assumed: 425,000 to 680,000
 * characters a book read in 8 to 13 hours is 14 to 15 characters a second.
 * Fifteen is the faster end, which makes an hour cost more and an estimate of
 * hours come out lower. Under-promising is the safe direction.
 */
export const CHARACTERS_PER_SECOND = 15;
export const CHARACTERS_PER_HOUR = CHARACTERS_PER_SECOND * 3_600;

/** Gemini's audio is billed at 25 tokens for each second it plays. */
export const AUDIO_TOKENS_PER_SECOND = 25;

/** The usual rule of thumb for English text going in: four characters a token. */
export const CHARACTERS_PER_TEXT_TOKEN = 4;

/** What the estimates are drawn against. Measured lengths, not guesses. */
export const CHAPTER_CHARACTERS = 22_500;

const PER_MILLION = 1_000_000;

/**
 * A token-priced voice, as dollars per million characters.
 *
 * Both halves count: the text going in at the prompt price, and the audio
 * coming out at the completion price, which is nearly all of it. Prices are
 * dollars PER TOKEN, as OpenRouter publishes them. Null when the audio price
 * is unknown, since that is the part that matters.
 */
export function pricePerMillionCharactersFromTokens(
  promptPerToken: number | null,
  completionPerToken: number | null,
): number | null {
  if (completionPerToken == null || !(completionPerToken > 0)) return null;
  const audioPerCharacter = (completionPerToken * AUDIO_TOKENS_PER_SECOND) / CHARACTERS_PER_SECOND;
  const textPerCharacter =
    promptPerToken != null && promptPerToken > 0 ? promptPerToken / CHARACTERS_PER_TEXT_TOKEN : 0;
  return (audioPerCharacter + textPerCharacter) * PER_MILLION;
}

// -- The seed ----------------------------------------------------------------

const KOKORO_VOICES = [
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole',
  'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir',
  'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_emma',
  'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
];

const GEMINI_VOICES = [
  'Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe',
  'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib',
  'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
  'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

const ELEVENLABS_VOICES = [
  'george', 'sarah', 'adam', 'alice', 'bella', 'bill', 'brian', 'callum', 'charlie', 'chris',
  'daniel', 'eric', 'harry', 'jessica', 'laura', 'liam', 'lily', 'matilda', 'river', 'roger',
  'will',
];

/**
 * The voices each plan opens up, with the prices they were seeded at
 * (OpenRouter, 2026-10-08).
 *
 * Seeds an empty table and nothing more. Fish Audio is left out on purpose:
 * OpenRouter lists no fixed voices for it, a voice there is made by uploading
 * reference audio, and cloned voices are not part of this version. Because
 * the catalogue is data, it can be registered later with one admin call.
 *
 * ElevenLabs is seeded at its listed price. OpenRouter's endpoint carries a
 * 0.5 discount and it is not yet known whether the listed price is before or
 * after it; the listed one can only make an estimate low on hours, never
 * high, and the charge is always the real cost either way.
 */
export const CLOUD_VOICE_CATALOG: CloudVoiceModel[] = [
  {
    id: 'hexgrad/kokoro-82m',
    label: 'Kokoro',
    maker: 'Kokoro',
    description:
      'The same Kokoro voices, read from the cloud so the phone does not strain.',
    minPlan: 'maester',
    pricePerMillionCharacters: 0.62,
    maxCharacters: CLOUD_VOICE_MAX_CHARACTERS,
    speedSupported: true,
    voices: KOKORO_VOICES,
    defaultVoice: 'af_heart',
  },
  {
    id: 'google/gemini-3.8-flash-lite-tts',
    label: 'Gemini Flash Lite',
    maker: 'Google',
    description: 'Clear and natural, and it lasts.',
    minPlan: 'grand_maester',
    pricePerMillionCharacters: pricePerMillionCharactersFromTokens(0.0000005, 0.000006),
    maxCharacters: CLOUD_VOICE_MAX_CHARACTERS,
    speedSupported: false,
    voices: GEMINI_VOICES,
    defaultVoice: 'Kore',
  },
  {
    id: 'google/gemini-3.8-flash-tts',
    label: 'Gemini Flash',
    maker: 'Google',
    description: 'Richer reading, with more feeling in it.',
    minPlan: 'grand_maester',
    pricePerMillionCharacters: pricePerMillionCharactersFromTokens(0.0000005, 0.000009),
    maxCharacters: CLOUD_VOICE_MAX_CHARACTERS,
    speedSupported: false,
    voices: GEMINI_VOICES,
    defaultVoice: 'Kore',
  },
  {
    id: 'elevenlabs/eleven-v4-turbo',
    label: 'Eleven v4 Turbo',
    maker: 'ElevenLabs',
    description: 'Lifelike voices that start quickly.',
    minPlan: 'archmaester',
    pricePerMillionCharacters: 20,
    maxCharacters: CLOUD_VOICE_MAX_CHARACTERS,
    speedSupported: false,
    voices: ELEVENLABS_VOICES,
    defaultVoice: 'george',
  },
  {
    id: 'elevenlabs/eleven-v4',
    label: 'Eleven v4',
    maker: 'ElevenLabs',
    description: 'The most expressive reading in the app, and the dearest.',
    minPlan: 'archmaester',
    pricePerMillionCharacters: 40,
    maxCharacters: CLOUD_VOICE_MAX_CHARACTERS,
    speedSupported: false,
    voices: ELEVENLABS_VOICES,
    defaultVoice: 'george',
  },
];

// -- Reach -------------------------------------------------------------------

/** Every voice model a reader on this plan may use, in catalogue order. */
export function voicesForPlan<T extends Pick<CloudVoiceModel, 'minPlan'>>(
  models: readonly T[],
  plan: PlanId,
): T[] {
  return models.filter((model) => planIncludes(plan, model.minPlan));
}

/**
 * The voice model a plan starts on: the one that lasts, not the dearest.
 *
 * The opposite of the chat models' rule, and deliberately. A chat turn is a
 * short thing and showing a plan's best brain is the point; a book is hours
 * long, and a default that runs the balance down in a weekend is a worse
 * first impression than a plainer voice that reads the whole book. So it is
 * the cheapest priced model in the plan's own band, falling back to the
 * cheapest it can reach, then to catalogue order.
 */
export function defaultVoiceModelId<
  T extends Pick<CloudVoiceModel, 'id' | 'minPlan' | 'pricePerMillionCharacters'>,
>(models: readonly T[], plan: PlanId): string | null {
  const reachable = voicesForPlan(models, plan);
  const cheapest = (candidates: readonly T[]): T | null => {
    let best: T | null = null;
    for (const model of candidates) {
      const price = model.pricePerMillionCharacters;
      if (price == null || !(price > 0)) continue;
      if (!best || price < (best.pricePerMillionCharacters as number)) best = model;
    }
    return best;
  };
  const own = cheapest(reachable.filter((model) => model.minPlan === plan));
  return own?.id ?? cheapest(reachable)?.id ?? reachable[0]?.id ?? null;
}

// -- Cost --------------------------------------------------------------------

/** What reading this many characters costs, in dollars, or null if unpriced. */
export function ttsCostUsd(
  characters: number,
  model: Pick<CloudVoiceModel, 'pricePerMillionCharacters'>,
): number | null {
  const price = model.pricePerMillionCharacters;
  if (price == null || !(price > 0)) return null;
  return (Math.max(0, characters) / PER_MILLION) * price;
}

/**
 * How many hours of listening a plan's whole monthly grant buys on a model.
 *
 * Against the AI budget, which is what the grant is worth, so this is the
 * number of hours a reader who spends every Neuron on this voice gets. Null
 * for a model with no price.
 */
export function listeningHours(
  plan: PlanId,
  model: Pick<CloudVoiceModel, 'pricePerMillionCharacters'>,
): number | null {
  const hourCost = ttsCostUsd(CHARACTERS_PER_HOUR, model);
  if (hourCost == null || !(hourCost > 0)) return null;
  return CREDIT_PLANS[plan].aiBudgetUsd / hourCost;
}

/**
 * Neurons for a stretch of reading, rounded to the nearest and never below
 * one. An estimate to draw, not a charge: the charge is the real cost, kept
 * as a running remainder on the server so no sentence is rounded up on its
 * own.
 */
export function ttsCreditsEstimate(
  characters: number,
  model: Pick<CloudVoiceModel, 'pricePerMillionCharacters'>,
  plan: PlanId,
): number | null {
  const cost = ttsCostUsd(characters, model);
  if (cost == null) return null;
  return Math.max(1, Math.round(cost / creditValueUsd(CREDIT_PLANS[plan])));
}

// -- Stored voice ids --------------------------------------------------------

/**
 * How a chosen cloud voice is written in the app's `ttsVoice` setting:
 * `cloud:<modelId>:<voice>`. A model id may carry a colon of its own (a
 * `:free` variant) and a voice id never does, so the LAST colon is the one
 * that separates them.
 */
export const CLOUD_VOICE_PREFIX = 'cloud:';

export function cloudVoiceKey(modelId: string, voice: string): string {
  return `${CLOUD_VOICE_PREFIX}${modelId}:${voice}`;
}

export function parseCloudVoiceKey(
  value: string | null | undefined,
): { modelId: string; voice: string } | null {
  if (!value || !value.startsWith(CLOUD_VOICE_PREFIX)) return null;
  const rest = value.slice(CLOUD_VOICE_PREFIX.length);
  const split = rest.lastIndexOf(':');
  if (split <= 0 || split === rest.length - 1) return null;
  return { modelId: rest.slice(0, split), voice: rest.slice(split + 1) };
}
