import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import {
  CLOUD_THINKING_BUDGETS,
  useSettingsStore,
  type CloudThinkingBudget,
} from '@/stores/settings';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';

const BUDGET_LABEL: Record<CloudThinkingBudget, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
};

/**
 * Plain-language, no token counts. Each line is what the reader actually gets:
 * how long Samwell pauses, and roughly what it costs them in wait and money.
 */
const BUDGET_NOTE: Record<CloudThinkingBudget, string> = {
  low: 'A short pause, then he answers. Quickest and cheapest. Best for quick questions.',
  medium: 'He thinks things through before replying. A good balance for most conversations.',
  high: 'He works a problem all the way down before answering. Slowest and most expensive, for the hardest planning.',
};

/**
 * The cloud engine's one tuning knob: how much room Samwell gets to think.
 *
 * It used to be two — a reasoning effort and a separate reply-length cap — and
 * a deep think under a low cap left nothing for the answer ("Samwell got stuck
 * mid-response"). One setting now, and the server couples the thinking depth
 * to a reply budget sized to hold both. Applies to the next turn; nothing to
 * restart.
 */
export function CloudTuneSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const [primaryForeground] = useCSSVariable(['--color-primary-foreground']);
  const cloudThinkingBudget = useSettingsStore((s) => s.cloudThinkingBudget);
  const setCloudThinkingBudget = useSettingsStore((s) => s.setCloudThinkingBudget);

  return (
    // `maxHeightRatio` is the cap and the only cap — the sheet measures this
    // content and stops there, so the scroll region needs no `maxHeight` of
    // its own.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} scrollable>
      <Sheet.ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing[6], gap: spacing[6] }}
      >
        <View className="gap-1">
          <ThemedText type="bodySm">Thinking budget</ThemedText>
          <View className="flex-row flex-wrap gap-2">
            {CLOUD_THINKING_BUDGETS.map((budget) => {
              const active = cloudThinkingBudget === budget;
              return (
                <Touchable
                  key={budget}
                  onPress={() => void setCloudThinkingBudget(budget)}
                >
                  <Card className={cn('px-4 py-2', active && 'border-primary bg-primary')}>
                    <ThemedText
                      type="labelSm"
                      color={active ? asColor(primaryForeground) : undefined}
                    >
                      {BUDGET_LABEL[budget]}
                    </ThemedText>
                  </Card>
                </Touchable>
              );
            })}
          </View>
          <ThemedText type="bodySm" color={asColor(mutedForeground)} style={{ fontSize: 11 }}>
            {BUDGET_NOTE[cloudThinkingBudget]}
          </ThemedText>
        </View>
      </Sheet.ScrollView>
    </Sheet>
  );
}
