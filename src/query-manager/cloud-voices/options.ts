import type { VoiceFigures } from 'samwell-shared';

import { createPlanPreviewQueryOptions } from '@/query-manager/billing/options';
import type { PlanPreview } from '@/services/billing-plans';

/**
 * The cloud voices and their figures (Neurons a chapter, hours on each
 * plan), selected out of the plan preview. The fetch, the freshness and the
 * retry are the plan cards' own; `select` only narrows what a subscriber
 * re-renders on, so the voice pane does not wake when a chat model's price
 * moves. Null from a server older than cloud voices.
 */
export function createCloudVoicesQueryOptions() {
  return {
    ...createPlanPreviewQueryOptions(),
    select: (preview: PlanPreview): VoiceFigures | null => preview.voices,
  };
}
