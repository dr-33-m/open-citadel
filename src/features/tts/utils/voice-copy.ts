/**
 * What the reading voices are called, in one place.
 *
 * On-device has two kinds, named for what they ask of the phone: Lite (the
 * phone's own voices, which run anywhere) and Enhanced (the voices Open
 * Citadel downloads, which sound more human and want a stronger phone).
 * Cloud is the third, and the most advanced. The names climb, so somebody
 * choosing knows which way is up without being told what "native" means.
 */
import type { OnDeviceMode, VoiceMode } from '@/services/device-tts/catalogue';

/** Where the reading voice runs: on this phone, or in the cloud. */
export type VoiceSource = 'device' | 'cloud';

export type OnDeviceKind = { mode: OnDeviceMode; name: string };

/** In the order the switch draws them: the lighter one first, climbing toward Cloud. */
export const ON_DEVICE_KINDS: readonly OnDeviceKind[] = [
  { mode: 'native', name: 'Lite' },
  { mode: 'ai', name: 'Enhanced' },
];

/** The kind's name, as a settings summary and a screen reader say it. */
export function onDeviceKindName(mode: OnDeviceMode): string {
  return ON_DEVICE_KINDS.find((kind) => kind.mode === mode)?.name ?? '';
}

/** Any kind's name, Cloud included, as the Settings summary says it. */
export function voiceKindName(mode: VoiceMode): string {
  return mode === 'cloud' ? 'Cloud' : onDeviceKindName(mode);
}

/** The foot of the cloud card where the server has no cloud voices to offer yet. */
export const CLOUD_VOICES_SOON = 'COMING SOON';

/** The foot of the cloud card for a reader without a plan. */
export const CLOUD_WITH_A_PLAN = 'WITH A PLAN';

/** The line the plans sheet opens with when Cloud is what sent the reader there. */
export const CLOUD_PLANS_LINE = 'Cloud voices come with every plan.';

/** Where plans cannot be sold in the app, the Cloud card says why it stays shut. */
export const CLOUD_PLANS_ELSEWHERE = 'Cloud voices come with a plan. Choose one in Settings, under Samwell.';

/** The one trust line on the cloud pane. */
export const CLOUD_PRIVACY = 'The page being read is sent to the voice maker and not kept.';

/** Under the speed control's place when the maker reads at one speed. */
export const CLOUD_SPEED_FIXED = 'This voice reads at its own pace.';

/** Trying a voice is free, and says so where a reader might wonder. */
export const CLOUD_SAMPLES_FREE = 'Samples are free. Neurons pay for the voice, never the book.';

/** The one line under the switch: what the chosen kind is. */
export function onDeviceHint(mode: OnDeviceMode): string {
  return mode === 'native' ? 'Lightweight. Works on most phones.' : 'Sounds more human.';
}

/** Shown in place of the switch on a phone that cannot run the Enhanced voices at all. */
export const ENHANCED_UNSUPPORTED = 'Enhanced voices need more memory than this phone has.';

/** Under a Lite voice where the phone gives no control of its speed. */
export const LITE_SPEED_FIXED = 'Reading speed cannot be changed with a Lite voice.';
