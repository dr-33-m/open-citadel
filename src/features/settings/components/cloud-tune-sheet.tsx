import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import {
  CLOUD_MAX_COMPLETION_TOKENS,
  CLOUD_REASONING_EFFORTS,
  useSettingsStore,
  type CloudReasoningEffort,
} from '@/stores/settings';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';

const EFFORT_LABEL: Record<CloudReasoningEffort, string> = {
  off: 'OFF',
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
};

const EFFORT_NOTE: Record<CloudReasoningEffort, string> = {
  off: 'No reasoning. Fastest replies.',
  low: 'A brief pause before answering.',
  medium: 'Each model keeps its own default depth.',
  high: 'Longest thinking. Slowest and most expensive.',
};

const TOKEN_LABEL: Record<number, string> = {
  600: 'CONCISE',
  1200: 'STANDARD',
  2400: 'DETAILED',
};

/**
 * The cloud engine's tuning: how hard the model thinks and how long its
 * replies may run. The same idea as the offline tune sheet, with the knobs
 * that actually matter across a wire — a remote model has no backend or
 * context size to choose, but reasoning effort is real money and real waiting.
 * Applies to the next turn; nothing to restart.
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
  const cloudReasoningEffort = useSettingsStore((s) => s.cloudReasoningEffort);
  const setCloudReasoningEffort = useSettingsStore((s) => s.setCloudReasoningEffort);
  const cloudMaxCompletionTokens = useSettingsStore((s) => s.cloudMaxCompletionTokens);
  const setCloudMaxCompletionTokens = useSettingsStore((s) => s.setCloudMaxCompletionTokens);

  return (
    // `maxHeightRatio` is the cap and the only cap — the sheet measures this
    // content and stops there, so the scroll region needs no `maxHeight` of
    // its own.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} scrollable>
      <Sheet.ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing[6], gap: spacing[6] }}
      >
        <View className="gap-1">
          <ThemedText type="bodySm">Reasoning</ThemedText>
          <View className="flex-row flex-wrap gap-2">
            {CLOUD_REASONING_EFFORTS.map((effort) => {
              const active = cloudReasoningEffort === effort;
              return (
                <Touchable
                  key={effort}
                  onPress={() => void setCloudReasoningEffort(effort)}
                >
                  <Card className={cn('px-4 py-2', active && 'border-primary bg-primary')}>
                    <ThemedText
                      type="labelSm"
                      color={active ? asColor(primaryForeground) : undefined}
                    >
                      {EFFORT_LABEL[effort]}
                    </ThemedText>
                  </Card>
                </Touchable>
              );
            })}
          </View>
          <ThemedText type="bodySm" color={asColor(mutedForeground)} style={{ fontSize: 11 }}>
            {EFFORT_NOTE[cloudReasoningEffort]}
          </ThemedText>
        </View>

        <View className="gap-1">
          <ThemedText type="bodySm">Response Length</ThemedText>
          <View className="flex-row flex-wrap gap-2">
            {CLOUD_MAX_COMPLETION_TOKENS.map((tokens) => {
              const active = cloudMaxCompletionTokens === tokens;
              return (
                <Touchable
                  key={tokens}
                  onPress={() => void setCloudMaxCompletionTokens(tokens)}
                >
                  <Card className={cn('px-4 py-2', active && 'border-primary bg-primary')}>
                    <ThemedText
                      type="labelSm"
                      color={active ? asColor(primaryForeground) : undefined}
                    >
                      {TOKEN_LABEL[tokens]}
                    </ThemedText>
                  </Card>
                </Touchable>
              );
            })}
          </View>
          <ThemedText type="bodySm" color={asColor(mutedForeground)} style={{ fontSize: 11 }}>
            Caps how much a reply can spend. Samwell still stops when he is done.
          </ThemedText>
        </View>
      </Sheet.ScrollView>
    </Sheet>
  );
}
