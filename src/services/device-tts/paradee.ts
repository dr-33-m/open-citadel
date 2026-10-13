/**
 * Paradee, the smallest on-device voice reader: Kokoro distilled to a tenth of
 * its size, about 50 MB against 350.
 *
 * It is Kokoro's own design, with Kokoro's phonemes, so it runs through the
 * same pipeline (`createKokoroTextToSpeech`) from two programs exported for it
 * by `scripts/paradee/export_paradee_pte.py`. It has one voice, Kokoro's
 * `af_heart`, learned into the weights: the pipeline still asks for a voice
 * file, so it is given a row of zeros that the model does not read.
 *
 * Imports nothing from `catalogue.ts`, which builds the cross-engine helpers
 * on top of this file.
 */

import type { KokoroTtsModel } from 'react-native-executorch';

import { getExecuTorch } from '@/lib/executorch';

/**
 * Where Paradee's files are served from: our own export of it, on Hugging
 * Face. Pinned to a tag, as the library pins Kokoro's, so a later export is a
 * new address and a phone that has this one keeps what it downloaded.
 */
const PARADEE_ROOT = 'https://huggingface.co/dr33m/paradee-8m-executorch/resolve/v1';

/**
 * Its own id, not `af_heart`: a voice's id decides the engine that speaks it,
 * and that one is Kokoro's.
 */
export const PARADEE_VOICES = ['pd_heart'] as const;

export type ParadeeVoice = (typeof PARADEE_VOICES)[number];

export function isParadeeVoice(voice: string | null | undefined): voice is ParadeeVoice {
  return !!voice && (PARADEE_VOICES as readonly string[]).includes(voice);
}

/** A name worth reading, for the voice picker. She is Kokoro's Yennefer, made small. */
export const PARADEE_LABELS: Record<ParadeeVoice, string> = { pd_heart: 'Yennefer' };

/** The line under her name, in the shape Kokoro's voices use: accent, then character. */
export const PARADEE_DESCRIPTIONS: Record<ParadeeVoice, string> = { pd_heart: 'US · Warm, low' };

/**
 * The model config, or null when the runtime is not in this binary.
 *
 * The phonemizer is the library's own US English one, by the same addresses
 * Kokoro uses, so a phone that already has Kokoro fetches only the two
 * programs and the voice file.
 */
export function paradeeModel(): KokoroTtsModel<string> | null {
  const et = getExecuTorch();
  if (!et) return null;
  return {
    name: 'kokoro',
    modelPaths: {
      durationPredictor: `${PARADEE_ROOT}/duration_predictor_paradee_xnnpack_fp32.pte`,
      synthesizer: `${PARADEE_ROOT}/synthesizer_paradee_xnnpack_fp32.pte`,
    },
    phonemizer: et.models.textToSpeech.KOKORO.EN_US.DEFAULT.phonemizer,
    voices: { pd_heart: `${PARADEE_ROOT}/voices/pd_heart.bin` },
  };
}
