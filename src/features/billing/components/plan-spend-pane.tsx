import React from 'react';
import { View, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Select } from '@/components/ui/select';
import type { PlanSpendSide } from '@/features/billing/utils/plan-spend';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export interface PlanSpendPaneProps {
  side: PlanSpendSide;
  /** Whose estimate the side's tile is quoting. Null when nothing can be estimated. */
  value: string | null;
  onBrowse: (value: string) => void;
}

/**
 * One side of a plan's Neurons, under its tile: the control that browses the
 * tile's estimate (by brain, or by voice), then what the plan includes on
 * this side as a quiet inventory.
 *
 * The same pane draws the brains and the voices (`plan-spend.ts` gives both
 * one shape), so the two read as two answers to one question.
 */
export function PlanSpendPane({ side, value, onBrowse }: PlanSpendPaneProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  const options = side.groups.flatMap((group) => group.options);
  const chosen = options.find((option) => option.value === value) ?? null;

  return (
    <View className="gap-6">
      {chosen ? (
        <View className="gap-2">
          <ThemedText type="labelSm" color={muted}>
            ESTIMATE FOR
          </ThemedText>
          <Select
            value={chosen.value}
            valueLabel={chosen.label}
            onValueChange={onBrowse}
            presentation="overlay"
            contentWidth="trigger"
            triggerClassName="min-h-0 border-border bg-background px-3 py-2"
            valueClassName="text-sm font-normal"
            listClassName="p-1"
            className="w-full"
          >
            {side.groups.map((group) => {
              const items = group.options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  className="px-3 py-2.5"
                  labelClassName="text-sm font-normal"
                />
              ));
              return group.label ? (
                <Select.Group key={group.label} label={group.label}>
                  {items}
                </Select.Group>
              ) : (
                items
              );
            })}
          </Select>
          <ThemedText type="bodySm" color={muted}>
            {side.line}
          </ThemedText>
        </View>
      ) : null}

      <View>
        <View className="flex-row items-baseline justify-between gap-3 pb-1">
          <ThemedText type="headlineSm">{side.listTitle}</ThemedText>
          <ThemedText type="bodySm" color={muted} style={TABULAR}>
            {side.total}
          </ThemedText>
        </View>
        {side.rows.map((row) => (
          <View key={row.key} className="flex-row items-baseline gap-2 border-b border-surface-tertiary py-3">
            {row.kicker ? (
              <ThemedText type="labelSm" color={muted} numberOfLines={1}>
                {row.kicker}
              </ThemedText>
            ) : null}
            <ThemedText type="bodyMd" className="flex-1" numberOfLines={1}>
              {row.name}
            </ThemedText>
          </View>
        ))}
        {side.more ? (
          <ThemedText type="bodySm" color={muted} className="pt-3">
            {side.more}
          </ThemedText>
        ) : null}
      </View>

      {side.note ? (
        <ThemedText type="bodySm" color={muted}>
          {side.note}
        </ThemedText>
      ) : null}
    </View>
  );
}
