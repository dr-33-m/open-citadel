/**
 * Two ways of showing the same `SamwellStatus`, picked by whether there is a
 * conversation underneath it.
 *
 * With an empty transcript the status *is* the screen, so it takes the middle
 * and says what to do. With messages already on screen it becomes a banner
 * above them — the transcript is what the reader came for, and covering it to
 * report that the model is asleep would hide the thing being explained.
 */
import { MessageSquare } from '@/components/icons';
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { SamwellText, useSamwellSpans } from '@/components/samwell-text';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import type { SamwellStatus, SamwellStatusAction } from '@/features/chat/hooks/use-samwell-status';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';

/*
 * Chat with nothing wrong and nothing said yet — `status` is null, so this is
 * the only place that copy can live. Every real status brings its own title
 * and message, and a status without a title has decided it does not want one
 * (see `SamwellStatus.title`), so these two are never a fallback for one.
 */
const IDLE_TITLE = 'Ask Samwell about your books';
const IDLE_MESSAGE = 'Analyse and learn with Samwell';

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
  /** The surface's own icon — a compass on Compass, a bubble on chat. */
  icon: Icon = MessageSquare,
}: {
  status: SamwellStatus | null;
  style?: ViewStyle;
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}) {
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);

  const title = status ? status.title : IDLE_TITLE;
  const message = status ? status.message : IDLE_MESSAGE;
  const messageSpans = useSamwellSpans(message ?? '');

  return (
    <EmptyState size="sm" style={style}>
      <EmptyState.Header>
        <EmptyState.Media>
          {status?.isLoading ? (
            <Spinner size="md" />
          ) : (
            // Full strength. At 0.3 on `muted-foreground` this was so close to
            // the page that it read as a smudge rather than as an icon, which
            // is worse than no icon at all.
            <Icon
              size={40}
              color={status?.isError ? asColor(destructive) : asColor(mutedForeground)}
              strokeWidth={2}
            />
          )}
        </EmptyState.Media>
        {title ? (
          // `SamwellText`: his name carries the gold here as it does
          // everywhere else. An error title is destructive-coloured end to
          // end, because there the whole line is the warning.
          status?.isError ? (
            <ThemedText type="headlineSm" className="text-center text-destructive">
              {title}
            </ThemedText>
          ) : (
            <SamwellText type="headlineSm" className="text-center">
              {title}
            </SamwellText>
          )
        ) : null}
        {/* `useSamwellSpans` rather than `SamwellText`: this is PanelUI's own
            description text, and wrapping it would throw away its size and
            colour. The spans nest inside it and only set the name's colour. */}
        <EmptyState.Description className={cn(status?.isError && 'text-destructive')}>
          {status?.isError ? message : messageSpans}
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
