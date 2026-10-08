import { voiceKindName } from '@/features/tts/utils/voice-copy';
import type { VoiceMode } from '@/services/device-tts/catalogue';

/*
 * The one line under each row of the Settings root. Each says what is set
 * rather than what the setting is: the row's title already names it, and the
 * state is what someone opening Settings came to check.
 */

const DOT = ' · ';

export type ProfileFacts = {
  /** False in a build with no accounts at all. */
  accountsEnabled: boolean;
  signedIn: boolean;
  email: string | null;
  /** The plan held on this phone without an account, if there is one. */
  guestPlan: string | null;
};

export function profileSummary({ accountsEnabled, signedIn, email, guestPlan }: ProfileFacts): string {
  if (!accountsEnabled) return 'What Samwell calls you';
  if (signedIn) return email ?? 'Signed in';
  return guestPlan ? `${guestPlan} on this phone${DOT}Not signed in` : 'Not signed in';
}

export type SamwellFacts = {
  mode: 'offline' | 'cloud';
  /** The chosen on-device brain's name. */
  brain: string | null;
  /** The chosen cloud brain's name. */
  cloudBrain: string | null;
  plan: string | null;
};

export function samwellSummary({ mode, brain, cloudBrain, plan }: SamwellFacts): string {
  if (mode === 'cloud') return `Cloud${DOT}${cloudBrain ?? plan ?? 'No plan yet'}`;
  return `On-device${DOT}${brain ?? 'No brain chosen'}`;
}

export type VoiceFacts = {
  mode: VoiceMode;
  /** The voice's name, when it has one worth showing. */
  name: string | null;
};

export function voiceSummary({ mode, name }: VoiceFacts): string {
  const kind = voiceKindName(mode);
  return name ? `${kind}${DOT}${name}` : `${kind} voice`;
}

export function podcastSummary({ skipBackSec, skipForwardSec }: { skipBackSec: number; skipForwardSec: number }): string {
  return `Back ${skipBackSec} sec${DOT}Forward ${skipForwardSec} sec`;
}
