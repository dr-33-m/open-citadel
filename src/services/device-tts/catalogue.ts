/**
 * The on-device voice readers: which engines there are, and what every one
 * of their voices is called.
 *
 * Three engines, each its own download and its own file here. Kokoro
 * (`kokoro.ts`) has the fuller sound and the two accents, but makes speech
 * slower than it is spoken on a mid-range phone (a Galaxy A33 took about
 * three seconds per second of speech). Supertonic (`supertonic.ts`) is the
 * lighter one, and Paradee (`paradee.ts`) the smallest: Kokoro distilled, for
 * the phones the other two do not fit. Which engine is in use is never stored
 * on its own: it follows from the chosen voice.
 */

import * as Device from 'expo-device';
import { parseCloudVoiceKey } from 'samwell-shared';

import {
  ACCENT_LABELS,
  KOKORO_VOICES,
  VOICE_ACCENTS,
  VOICE_DESCRIPTIONS,
  VOICE_LABELS,
  isKokoroVoice,
  type KokoroVoice,
} from '@/services/device-tts/kokoro';
import {
  PARADEE_DESCRIPTIONS,
  PARADEE_LABELS,
  PARADEE_VOICES,
  isParadeeVoice,
  type ParadeeVoice,
} from '@/services/device-tts/paradee';
import {
  SUPERTONIC_DESCRIPTIONS,
  SUPERTONIC_LABELS,
  SUPERTONIC_VOICES,
  isSupertonicVoice,
  type SupertonicVoice,
} from '@/services/device-tts/supertonic';

export {
  ACCENT_LABELS,
  KOKORO_VOICES,
  VOICE_ACCENTS,
  VOICE_DESCRIPTIONS,
  VOICE_LABELS,
  isKokoroVoice,
  kokoroModels,
  type KokoroAccent,
  type KokoroVoice,
} from '@/services/device-tts/kokoro';

export type TtsEngineId = 'kokoro' | 'supertonic' | 'paradee';

/** Any voice an on-device engine speaks, as opposed to one of the phone's own. */
export type AiVoice = KokoroVoice | SupertonicVoice | ParadeeVoice;

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
 * JS cannot catch, so a phone this small is never asked to load it, nor
 * Supertonic, which is larger still.
 */
export const LOW_MEMORY_ANDROID = process.env.EXPO_OS === 'android'
  && Device.totalMemory !== null
  && Device.totalMemory < 3 * 1024 ** 3;

/**
 * Whether this phone can be offered an engine. Paradee is a tenth of Kokoro's
 * size, so the wall that keeps the other two off a small phone does not keep
 * it off.
 */
function engineOffered(engine: TtsEngineId): boolean {
  return engine === 'paradee' || !LOW_MEMORY_ANDROID;
}

/** The engine picker's order, lightest first, with only the engines this phone can be offered. */
export const TTS_ENGINES: readonly TtsEngineId[] = (['paradee', 'supertonic', 'kokoro'] as const).filter(engineOffered);

/** The voice a phone with no choice yet reads in: Kokoro's, or Paradee's where Kokoro does not fit. */
export const DEFAULT_VOICE: AiVoice = TTS_ENGINES.includes('kokoro') ? 'af_heart' : 'pd_heart';

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
  paradee: {
    label: 'PARADEE',
    hint: 'The smallest. Made for phones with less memory.',
    downloadSize: '65 MB',
  },
  supertonic: {
    label: 'SUPERTONIC',
    hint: 'Starts quickly. Lighter than Kokoro.',
    downloadSize: '400 MB',
  },
  kokoro: {
    label: 'KOKORO',
    hint: 'The most natural voices, in US and UK accents.',
    downloadSize: '350 MB',
  },
};

/** Whether this device can run any of the AI voices. */
export const AI_VOICES_SUPPORTED = TTS_ENGINES.length > 0;

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

/** Whether `voice` is one of the AI voice ids, of any engine, as opposed to a phone voice. */
export function isAiVoice(voice: string | null | undefined): voice is AiVoice {
  return isKokoroVoice(voice) || isSupertonicVoice(voice) || isParadeeVoice(voice);
}

export function engineOf(voice: AiVoice): TtsEngineId {
  if (isSupertonicVoice(voice)) return 'supertonic';
  return isParadeeVoice(voice) ? 'paradee' : 'kokoro';
}

const ROSTERS: Record<TtsEngineId, readonly AiVoice[]> = {
  kokoro: KOKORO_VOICES,
  supertonic: SUPERTONIC_VOICES,
  paradee: PARADEE_VOICES,
};

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

/** A voice's name, whichever engine speaks it. */
export function voiceLabel(voice: AiVoice): string {
  if (isSupertonicVoice(voice)) return SUPERTONIC_LABELS[voice];
  return isParadeeVoice(voice) ? PARADEE_LABELS[voice] : VOICE_LABELS[voice];
}

/** The line under a voice's name: where it is from when that is known, then its character. */
export function voiceDescriptor(voice: AiVoice): string {
  if (isSupertonicVoice(voice)) return SUPERTONIC_DESCRIPTIONS[voice];
  if (isParadeeVoice(voice)) return PARADEE_DESCRIPTIONS[voice];
  return `${ACCENT_LABELS[VOICE_ACCENTS[voice]]} · ${VOICE_DESCRIPTIONS[voice]}`;
}

/**
 * The known voice for a persisted `ttsVoice` setting, which is a plain
 * `string | null` (loaded back from the database, not narrowed at the type
 * level) — falls back to `DEFAULT_VOICE` for `null`, a value the rosters no
 * longer have (a voice retired), or a voice of an engine this phone is not
 * offered (a backup restored onto a smaller phone).
 */
export function resolveVoice(voice: string | null | undefined): AiVoice {
  return isAiVoice(voice) && TTS_ENGINES.includes(engineOf(voice)) ? voice : DEFAULT_VOICE;
}

/**
 * The voice id the native reader is started with. Its engine that asks JS for
 * audio only knows Kokoro's ids, and takes "no voice" to mean that engine too,
 * so a Supertonic, Paradee or cloud voice is sent as none and the bridge reads the
 * real choice from settings (`use-read-aloud-bridge.ts`). That is the whole
 * of what a cloud voice asks of the native side, which is why it needs no
 * new build.
 */
export function readerVoiceId(voice: string | null): string | undefined {
  return voice === null || isSupertonicVoice(voice) || isParadeeVoice(voice) || isCloudVoice(voice) ? undefined : voice;
}
