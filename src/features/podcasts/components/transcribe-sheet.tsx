import React from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { FitSheet } from '@/components/fit-sheet';
import { Info, Square } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Progress } from '@/components/ui/progress';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type TranscribeSheetProps = {
  visible: boolean;
  onClose: () => void;
  line: string;
  /** "413 Neurons", or "313 Neurons short". */
  figure: string;
  /** "1 hr 30 min. You have 7,423." */
  figureLine: string;
  /** Too few Neurons: the action sells a plan instead. */
  short: boolean;
  /** 0 to 1 while a job runs; null before one starts. */
  running: number | null;
  busy: boolean;
  onAction: () => void;
  onStop: () => void;
  onInfo: () => void;
};

/**
 * Before a cloud transcript: a title and one line, the cost as a figure over
 * the balance, and the action at the bottom. While the job runs, the same
 * sheet shows how far it has got and a Stop, which cancels it uncharged.
 */
export function TranscribeSheet({ visible, onClose, line, figure, figureLine, short, running, busy, onAction, onStop, onInfo }: TranscribeSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const working = running != null;
  const pct = `${Math.round((running ?? 0) * 100)}%`;

  const header = (
    <View className="flex-row items-start gap-3 px-6 pb-2">
      <View className="flex-1 gap-1">
        <ThemedText type="headlineSm">{working ? 'Transcribing this episode' : 'Transcribe this episode'}</ThemedText>
        <ThemedText type="bodySm" color={muted}>
          {working ? 'Keep listening. It carries on if you close the app.' : line}
        </ThemedText>
      </View>
      <Touchable onPress={onInfo} hitSlop={8} accessibilityRole="button" accessibilityLabel="How transcribing works">
        <Info size={20} color={muted} />
      </Touchable>
    </View>
  );

  return (
    <FitSheet visible={visible} onClose={onClose} header={header} contentStyle={CONTENT}>
      <View className="gap-6 pt-4">
        {working ? (
          <View className="gap-3">
            <ThemedText type="headlineLg" style={{ fontVariant: ['tabular-nums'] }}>
              {pct}
            </ThemedText>
            <Progress value={running} minValue={0} maxValue={1} size="sm" />
          </View>
        ) : (
          <View className="gap-1">
            <ThemedText type="headlineLg" color={short ? tokens['--color-foreground'] : tokens['--color-primary']}>
              {figure}
            </ThemedText>
            <ThemedText type="bodySm" color={muted}>
              {figureLine}
            </ThemedText>
          </View>
        )}
        {working ? (
          <ActionButton icon={Square} label="STOP" onPress={onStop} disabled={busy} tint={tokens['--color-foreground']} centered />
        ) : (
          <GoldButton label={short ? 'SEE PLANS' : 'TRANSCRIBE'} onPress={onAction} loading={busy} />
        )}
      </View>
    </FitSheet>
  );
}

const CONTENT = { paddingHorizontal: spacing[6] };
