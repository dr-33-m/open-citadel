/**
 * Kokoro, the fullest-sounding on-device voice reader, and its roster.
 *
 * English in two accents, US and GB. ExecuTorch's registry has no other
 * English (no Irish, Australian, African...), and one Kokoro pipeline takes a
 * single phonemizer, so each accent is its own model config sharing the same
 * weights. ExecuTorch's own `DEFAULT` picks the Core ML export on a binary
 * that carries it and XNNPACK otherwise — unlike the LLM catalogue, that
 * default is exactly right here, since Kokoro has no tool-calling tradeoff to
 * protect against.
 *
 * Imports nothing from `catalogue.ts`, which builds the cross-engine helpers
 * on top of this file.
 */

import type { KokoroTtsModel } from 'react-native-executorch';

import { getExecuTorch } from '@/lib/executorch';

/**
 * The picker's order. Accents alternate so the first few swipes already show
 * the range, rather than four American voices before the first British one.
 */
export const KOKORO_VOICES = [
  'af_heart',
  'bf_emma',
  'am_adam',
  'bm_daniel',
  'af_river',
  'am_michael',
  'af_sarah',
  'am_santa',
] as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[number];

export type KokoroAccent = 'us' | 'gb';

export const VOICE_ACCENTS: Record<KokoroVoice, KokoroAccent> = {
  af_heart: 'us',
  bf_emma: 'gb',
  am_adam: 'us',
  bm_daniel: 'gb',
  af_river: 'us',
  am_michael: 'us',
  af_sarah: 'us',
  am_santa: 'us',
};

export const ACCENT_LABELS: Record<KokoroAccent, string> = { us: 'US', gb: 'UK' };

export function isKokoroVoice(voice: string | null | undefined): voice is KokoroVoice {
  return !!voice && (KOKORO_VOICES as readonly string[]).includes(voice);
}

/** A name worth reading, for the voice picker. The registry only has ids. */
export const VOICE_LABELS: Record<KokoroVoice, string> = {
  af_heart: 'Yennefer',
  bf_emma: 'Emma',
  am_adam: 'Arthur',
  bm_daniel: 'Winston',
  af_river: 'Lara',
  am_michael: 'Leon',
  af_sarah: 'Chloe',
  am_santa: 'Sully',
};

/** A quick sense of each voice's character, for the voice picker. */
export const VOICE_DESCRIPTIONS: Record<KokoroVoice, string> = {
  af_heart: 'Warm, low',
  bf_emma: 'Poised, clear',
  am_adam: 'Deep, measured',
  bm_daniel: 'Steady, formal',
  af_river: 'Bright, clear',
  am_michael: 'Crisp, even',
  af_sarah: 'Soft, calm',
  am_santa: 'Old, energetic',
};

/** One model config per accent, or null when the runtime is not in this binary. */
export function kokoroModels(): Record<KokoroAccent, KokoroTtsModel<string>> | null {
  const et = getExecuTorch();
  if (!et) return null;
  const { EN_US, EN_GB } = et.models.textToSpeech.KOKORO;
  return { us: EN_US.DEFAULT as KokoroTtsModel<string>, gb: EN_GB.DEFAULT as KokoroTtsModel<string> };
}
