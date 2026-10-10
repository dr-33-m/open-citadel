/**
 * The on-device voice readers: which engines there are, and Kokoro's roster.
 *
 * Two engines, each its own download. Kokoro has the fuller sound and the two
 * accents, but makes speech slower than it is spoken on a mid-range phone (a
 * Galaxy A33 took about three seconds per second of speech). Supertonic
 * (`supertonic.ts`) is the lighter one. Which engine is in use is never stored
 * on its own: it follows from the chosen voice.
 *
 * Kokoro is English in two accents, US and GB. ExecuTorch's registry has no
 * other English (no Irish, Australian, African...), and one Kokoro pipeline
 * takes a single phonemizer, so each accent is its own model config sharing
 * the same weights. ExecuTorch's own `DEFAULT` picks the Core ML export on a
 * binary that carries it and XNNPACK otherwise — unlike the LLM catalogue,
 * that default is exactly right here, since Kokoro has no tool-calling
 * tradeoff to protect against.
 */

import type { KokoroTtsModel } from 'react-native-executorch';
import * as Device from 'expo-device';
import { parseCloudVoiceKey } from 'samwell-shared';

import { getExecuTorch } from '@/lib/executorch';
import {
  SUPERTONIC_DESCRIPTIONS,
  SUPERTONIC_LABELS,
  SUPERTONIC_VOICES,
  isSupertonicVoice,
  type SupertonicVoice,
} from '@/services/device-tts/supertonic';

export type TtsEngineId = 'kokoro' | 'supertonic';

/** The engine picker's order. */
export const TTS_ENGINES: readonly TtsEngineId[] = ['supertonic', 'kokoro'];

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

export const DEFAULT_VOICE: KokoroVoice = 'af_heart';

/** Any voice an on-device engine speaks, as opposed to one of the phone's own. */
export type AiVoice = KokoroVoice | SupertonicVoice;

/**
 * The "native" reading voice: the phone's own text-to-speech (Android's
 * TextToSpeech, iOS's AVSpeechSynthesizer), through Readium's built-in engine.
 * The native side of the reader matches this exact string.
 */
export const DEVICE_VOICE = 'system-voice' as const;
export type ReaderVoice = AiVoice | typeof DEVICE_VOICE;

/** Both native readers have a device-voice path; only the web reader has neither. */
export const NATIVE_VOICE_AVAILABLE = process.env.EXPO_OS === 'android' || process.env.EXPO_OS === 'ios';

/**
 * Whether the native voice follows the reading speed. Android's does; on iOS
 * Readium's `AVTTSEngine` ignores the rate it is given, so the control would
 * do nothing there.
 */
export const NATIVE_SPEED_SUPPORTED = process.env.EXPO_OS === 'android';

/**
 * Kokoro's FP32 model is about 330 MB of weights and exhausted a 2 GB emulator
 * during book playback. Running out of memory kills the native runtime, which
 * JS cannot catch, so a phone this small is never asked to load it.
 */
export const LOW_MEMORY_ANDROID = process.env.EXPO_OS === 'android'
  && Device.totalMemory !== null
  && Device.totalMemory < 3 * 1024 ** 3;

/**
 * What each engine is called, what it is like, and what it costs to download
 * (Kokoro: its weights plus the two accents' extras).
 *
 * The hint is the one line under the engine switches: what each is best at, in
 * terms of what is heard. The voices themselves are in the run under it, so
 * their number is not said, and one engine's line does not carry a warning
 * the other's does not. One line each, so the chips do not move when it changes.
 */
export const ENGINE_INFO: Record<TtsEngineId, { label: string; hint: string; downloadSize: string }> = {
  supertonic: {
    label: 'SUPERTONIC',
    hint: 'Starts quickly. The lighter of the two.',
    downloadSize: '400 MB',
  },
  kokoro: {
    label: 'KOKORO',
    hint: 'The most natural voices, in US and UK accents.',
    downloadSize: '350 MB',
  },
};

/** Whether this device can run the AI voices at all. */
export const AI_VOICES_SUPPORTED = !LOW_MEMORY_ANDROID;

/**
 * Which of the reader's voice kinds a persisted `ttsVoice` setting selects:
 * the two on-device kinds, or a cloud voice (`cloud:<modelId>:<voice>`).
 */
export type VoiceMode = 'ai' | 'native' | 'cloud';

/** The kinds that run on the phone, which the on-device switch moves between. */
export type OnDeviceMode = Exclude<VoiceMode, 'cloud'>;

/** Whether a stored voice is a cloud one. The format itself is `samwell-shared`'s. */
export function isCloudVoice(voice: string | null | undefined): boolean {
  return parseCloudVoiceKey(voice) !== null;
}

export function isKokoroVoice(voice: string | null | undefined): voice is KokoroVoice {
  return !!voice && (KOKORO_VOICES as readonly string[]).includes(voice);
}

/** Whether `voice` is one of the AI voice ids, of either engine, as opposed to a phone voice. */
export function isAiVoice(voice: string | null | undefined): voice is AiVoice {
  return isKokoroVoice(voice) || isSupertonicVoice(voice);
}

export function engineOf(voice: AiVoice): TtsEngineId {
  return isSupertonicVoice(voice) ? 'supertonic' : 'kokoro';
}

const ROSTERS: Record<TtsEngineId, readonly AiVoice[]> = { kokoro: KOKORO_VOICES, supertonic: SUPERTONIC_VOICES };

/** An engine's voices, in the picker's order. */
export function voicesOf(engine: TtsEngineId): readonly AiVoice[] {
  return ROSTERS[engine];
}

/**
 * The mode a persisted `ttsVoice` puts the reader in. A cloud voice is cloud
 * on any phone, since nothing about it runs here. Of the rest, the AI voices
 * come first: no choice yet (`null`) or one of their ids is AI. Anything else,
 * the "system-voice" default or a specific phone voice, is native. A phone
 * that cannot hold the AI voices is always native, whatever was saved before.
 * The web reader has no synthesis bridge at all, so it is always AI.
 */
export function voiceMode(voice: string | null): VoiceMode {
  if (!NATIVE_VOICE_AVAILABLE) return 'ai';
  if (isCloudVoice(voice)) return 'cloud';
  if (!AI_VOICES_SUPPORTED) return 'native';
  return voice === null || isAiVoice(voice) ? 'ai' : 'native';
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

/** A voice's name, whichever engine speaks it. */
export function voiceLabel(voice: AiVoice): string {
  return isSupertonicVoice(voice) ? SUPERTONIC_LABELS[voice] : VOICE_LABELS[voice];
}

/** The line under a voice's name: where it is from when that is known, then its character. */
export function voiceDescriptor(voice: AiVoice): string {
  if (isSupertonicVoice(voice)) return SUPERTONIC_DESCRIPTIONS[voice];
  return `${ACCENT_LABELS[VOICE_ACCENTS[voice]]} · ${VOICE_DESCRIPTIONS[voice]}`;
}

/**
 * The known voice for a persisted `ttsVoice` setting, which is a plain
 * `string | null` (loaded back from the database, not narrowed at the type
 * level) — falls back to `DEFAULT_VOICE` for `null` or a value the rosters no
 * longer have, e.g. after a voice is retired.
 */
export function resolveVoice(voice: string | null | undefined): AiVoice {
  return isAiVoice(voice) ? voice : DEFAULT_VOICE;
}

/**
 * The voice id the native reader is started with. Its engine that asks JS for
 * audio only knows Kokoro's ids, and takes "no voice" to mean that engine too,
 * so a Supertonic or cloud voice is sent as none and the bridge reads the
 * real choice from settings (`use-read-aloud-bridge.ts`). That is the whole
 * of what a cloud voice asks of the native side, which is why it needs no
 * new build.
 */
export function readerVoiceId(voice: string | null): string | undefined {
  return voice === null || isSupertonicVoice(voice) || isCloudVoice(voice) ? undefined : voice;
}

/** One model config per accent, or null when the runtime is not in this binary. */
export function kokoroModels(): Record<KokoroAccent, KokoroTtsModel<string>> | null {
  const et = getExecuTorch();
  if (!et) return null;
  const { EN_US, EN_GB } = et.models.textToSpeech.KOKORO;
  return { us: EN_US.DEFAULT as KokoroTtsModel<string>, gb: EN_GB.DEFAULT as KokoroTtsModel<string> };
}
