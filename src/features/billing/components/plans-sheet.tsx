import React from 'react';
import { View } from 'react-native';

import { Lock } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet, useSheetSettled } from '@/components/ui/sheet';
import { layout } from '@/constants/theme';
import { PlanCarousel } from '@/features/billing/components/plan-carousel';
import { usePlanSale } from '@/features/billing/hooks/use-plan-sale';
import type { PlanSpend } from '@/features/billing/utils/plan-spend';
import { useCloudIdentity } from '@/hooks/use-cloud-identity';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useSubscriptionStore } from '@/stores/subscription';
import type { CreditPlan, PlanId } from 'samwell-shared';

export interface PlansSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Why the plans are on screen: the one line under the title. */
  line: string;
  /** A plan is active: the sheet has closed itself, and the wall behind it can go. */
  onActivated?: () => void;
  /** A subset to offer, when only some plans open what was asked for. All of them by default. */
  plans?: CreditPlan[];
  /** The card the run rests on when it opens. */
  initialPlanId?: PlanId;
  /** The side a card's info sheet opens on: the voices, where a voice is what the wall was. */
  infoOpensOn?: PlanSpend;
  /**
   * Opened from inside another sheet (the reader's voice sheet). It then
   * rises over that sheet instead of replacing it, which would unmount this.
   */
  nested?: boolean;
}

/**
 * The plans, sold where the wall is.
 *
 * Wherever a missing plan stops somebody (Compass, a chat in the cloud), this
 * rises over that screen, takes the payment, and goes away, leaving them
 * where they were with the wall gone. Settings keeps its own copy of the
 * plans for managing a subscription; this is for getting one without leaving.
 */
export function PlansSheet({ visible, onClose, nested = false, ...body }: PlansSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      snapRatios={[0.78]}
      scrollable
      contentPanning={false}
      stackBehavior={nested ? 'push' : undefined}
    >
      <PlansSheetBody onClose={onClose} {...body} />
    </Sheet>
  );
}

export type PlansSheetHandle = { open: () => void };

/**
 * `PlansSheet` holding its own open state, opened through a ref.
 *
 * For a screen too large to redraw for a sheet: with the state inside here,
 * opening the plans redraws this and nothing around it. Samwell's page is
 * hundreds of lines, and redrawing it in the frame the sheet starts to rise
 * is what makes a rise stutter on a slower phone.
 */
export function PlansSheetHost({
  ref,
  ...sheet
}: Omit<PlansSheetProps, 'visible' | 'onClose'> & { ref: React.Ref<PlansSheetHandle> }) {
  const [visible, setVisible] = React.useState(false);
  const close = React.useCallback(() => setVisible(false), []);
  React.useImperativeHandle(ref, () => ({ open: () => setVisible(true) }), []);
  return <PlansSheet visible={visible} onClose={close} {...sheet} />;
}

/** Inside the sheet, so it mounts with it and can tell when the rise is over. */
function PlansSheetBody({ onClose, line, onActivated, plans, initialPlanId, infoOpensOn }: Omit<PlansSheetProps, 'visible' | 'nested'>) {
  const tokens = useThemeTokens();
  const identity = useCloudIdentity();
  const settled = useSheetSettled();

  // Once only. A plan can arrive two ways: the purchase reports it, or a
  // payment that confirmed a moment late lands in the store afterwards with
  // the sheet still open. Either closes the sheet; both must not.
  const finished = React.useRef(false);
  const activated = React.useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onClose();
    onActivated?.();
  }, [onActivated, onClose]);

  // The late arrival. Only a change to active while the sheet is open counts:
  // a reader who opened it already holding a plan is here to change plans.
  const status = useSubscriptionStore((s) => s.status);
  const openedActive = React.useRef(status === 'active');
  React.useEffect(() => {
    if (status === 'active' && !openedActive.current) activated();
  }, [status, activated]);
  const { picker } = usePlanSale({ enabled: identity.kind !== 'unknown', onActivated: activated });

  return (
    <PageFade edges="both" surface="popover">
      <Sheet.ScrollView contentContainerClassName="gap-5 pb-6 pt-2">
        <View className="gap-1 px-6">
          <ThemedText type="headlineSm">Choose a plan</ThemedText>
          <ThemedText type="bodySm" color={tokens['--color-muted-foreground']}>
            {line}
          </ThemedText>
        </View>

        <View className="px-6">
          {/* The run is the expensive part. Held behind its own skeleton
              until the sheet has landed, so its mount does not stall the rise. */}
          <PlanCarousel
            {...picker}
            ready={picker.ready && settled}
            plans={plans}
            initialPlanId={initialPlanId}
            infoOpensOn={infoOpensOn}
            surface="popover"
            bleed={layout.gutter}
          />
        </View>

        <View className="flex-row items-center gap-2 px-6">
          <Lock size={16} color={tokens['--color-muted-foreground']} />
          <ThemedText type="bodySm" color={tokens['--color-muted-foreground']} className="shrink">
            No account needed. Cancel any time in Settings.
          </ThemedText>
        </View>
      </Sheet.ScrollView>
    </PageFade>
  );
}
