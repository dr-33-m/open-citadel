/**
 * Two ways of showing the same `SamwellStatus`, picked by whether there is a
 * conversation underneath it.
 *
 * With an empty transcript the status *is* the screen, so it takes the middle
 * and says what to do. With messages already on screen it becomes a banner
 * above them — the transcript is what the reader came for, and covering it to
 * report that the model is asleep would hide the thing being explained.
 */
import { MessageSquare } from 'lucide-react-native';
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import type { SamwellStatus, SamwellStatusAction } from '@/features/chat/hooks/use-samwell-status';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';

/** First action reads as the recommended one; the rest are quieter alternates. */
function StatusActions({ actions }: { actions?: SamwellStatusAction[] }) {
  const primaryForeground = useCSSVariable('--color-primary-foreground');
  if (!actions || actions.length === 0) return null;

  return (
    <View className="mt-1 flex-row flex-wrap justify-center gap-2">
      {actions.map((action, i) => (
        <Touchable
          key={action.label}
          onPress={action.onPress}
          accessibilityRole="button"
          className={cn('border px-4 py-2', i === 0 ? 'border-primary bg-primary' : 'border-border')}
        >
          <ThemedText type="labelSm" color={i === 0 ? asColor(primaryForeground) : undefined}>
            {action.label}
          </ThemedText>
        </Touchable>
      ))}
    </View>
  );
}

/** The whole screen, when there is no transcript to protect. */
export function SamwellStatusEmptyState({
  status,
  style,
}: {
  status: SamwellStatus | null;
  style?: ViewStyle;
}) {
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);

  return (
    <EmptyState size="sm" style={style}>
      <EmptyState.Header>
        <EmptyState.Media>
          {status?.isLoading ? (
            <Spinner size="md" />
          ) : (
            <MessageSquare
              size={40}
              color={status?.isError ? asColor(destructive) : asColor(mutedForeground)}
              // Dimmed when it is only decoration; full strength when it is
              // carrying an error the reader has to notice.
              style={{ opacity: status?.isError ? 1 : 0.3 }}
            />
          )}
        </EmptyState.Media>
        <EmptyState.Description className={cn(status?.isError && 'text-destructive')}>
          {status?.message ?? 'Ask Samwell about your books'}
        </EmptyState.Description>
      </EmptyState.Header>
      {status?.actions ? (
        <EmptyState.Content>
          <StatusActions actions={status.actions} />
        </EmptyState.Content>
      ) : null}
    </EmptyState>
  );
}

/** A strip above an existing transcript. */
export function SamwellStatusBanner({
  status,
  style,
}: {
  status: SamwellStatus;
  style?: ViewStyle;
}) {
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);

  return (
    <View style={style}>
      <View className="m-3 gap-2 border border-surface-tertiary bg-muted p-3">
        <View className="flex-row items-center gap-2">
          {status.isLoading && <Spinner size="sm" />}
          <ThemedText
            type="bodySm"
            color={status.isError ? asColor(destructive) : asColor(mutedForeground)}
            className="flex-1"
          >
            {status.message}
          </ThemedText>
        </View>
        <StatusActions actions={status.actions} />
      </View>
    </View>
  );
}
