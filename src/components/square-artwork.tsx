import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { CoverImage } from '@/components/cover-image';
import type { LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { fontFamily } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SquareArtworkProps = {
  uri: string | null;
  /** Drawn when there is no picture: the kind of thing this is (a microphone, a newspaper). */
  fallbackIcon: LucideIcon;
  /**
   * Initials set in the serif instead of the icon, for things that are
   * mostly known by name (a blog). From `monogramOf`.
   */
  monogram?: string | null;
  /** Its height; its width too, unless `aspect` says otherwise. */
  size: number;
  /** Width over height: 1 for a show, 2/3 for a book's cover. */
  aspect?: number;
  /** For lists: lets a recycled cell drop the previous row's image at once. */
  recyclingKey?: string;
  /** Resolved `--color-surface-tertiary`, for the empty mark. */
  placeholderColor?: string;
  style?: StyleProp<ViewStyle>;
};

const FILL = { width: '100%' as const, height: '100%' as const };

/**
 * A show's, an episode's, a blog's or a post's picture, or a book's cover:
 * square-cornered, like every corner in the app.
 *
 * Podcast and reader apps round their artwork almost without exception, and
 * it is the quickest way to tell this one belongs to Open Citadel that it
 * does not. Artwork is drawn at the size it is shown (expo-image downsamples
 * on decode), so a shelf of forty shows costs forty thumbnails rather than
 * forty posters.
 */
function SquareArtworkBase({
  uri,
  fallbackIcon: Fallback,
  monogram,
  size,
  aspect = 1,
  recyclingKey,
  placeholderColor,
  style,
}: SquareArtworkProps) {
  const tokens = useThemeTokens();
  const width = Math.round(size * aspect);
  const short = Math.min(width, size);
  const letters = { fontFamily: fontFamily.serifMedium, fontSize: Math.round(short * 0.34), lineHeight: Math.round(short * 0.42) };
  return (
    <View className="overflow-hidden border border-border bg-muted" style={[{ width, height: size }, style]}>
      {uri ? (
        <CoverImage
          source={{ uri, width, height: size }}
          style={FILL}
          contentFit="cover"
          recyclingKey={recyclingKey}
          cachePolicy="memory-disk"
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          {monogram ? (
            <ThemedText color={tokens['--color-muted-foreground']} style={letters} accessible={false}>
              {monogram}
            </ThemedText>
          ) : (
            <Fallback size={Math.round(short * 0.36)} color={placeholderColor} strokeWidth={1.5} />
          )}
        </View>
      )}
    </View>
  );
}

export const SquareArtwork = React.memo(SquareArtworkBase);
