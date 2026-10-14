import React from 'react';
import { View, type TextStyle } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { ActionButton } from '@/components/action-button';
import { ChevronLeft, type LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { easing, motion } from '@/constants/theme';
import { SubscriptionLegalLinks } from '@/features/billing/components/subscription-legal-links';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export interface CloudSampleFooterProps {
  /** The plan whose voices are being heard: "Grand Maester Samwell". */
  planLabel: string;
  /** The plan's own mark, as on its card and its CHOOSE button there. */
  planIcon: LucideIcon;
  /** The store's price for it, or null until the store has answered. */
  price: string | null;
  /** The purchase of this plan is under way. */
  buying: boolean;
  /** Nothing can be pressed: no price to buy at yet, or another purchase is running. */
  disabled: boolean;
  onChoose: () => void;
  onBack: () => void;
}

/**
 * What ends a sampling: the plan being heard and its price, one line on what
 * is and is not being paid for, and the two ways on, equal and side by side.
 * CHOOSE buys the plan; OTHER PLANS goes back to compare, since a reader who
 * has heard these and wants different ones must not be stuck with them.
 *
 * The price is here because the card that quoted it is no longer on screen,
 * and nobody should commit to a figure they cannot see.
 *
 * When the plan is bought the voices above simply stay, and this fades out
 * from under them.
 */
export function CloudSampleFooter({ planLabel, planIcon, price, buying, disabled, onChoose, onBack }: CloudSampleFooterProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];

  return (
    <Animated.View exiting={FadeOut.duration(motion.base).easing(easing)} className="gap-3 border-t border-border pt-4">
      <View className="gap-1">
        <View className="flex-row items-baseline justify-between gap-3">
          <ThemedText type="bodyMd" className="shrink" numberOfLines={1}>
            {planLabel}
          </ThemedText>
          {price ? (
            <View className="flex-row items-baseline gap-1.5">
              <ThemedText type="headlineSm" style={TABULAR}>
                {price}
              </ThemedText>
              <ThemedText type="bodySm" color={muted}>
                a month
              </ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText type="bodySm" color={muted}>
          Samples are free. Choose the plan to have your books read in these voices.
        </ThemedText>
      </View>
      <View className="flex-row gap-3">
        <ActionButton
          icon={ChevronLeft}
          label="OTHER PLANS"
          tint={tokens['--color-primary']}
          centered
          className="h-10 flex-1"
          disabled={buying}
          onPress={onBack}
        />
        <View className="flex-1">
          <GoldButton
            label="CHOOSE"
            icon={planIcon}
            accessibilityLabel={`CHOOSE ${planLabel}`}
            size="compact"
            loading={buying}
            disabled={disabled}
            onPress={onChoose}
          />
        </View>
      </View>
      {/* A purchase starts here, so the terms are here (App Review, 3.1.2). */}
      <SubscriptionLegalLinks />
    </Animated.View>
  );
}
