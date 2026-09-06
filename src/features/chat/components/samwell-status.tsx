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
import { GoldButton } from '@/components/ui/gold-button';
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

/**
 * The way out of a status, with the first one carrying the weight.
 *
 * The primary is `GoldButton`, not a gold rectangle rolled by hand here. It
 * used to be `bg-primary` with a 1px border and `labelSm` in a `px-4 py-2`
 * box, which is a different gold from every other primary in the app:
 * `GoldButton` is a gradient from `--color-primary` into `--color-primary-deep`.
 * The two sat one tap apart on the same journey — SIGN IN here, SIGN IN on the
 * account card in Settings — as a flat gold and a graded one, which is the
 * kind of difference nobody names and everybody feels.
 *
 * `small` rather than `compact`, and it settles an old mismatch: the quieter
 * actions beside it are `px-4 py-2` around `labelSm`, which is 34pt once the
 * border is counted, and `small` is that same 34. Every button in this row is
 * now one height whatever it is made of.
 */
function StatusActions({ actions }: { actions?: SamwellStatusAction[] }) {
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  if (!actions || actions.length === 0) return null;

  return (
    <View className="mt-1 flex-row flex-wrap items-center justify-center gap-2">
      {actions.map((action, i) =>
        i === 0 ? (
          <GoldButton
            key={action.label}
            label={action.label}
            icon={action.icon}
            size="small"
            onPress={action.onPress}
          />
        ) : (
          <Touchable
            key={action.label}
            onPress={action.onPress}
            accessibilityRole="button"
            className="border border-border px-4 py-2"
          >
            {/* The same 14pt mark `ActionButton` and the gold button use, so a
                row can mix all three and still look like one row. */}
            <View className="flex-row items-center gap-2">
              {action.icon ? <action.icon size={14} color={asColor(mutedForeground)} /> : null}
              <ThemedText type="labelSm">{action.label}</ThemedText>
            </View>
          </Touchable>
        ),
      )}
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
