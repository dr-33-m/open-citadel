import React from 'react';
import { CREDIT_PLANS, type PlanId } from 'samwell-shared';

import { usePlanSale } from '@/features/billing/hooks/use-plan-sale';
import { PLAN_ICON } from '@/features/billing/utils/plan-icon';
import { formatStorePrice } from '@/features/billing/utils/price';
import { CloudSampleFooter } from '@/features/tts/components/cloud-sample-footer';
import { useCloudIdentity } from '@/hooks/use-cloud-identity';
import { haptics } from '@/utils/haptics';

export interface CloudSampleActionsProps {
  /** The plan whose voices are being heard. */
  plan: PlanId;
  onBack: () => void;
}

/**
 * Buying the plan being sampled, from under its voices.
 *
 * A container, nothing drawn of its own: the selling is `usePlanSale`, the
 * same checkout the carousel goes through, and the row is
 * `CloudSampleFooter`. A plan bought here needs no telling anybody: the
 * subscription store turns active, and `useVoiceSource` lands the reader on
 * the voice they were sampling and puts this away.
 */
export function CloudSampleActions({ plan, onBack }: CloudSampleActionsProps) {
  const identity = useCloudIdentity();
  const { picker } = usePlanSale({ enabled: identity.kind !== 'unknown' });
  const packageToBuy = picker.packages[plan];
  const priceString = packageToBuy?.product.priceString;

  const choose = () => {
    if (!packageToBuy) return;
    haptics.commit();
    picker.onChoose(plan, packageToBuy);
  };

  return (
    <CloudSampleFooter
      planLabel={CREDIT_PLANS[plan].label}
      planIcon={PLAN_ICON[plan]}
      price={priceString ? formatStorePrice(priceString) : null}
      buying={picker.busy === plan}
      disabled={!packageToBuy || picker.busy !== null}
      onChoose={choose}
      onBack={onBack}
    />
  );
}
