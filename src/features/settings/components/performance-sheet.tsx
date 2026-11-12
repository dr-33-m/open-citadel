import React from 'react';
import { View } from 'react-native';

import { InfoSheet } from '@/components/info-sheet';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import {
  PERFORMANCE_ACCEPT,
  PERFORMANCE_DECLINE,
  PERFORMANCE_INFO,
  PERFORMANCE_TURN_OFF,
} from '@/features/settings/utils/performance-sharing';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type PerformanceSheetProps = {
  visible: boolean;
  sharing: boolean;
  /** Turns sharing on: the one way it is ever turned on. */
  onAccept: () => void;
  onTurnOff: () => void;
  onClose: () => void;
};

/**
 * What sharing app performance sends, and the choice made after reading it.
 *
 * The disclosure comes right before the consent (Google Play's User Data
 * policy) and the consent is a tap on its own button (App Review 5.1.1): the
 * switch on the row only opens this. Off, it offers the two answers, the
 * recommended one gold as the screen's one commit, the other plain beside it
 * and never shamed. On, it explains and offers the way back.
 */
export function PerformanceSheet({ visible, sharing, onAccept, onTurnOff, onClose }: PerformanceSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const quiet = sharing ? PERFORMANCE_TURN_OFF : PERFORMANCE_DECLINE;
  const onQuiet = sharing ? onTurnOff : onClose;

  const footer = (
    <View className="gap-3">
      {sharing ? null : <GoldButton label={PERFORMANCE_ACCEPT} onPress={onAccept} />}
      <Touchable onPress={onQuiet} className="items-center py-3" accessibilityRole="button">
        <ThemedText type="labelSm" color={muted}>
          {quiet}
        </ThemedText>
      </Touchable>
    </View>
  );

  return <InfoSheet visible={visible} onClose={onClose} info={PERFORMANCE_INFO} footer={footer} />;
}
