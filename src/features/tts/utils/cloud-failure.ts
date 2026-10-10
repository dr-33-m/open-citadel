/**
 * What the reader is told when a cloud voice cannot go on, and what they can
 * do about it.
 *
 * Each failure is its own drawn state with its own way out, never a silent
 * stop and never a silent switch to another voice. "Continue on-device" is in
 * every one of them: whatever went wrong with the cloud, the book can carry
 * on, at the same sentence, with the voice that was reading on the phone.
 *
 * Pure, so it can be tested on its own.
 */
import type { CloudVoiceFailure } from '@/services/cloud-tts/request';

export type FailureAction = 'continue' | 'retry' | 'plans';

export interface FailureCopy {
  title: string;
  line: string;
  /** The filled button, the way the reader most likely wants to go. */
  primary: { label: string; action: FailureAction };
  /** The plain one beside it, or none when there is no second way. */
  secondary: { label: string; action: FailureAction } | null;
}

const CONTINUE = { label: 'CONTINUE ON-DEVICE', action: 'continue' } as const;
const RETRY = { label: 'TRY AGAIN', action: 'retry' } as const;

export function cloudFailureCopy(
  failure: CloudVoiceFailure,
  options: { canSell: boolean; canUpgrade: boolean },
): FailureCopy {
  switch (failure) {
    case 'out_of_credits':
      return {
        title: 'Out of Neurons',
        line: options.canUpgrade && options.canSell
          ? 'There are not enough Neurons left for the next part. Carry on with a voice on this phone, or move to a bigger plan.'
          : 'There are not enough Neurons left for the next part. Carry on with a voice on this phone until your plan renews.',
        primary: CONTINUE,
        secondary: options.canUpgrade && options.canSell ? { label: 'UPGRADE', action: 'plans' } : null,
      };
    case 'offline':
      return {
        title: 'Cloud voices need a connection.',
        line: 'Carry on with a voice on this phone, or try again once you are back online.',
        primary: CONTINUE,
        secondary: RETRY,
      };
    case 'plan_lapsed':
      return {
        title: 'Your plan has ended',
        line: 'Cloud voices come with every plan. The book can carry on with your voice on this phone.',
        primary: CONTINUE,
        secondary: options.canSell ? { label: 'SEE PLANS', action: 'plans' } : null,
      };
    case 'maker_failed':
      return {
        title: 'That voice is not answering.',
        line: 'It may be busy for a moment. Try again, or carry on with a voice on this phone.',
        primary: RETRY,
        secondary: CONTINUE,
      };
  }
}
