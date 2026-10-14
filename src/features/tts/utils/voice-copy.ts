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

/** The line over the plans, where Cloud without a plan is what brought them up. */
export const CLOUD_PLANS_LINE = 'Cloud voices come with every plan.';

/** Where plans cannot be sold in the app, the Cloud card says why it stays shut. */
export const CLOUD_PLANS_ELSEWHERE = 'Cloud voices come with a plan. Choose one in Settings, under Samwell.';

/**
 * What the "i" on the Cloud card opens: where the page goes, what is paid
 * for, and what a connection is needed for. Said once, there, not as lines
 * between the controls.
 *
 * The first point does not name who the page goes to: a voice box is not
 * always its own host (Kokoro is a model, read by whoever serves it), and a
 * name that is wrong for one box is worse than none.
 */
export const CLOUD_INFO = {
  label: 'CLOUD',
  title: 'Studio voices, read from the cloud.',
  points: [
    'The page being read is sent to the cloud to be spoken, and is not kept.',
    'Neurons pay for the voice, never the book. Samples are free to play.',
    'What you have already heard is kept on this phone, so going back costs nothing.',
    'Needs a connection. On-device voices work without one, and stay free.',
  ],
};

/** In a version's sheet, for a voice box that reads at one speed. */
export const CLOUD_SPEED_FIXED = 'This voice reads at its own pace, so there is no speed to set.';

/** The one line under the switch: what the chosen kind is. */
export function onDeviceHint(mode: OnDeviceMode): string {
  return mode === 'native' ? 'Lightweight. Works on most phones.' : 'Sounds more human.';
}

/** Shown in place of the switch on a phone that cannot run the Enhanced voices at all. */
export const ENHANCED_UNSUPPORTED = 'Enhanced voices are not supported on this phone.';

/** Under a Lite voice where the phone gives no control of its speed. */
export const LITE_SPEED_FIXED = 'Reading speed cannot be changed with a Lite voice.';
