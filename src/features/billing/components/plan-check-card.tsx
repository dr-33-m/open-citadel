import React from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { RefreshCw } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export interface PlanCheckCardProps {
  /** The server never answered: the wait gives way to a way to ask again. */
  unreachable?: boolean;
  onRetry?: () => void;
}

/**
 * The beat before it is known whether this reader holds a plan, and what
 * that beat becomes when the server does not answer.
 *
 * Drawn wherever the answer decides between the plans on sale and what a
 * plan opens (Samwell's cloud panel, the cloud reading voices), so nobody
 * who is already paying is shown a price list while the question is out.
 */
export function PlanCheckCard({ unreachable = false, onRetry }: PlanCheckCardProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];

  if (unreachable) {
    return (
      <Card className="gap-3 p-4">
        <View className="flex-row items-center justify-between gap-3">
          <ThemedText type="bodySm" color={muted} className="flex-1">
            Samwell Cloud did not answer. Check your connection and try again.
          </ThemedText>
          {onRetry ? <ActionButton icon={RefreshCw} label="TRY AGAIN" tint={muted} onPress={onRetry} /> : null}
        </View>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-2">
        <Spinner size="sm" />
        <ThemedText type="bodySm" color={muted}>
          Checking subscription
        </ThemedText>
      </View>
    </Card>
  );
}
