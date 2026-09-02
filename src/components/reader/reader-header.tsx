import { ArrowLeft, AudioLines, Bookmark, BookmarkCheck, List } from '@/components/icons';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/constants/theme';

type ReaderHeaderProps = {
  title: string;
  progress?: number;
  isBookmarked?: boolean;
  isTTSActive?: boolean;
  onBack: () => void;
  onBookmarkToggle?: () => void;
  onContents?: () => void;
  onTTSToggle?: () => void;
  onToggle?: () => void;
};

/** ThemedText/lucide icons take a literal color, not a className — resolve the
 * semantic token once per render and fall back to `undefined` (which lets
 * `ThemedText` apply its own default) if it hasn't resolved yet. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The `h-9` control row this header is built from. */
const CONTROL_SIZE = 36;

/**
 * The header's own height, below the status bar — its two paddings plus the
 * control row between them.
 *
 * Exported because the reader has to reserve exactly this much space above
 * the ReadiumView: the header is an absolutely-positioned overlay, so
 * anything the reading area doesn't reserve, the header draws on top of. The
 * reader used to hard-code 10 here, which left the header covering the first
 * ~46dp of every page — the first line of text on a page that begins with
 * one. Derived rather than repeated so the two cannot drift again.
 */
export const READER_HEADER_HEIGHT = spacing[2] + CONTROL_SIZE + spacing[3];

export function ReaderHeader({
  title,
  progress,
  isBookmarked,
  isTTSActive,
  onBack,
  onBookmarkToggle,
  onContents,
  onTTSToggle,
  onToggle,
}: ReaderHeaderProps) {
  const [primary, foreground, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-foreground',
    '--color-muted-foreground',
  ]);
  const insets = useSafeAreaInsets();

  return (
    <Touchable
      className="flex-row items-center gap-2 bg-background px-4 pb-3"
      // Only the safe-area-dependent top inset stays inline — it's a runtime
      // measurement, not a static utility.
      style={{ paddingTop: insets.top + spacing[2] }}
      onPress={onToggle}
    >
      <Touchable onPress={onBack} className="h-9 w-9 items-center justify-center">
        <ArrowLeft size={22} color={asColor(primary)} />
      </Touchable>

      <ThemedText
        type="bodySm"
        color={asColor(mutedForeground)}
        numberOfLines={1}
        className="flex-1 text-center"
      >
        {title}
      </ThemedText>

      <View className="flex-row items-center gap-1">
        <Touchable onPress={onBookmarkToggle} className="h-9 w-9 items-center justify-center">
          {isBookmarked ? (
            <BookmarkCheck size={20} color={asColor(primary)} />
          ) : (
            <Bookmark size={20} color={asColor(foreground)} />
          )}
        </Touchable>
        <Touchable onPress={onContents} className="h-9 w-9 items-center justify-center">
          <List size={20} color={asColor(foreground)} />
        </Touchable>
        <Touchable onPress={onTTSToggle} className="h-9 w-9 items-center justify-center">
          <AudioLines size={20} color={isTTSActive ? asColor(primary) : asColor(foreground)} />
        </Touchable>
        {progress !== undefined && (
          <ThemedText type="labelSm" color={asColor(mutedForeground)} style={{ fontVariant: ['tabular-nums'] }}>
            {Math.round(progress * 100)}%
          </ThemedText>
        )}
      </View>
    </Touchable>
  );
}
