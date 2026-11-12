import React from 'react';
import { View } from 'react-native';

import { Moon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { iconSize } from '@/constants/theme';
import { PlayerTool, TOOL_VALUE } from '@/features/podcasts/components/player-tool';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type PlayerOptionsProps = {
  speedLabel: string;
  /** Null when no sleep timer is set. */
  sleepLabel: string | null;
  onSpeed: () => void;
  onSleep: () => void;
  /** After sleep: where to go from what is playing. An episode's transcript, Samwell and Up Next; a book's text, Highlight and voice. */
  children?: React.ReactNode;
};

/**
 * The player's one row of tools, the way Apple Music ends its player with
 * lyrics, AirPlay and the queue: bare icons spread across the column, no
 * boxes and no words, in the muted ink so the transport above stays the
 * thing the eye finds. One turns gold only while it is changing how it
 * plays (a speed other than 1×, a timer running): gold says "on". How it is
 * played sits on the left (speed, the sleep timer), the rest is the kind's
 * own, on the right. A value shows only when it says something. Chapters
 * open from the chapter's name over the scrubber.
 */
export function PlayerOptions({ speedLabel, sleepLabel, onSpeed, onSleep, children }: PlayerOptionsProps) {
  const tokens = useThemeTokens();
  const gold = tokens['--color-primary'];
  const muted = tokens['--color-muted-foreground'];
  const speedColor = speedLabel !== '1×' ? gold : muted;
  const sleepColor = sleepLabel ? gold : muted;
  const sleepName = sleepLabel ? `Sleep timer, ${sleepLabel}` : 'Sleep timer';

  return (
    <View className="flex-row items-center justify-between">
      <PlayerTool label={`Speed, ${speedLabel}`} onPress={onSpeed}>
        <ThemedText color={speedColor} style={TOOL_VALUE}>
          {speedLabel}
        </ThemedText>
      </PlayerTool>
      <PlayerTool label={sleepName} onPress={onSleep}>
        <Moon size={iconSize.default} color={sleepColor} fill={sleepLabel ? gold : 'none'} />
        {sleepLabel ? (
          <ThemedText color={gold} style={TOOL_VALUE}>
            {sleepLabel}
          </ThemedText>
        ) : null}
      </PlayerTool>
      {children}
    </View>
  );
}
