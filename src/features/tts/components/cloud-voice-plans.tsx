import React from 'react';
import type { PlanId } from 'samwell-shared';

import { layout } from '@/constants/theme';
import { PlanPicker } from '@/features/billing/components/plan-picker';
import { usePlanSale } from '@/features/billing/hooks/use-plan-sale';
import { CLOUD_PLANS_LINE } from '@/features/tts/utils/voice-copy';
import { useCloudIdentity } from '@/hooks/use-cloud-identity';

export interface CloudVoicePlansProps {
  /** The ground the run's edge fades blend into: the reader's voice sheet is `popover`. */
  surface: 'background' | 'popover';
  /** Built ahead of the press that shows it (Settings), so the run needs no placeholder. */
  prebuilt: boolean;
  /** Hear a plan's voices before buying it. */
  onSample: (plan: PlanId) => void;
}

/**
 * The plans, where the cloud voices would be: what a reader without a plan
 * finds under the Cloud card, as under Samwell's own.
 *
 * A container, nothing drawn of its own: the selling is `usePlanSale` and the
 * run is `PlanPicker`. Beside CHOOSE it offers HEAR SAMPLES, which this is
 * the one place to offer: the plans are here for their voices, and the
 * voices can be heard for nothing. A plan bought here needs no telling anybody: the
 * subscription store turns active and `useVoiceSource` swaps this for the
 * voices.
 */
export function CloudVoicePlans({ surface, prebuilt, onSample }: CloudVoicePlansProps) {
  const identity = useCloudIdentity();
  const { picker } = usePlanSale({ enabled: identity.kind !== 'unknown' });

  return <PlanPicker subtitle={CLOUD_PLANS_LINE} {...picker} infoOpensOn="voices" onSample={onSample} prebuilt={prebuilt} surface={surface} bleed={layout.gutter} />;
}
