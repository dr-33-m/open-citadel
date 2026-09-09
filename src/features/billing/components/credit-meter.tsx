import React from 'react';
import { View, type TextStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';
import type { CreditBalance } from 'samwell-shared';

const TABULAR_SMALL: TextStyle = { fontSize: 11, fontVariant: ['tabular-nums'] };
const SMALL: TextStyle = { fontSize: 11 };

/** Below this share of the grant, the number starts saying so. */
const LOW_SHARE = 0.1;

function renewalLabel(periodEndsAt: string | null): string | null {
  if (!periodEndsAt) return null;
  const date = new Date(periodEndsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * What is left, against what a month buys.
 *
 * Replaces the two rolling message bars this panel used to draw. Those
 * counted messages, which was the wrong unit twice over: it made a flash
 * model and Opus cost the same, and it could not be sold. Credits are one
 * number, and it is the number the server refuses turns on.
 */
export function CreditMeter({
  balance,
  loading,
  error,
  onRefresh,
}: {
  balance: CreditBalance;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [mutedForeground, primary, warning] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary',
    '--color-warning-foreground',
  ]);
  const muted = asColor(mutedForeground);

  const grant = Math.max(0, balance.grant);
  const available = Math.max(0, balance.available);
  const low = grant > 0 && available <= grant * LOW_SHARE;
  const renews = renewalLabel(balance.periodEndsAt);

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <ThemedText type="labelSm" color={muted}>
          CREDITS
        </ThemedText>
        {/* The ring stands where the word was rather than beside it, so the
            row does not change width mid-request and shove the label across. */}
        {loading ? (
          <Spinner size="sm" label="Checking your credits" />
        ) : (
          <Touchable onPress={onRefresh}>
            <ThemedText type="labelSm" color={asColor(primary)}>
              REFRESH
            </ThemedText>
          </Touchable>
        )}
      </View>

      <Progress
        value={grant > 0 ? Math.min(1, available / grant) : 0}
        minValue={0}
        maxValue={1}
        size="sm"
      />

      <ThemedText
        type="bodySm"
        color={low ? asColor(warning) : muted}
        style={TABULAR_SMALL}
      >
        {available.toLocaleString()} of {grant.toLocaleString()}
        {renews ? ` · renews ${renews}` : ''}
      </ThemedText>

      {error ? (
        <ThemedText type="bodySm" color={muted} style={SMALL}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}
