import { AudioLines, Bookmark, BookmarkCheck, ChevronLeft, List } from '@/components/icons';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { IconButton } from '@/components/icon-button';
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
      <IconButton onPress={onBack} label="Back to the library">
        <ChevronLeft size={20} color={asColor(foreground)} strokeWidth={2} />
      </IconButton>

      {/*
        The progress sits UNDER the title, not in the row of controls.
        It is metadata about the book, and the three things to its right are
        actions; at the same level in the same row a bare "3%" read as a
        fourth control that had lost its box. Under the title it is attached to
        the thing it describes, which is the app's own "status line under a
        centered title" pattern from `ScreenHeader`.

        "READ" earns its place rather than padding the line: a percentage on
        its own in a reader could be battery, position or download. Adding the
        one word is what makes it a statement instead of a number.
      */}
      {/* Start-aligned, matching the section and collection headers: title on
          one line, its metadata under it, both against the leading edge. A
          centred block put the title and the percentage on two different
          optical axes, since the title truncates and the percentage does not. */}
      <View className="flex-1 items-start">
        <ThemedText type="bodySm" color={asColor(mutedForeground)} numberOfLines={1}>
          {title}
        </ThemedText>
        {progress !== undefined && (
          <ThemedText
            type="labelSm"
            color={asColor(mutedForeground)}
            // Tabular figures so the number does not jitter as it ticks up.
            style={{ fontVariant: ['tabular-nums'], fontSize: 10 }}
          >
            {`${Math.round(progress * 100)}% READ`}
          </ThemedText>
        )}
      </View>

      <View className="flex-row items-center gap-1">
        {/* Gold only when the page IS bookmarked — a state, not decoration. */}
        <IconButton
          onPress={onBookmarkToggle}
          label={isBookmarked ? 'Remove the bookmark' : 'Bookmark this page'}
        >
          {isBookmarked ? (
            <BookmarkCheck size={20} color={asColor(primary)} strokeWidth={2} />
          ) : (
            <Bookmark size={20} color={asColor(foreground)} strokeWidth={2} />
          )}
        </IconButton>
        <IconButton onPress={onContents} label="Contents">
          <List size={20} color={asColor(foreground)} strokeWidth={2} />
        </IconButton>
        {/* Gold only while it is reading aloud. */}
        <IconButton onPress={onTTSToggle} label={isTTSActive ? 'Stop reading aloud' : 'Read aloud'}>
          <AudioLines
            size={20}
            strokeWidth={2}
            color={isTTSActive ? asColor(primary) : asColor(foreground)}
          />
        </IconButton>
      </View>
    </Touchable>
  );
}
