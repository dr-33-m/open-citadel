import React from 'react';
import { View } from 'react-native';

import { ListMusic, Moon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { fontFamily, iconSize } from '@/constants/theme';
import { PlayerTool } from '@/features/podcasts/components/player-tool';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type PlayerOptionsProps = {
  speedLabel: string;
  /** Null when no sleep timer is set. */
  sleepLabel: string | null;
  upNextCount: number;
  onSpeed: () => void;
  onSleep: () => void;
  onUpNext: () => void;
  /** Between sleep and Up Next: the episode's transcript and Samwell, drawn as tools too. */
  transcript?: React.ReactNode;
};

const VALUE = { fontFamily: fontFamily.sansSemiBold, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums' as const] };

/**
 * The player's one row of tools, the way Apple Music ends its player with
 * lyrics, AirPlay and the queue: bare gold icons spread across the column, no
 * boxes and no words, so the transport above stays the thing the eye finds.
 * How it is played sits on the left (speed, the sleep timer), where to go
 * from it on the right (the transcript, Samwell, Up Next). A value shows only
 * when it says something: the speed always, the timer while it runs, Up
 * Next's count when there is one. Chapters open from the chapter's name
 * over the scrubber.
 */
export function PlayerOptions({ speedLabel, sleepLabel, upNextCount, onSpeed, onSleep, onUpNext, transcript }: PlayerOptionsProps) {
  const tokens = useThemeTokens();
  const gold = tokens['--color-primary'];
  const sleepName = sleepLabel ? `Sleep timer, ${sleepLabel}` : 'Sleep timer';
  const upNextName = upNextCount > 0 ? `Up Next, ${upNextCount}` : 'Up Next';

  return (
    <View className="flex-row items-center justify-between">
      <PlayerTool label={`Speed, ${speedLabel}`} onPress={onSpeed}>
        <ThemedText color={gold} style={VALUE}>
          {speedLabel}
        </ThemedText>
      </PlayerTool>
      <PlayerTool label={sleepName} onPress={onSleep}>
        <Moon size={iconSize.default} color={gold} fill={sleepLabel ? gold : 'none'} />
        {sleepLabel ? (
          <ThemedText color={gold} style={VALUE}>
            {sleepLabel}
          </ThemedText>
        ) : null}
      </PlayerTool>
      {transcript}
      <PlayerTool label={upNextName} onPress={onUpNext}>
        <ListMusic size={iconSize.default} color={gold} />
        {upNextCount > 0 ? (
          <ThemedText color={gold} style={VALUE}>
            {upNextCount}
          </ThemedText>
        ) : null}
      </PlayerTool>
    </View>
  );
}
