/**
 * What the listener is told when the voice stops making the book, in the
 * reader's own words for each failure (`cloudFailureCopy`), and what the way
 * out is: try again, the plans in place, or nothing at all while offline,
 * since the book carries on by itself when the network is back.
 *
 * Pure, so it can be tested on its own.
 */
import { cloudFailureCopy } from '@/features/tts/utils/cloud-failure';
import type { CloudVoiceFailure } from '@/services/cloud-tts/request';

export type FailureWayOut = 'retry' | 'plans' | 'wait';

export function failureToast(failure: CloudVoiceFailure, canSell: boolean): { message: string; wayOut: FailureWayOut } {
  const { title } = cloudFailureCopy(failure, { canSell, canUpgrade: true });
  if (failure === 'offline') return { message: title, wayOut: 'wait' };
  if (failure === 'maker_failed') return { message: title, wayOut: 'retry' };
  return { message: title, wayOut: canSell ? 'plans' : 'retry' };
}
