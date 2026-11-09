import type { CloudBlocker } from '@/features/chat/utils/cloud-access';

/**
 * What the Compass row in the toolbox says when Compass cannot run.
 *
 * Compass is cloud only. Before the merge its tab drew a whole wall for each
 * of these; now the conversation carries on and the drawer says, in a word or
 * two, why goals are out of reach, with About Compass one tap away. Null for
 * the two "still looking" states: naming a problem before knowing there is
 * one is how a paying reader gets a paywall flashed at them on a cold open.
 */
const DETAIL: Record<CloudBlocker, string | null> = {
  offlineMode: 'Needs Samwell Cloud',
  notConfigured: 'Not in this build',
  needsAccount: 'Needs your account',
  needsPlan: 'Needs a plan',
  noConnection: 'You are offline',
  cloudUnreachable: 'Cloud not answering',
  checkingAccount: null,
  checkingPlan: null,
};

export function compassBlockedDetail(blocker: CloudBlocker): string | null {
  return DETAIL[blocker];
}
