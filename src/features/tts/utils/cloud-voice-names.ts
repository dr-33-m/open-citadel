/**
 * What a cloud voice is called and how it is described.
 *
 * Kokoro in the cloud is the same Kokoro as on the phone, so a voice the
 * phone already names keeps its name: `af_heart` is Yennefer in both places.
 * The rest of Kokoro's ids are read as the name they carry (`bf_lily` is
 * Lily), Gemini's are names already, and ElevenLabs' only want a capital.
 */
import { VOICE_DESCRIPTIONS, VOICE_LABELS, isKokoroVoice } from '@/services/device-tts/catalogue';
import type { DeviceVoiceRow } from '@/utils/device-voices';

const KOKORO_ID = /^([a-z])([fm])_(.+)$/;
const KOKORO_ACCENTS: Record<string, string> = { a: 'US', b: 'UK' };

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function cloudVoiceLabel(voice: string): string {
  if (isKokoroVoice(voice)) return VOICE_LABELS[voice];
  const kokoro = KOKORO_ID.exec(voice);
  if (kokoro) return capitalise(kokoro[3]);
  return capitalise(voice);
}

/** The line under a voice's name, where something is known about it. */
export function cloudVoiceDescriptor(voice: string): string | null {
  const kokoro = KOKORO_ID.exec(voice);
  if (!kokoro) return null;
  const accent = KOKORO_ACCENTS[kokoro[1]];
  const character = isKokoroVoice(voice) ? VOICE_DESCRIPTIONS[voice] : kokoro[2] === 'f' ? 'Female' : 'Male';
  return accent ? `${accent} · ${character}` : character;
}


/** A model's voices as rows of the shared voice list, named as above. */
export function cloudVoiceRows(voices: readonly string[]): DeviceVoiceRow[] {
  return voices.map((voice) => ({
    kind: 'voice',
    key: voice,
    voice: { identifier: voice, name: cloudVoiceLabel(voice), language: cloudVoiceDescriptor(voice) ?? '', quality: '' },
  }));
}
