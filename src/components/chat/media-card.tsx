import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { CoverImage } from '@/components/cover-image';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';

/** A book's cover is a page; a show's artwork is a square. */
const COVERS = {
  book: { width: 40, height: 60 },
  square: { width: 52, height: 52 },
} as const;

export interface MediaCardProps {
  /** Pins the decoded picture to this item across cell reuse. */
  id: string;
  coverUri: string | null;
  coverShape: keyof typeof COVERS;
  /** Drawn in the cover's place when there is no picture. */
  FallbackIcon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle: string | null;
  /** Where the reader is with it, in a few words. */
  status: string | null;
  onPress?: () => void;
}

/**
 * Something from the reader's library that Samwell named, drawn as itself:
 * a book, a show or an episode, by its cover, its name and where they are
 * with it. One drawing for all of them, so a fix to one is a fix to every
 * card in the transcript.
 *
 * A solid card, one rung forward from the reply it sits in. It used to draw
 * no surface of its own and a gold rule down its edge, inside a bubble that
 * was itself a gold tint with a gold rule: two golds and no separation. The
 * card surface gives the cover and title their own ground, the hairline says
 * where it ends, and the gold stays with the reply.
 */
export const MediaCard = React.memo(function MediaCard({
  id,
  coverUri,
  coverShape,
  FallbackIcon,
  title,
  subtitle,
  status,
  onPress,
}: MediaCardProps) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const cover = COVERS[coverShape];

  return (
    <Touchable
      className="my-1 flex-row items-center gap-3 border border-border bg-card px-3 py-2"
      onPress={onPress}
      disabled={!onPress}
    >
      {coverUri ? (
        // Cards ride the chat transcript's recycled list, so the decoded image
        // is pinned to this item across cell reuse.
        <CoverImage source={{ uri: coverUri }} style={cover} contentFit="cover" recyclingKey={id} />
      ) : (
        <View className="items-center justify-center bg-muted" style={cover}>
          <FallbackIcon size={18} color={asColor(mutedForeground)} />
        </View>
      )}

      <View className="flex-1 gap-[2px]">
        <ThemedText type="bodySm" numberOfLines={2}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="labelSm" color={asColor(mutedForeground)} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
        {status ? (
          // Ink rather than gold: the reply already spends the gold, and a
          // second gold inside it competes with the answer for attention.
          <ThemedText type="labelSm" style={TABULAR}>
            {status}
          </ThemedText>
        ) : null}
      </View>
    </Touchable>
  );
});

const TABULAR = { fontVariant: ['tabular-nums' as const] };
