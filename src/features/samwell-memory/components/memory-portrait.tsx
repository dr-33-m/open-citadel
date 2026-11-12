import React from 'react';
import { View, type NativeSyntheticEvent, type TextLayoutEventData, type TextStyle } from 'react-native';

import { Ellipsis } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type MemoryPortraitProps = {
  text: string;
  updated: string;
  onOpen: () => void;
};

/** Lines shown before READ ALL. */
const CLOSED_LINES = 5;
const SERIF = { fontFamily: fontFamily.serif } as const;
/**
 * The full text laid out unseen at the card's own width (inside its `p-4`),
 * since a clamped text reports only the lines it shows on Android.
 */
const MEASURE: TextStyle = { ...SERIF, position: 'absolute', left: 16, right: 16, top: 0, opacity: 0 };

/**
 * His picture of them, in his own words: the first thing on the page, in the
 * serif with a gold edge, because it is the one piece that is about the whole
 * of them rather than a moment. Five lines and READ ALL, so it never pushes
 * the notes off the screen.
 */
export function MemoryPortrait({ text, updated, onOpen }: MemoryPortraitProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const gold = tokens['--color-primary'];
  // Local view state: whether this card is open, and whether it needs to be.
  const [open, setOpen] = React.useState(false);
  const [long, setLong] = React.useState(false);
  const measure = React.useCallback((event: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (event.nativeEvent.lines.length > CLOSED_LINES) setLong(true);
  }, []);
  const toggle = React.useCallback(() => setOpen((value) => !value), []);
  const lines = open ? undefined : CLOSED_LINES;

  return (
    <Card className="border-l-2" style={{ borderLeftColor: gold }}>
      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <ThemedText type="labelSm" color={gold} className="flex-1">
            HOW HE SEES YOU
          </ThemedText>
          <ThemedText type="labelSm" color={muted}>
            {updated}
          </ThemedText>
          <Touchable onPress={onOpen} hitSlop={12} accessibilityRole="button" accessibilityLabel="Correct or forget how he sees you">
            <Ellipsis size={16} color={muted} />
          </Touchable>
        </View>
        {long ? null : (
          <ThemedText type="bodyLg" style={MEASURE} onTextLayout={measure} aria-hidden pointerEvents="none">
            {text}
          </ThemedText>
        )}
        <ThemedText type="bodyLg" style={SERIF} numberOfLines={lines}>
          {text}
        </ThemedText>
        {long ? (
          <Touchable onPress={toggle} hitSlop={12} accessibilityRole="button" className="self-start">
            <ThemedText type="labelSm" color={gold}>
              {open ? 'SHOW LESS' : 'READ ALL'}
            </ThemedText>
          </Touchable>
        ) : null}
      </View>
    </Card>
  );
}
