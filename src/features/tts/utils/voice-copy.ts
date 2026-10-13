/**
 * What the reading voices are called, in one place.
 *
 * On-device has two kinds, named for what they ask of the phone: Lite (the
 * phone's own voices, which run anywhere) and Enhanced (the voices Open
 * Citadel downloads, which sound more human and want a stronger phone).
 * Cloud is the third, and the most advanced. The names climb, so somebody
 * choosing knows which way is up without being told what "native" means.
 */
import type { VoiceMode } from '@/services/device-tts/catalogue';

/** Where the reading voice runs: on this phone, or in the cloud. */
export type VoiceSource = 'device' | 'cloud';

export type OnDeviceKind = { mode: VoiceMode; name: string };

/** In the order the switch draws them: the lighter one first, climbing toward Cloud. */
export const ON_DEVICE_KINDS: readonly OnDeviceKind[] = [
  { mode: 'native', name: 'Lite' },
  { mode: 'ai', name: 'Enhanced' },
];

/** The kind's name, as a settings summary and a screen reader say it. */
export function onDeviceKindName(mode: VoiceMode): string {
  return ON_DEVICE_KINDS.find((kind) => kind.mode === mode)?.name ?? '';
}

/** The foot of the cloud card until cloud voices open. */
export const CLOUD_VOICES_SOON = 'COMING SOON';

/** The one line under the switch: what the chosen kind is. */
export function onDeviceHint(mode: VoiceMode): string {
  return mode === 'native' ? 'Lightweight. Works on most phones.' : 'Sounds more human.';
}

/** Shown in place of the switch on a phone that cannot run the Enhanced voices at all. */
export const ENHANCED_UNSUPPORTED = 'Enhanced voices are not supported on this phone.';

/** Under a Lite voice where the phone gives no control of its speed. */
export const LITE_SPEED_FIXED = 'Reading speed cannot be changed with a Lite voice.';
