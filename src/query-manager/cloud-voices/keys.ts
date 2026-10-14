import { billingKeys } from '@/query-manager/billing/keys';

/**
 * The cloud reading voices.
 *
 * Their figures arrive on `/billing/plans`, the same public answer the plan
 * cards read, so they share its key and its one request: two keys for one
 * route would be two copies of the same answer that could drift apart, and
 * two round trips on every cold open of the voice pane.
 */
export const cloudVoiceKeys = {
  figures: billingKeys.planPreview,
};
