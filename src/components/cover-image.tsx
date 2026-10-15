import { Image, type ImageProps } from 'expo-image';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';

/**
 * How long a picture may take before its skeleton starts to pulse. One held
 * in memory is in well before this, so a shelf scrolled back into view never
 * mounts a pulsing layer. It was 500ms, longer than a screen's slide in, and
 * that read as a bug: a cover read from disk on an A33 takes a few hundred
 * milliseconds, so a page landed on a row of grey squares that sat still
 * beside a skeleton that breathed. Past this, the square breathes with it.
 */
const SLOW_MS = 150;

type CoverImageProps = Omit<ImageProps, 'placeholder' | 'transition' | 'style' | 'onLoad' | 'onError'> & {
  /** The box the picture fills, and the shape its skeleton takes until it is in. */
  style?: StyleProp<ViewStyle>;
};

/** What identifies the picture asked for, so a recycled cell knows a new one is loading. */
function sourceKey(source: ImageProps['source']): string {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && !Array.isArray(source) && 'uri' in source) return String(source.uri);
  return String(source);
}

/**
 * A cover, a show's artwork or a post's picture, with a skeleton of its own
 * shape behind it until it has loaded.
 *
 * Every picture used to wait on the same blurhash, one colourful blur for all
 * of them, so each one visibly went from blur to sharp even when it came from
 * the cache. A skeleton says "loading" in the same voice as the rest of the
 * page, and is gone once the picture is in (or has failed, when the box's own
 * ground shows).
 *
 * The skeleton starts as a plain block, and pulses once the picture has kept
 * it waiting longer than a cache hit takes (`SLOW_MS`). It used to pulse
 * from the first frame, each cover with a pulsing layer of its own, and a
 * list builds covers as it scrolls: every tile that came into view mounted an
 * animated layer, and dropped it a moment later when its picture (usually
 * already in memory) arrived. That is the work a list recycles its cells to avoid, done once per
 * cover per scroll. A picture in memory never pulses now; one read from disk
 * or still downloading breathes on the shared skeleton clock, so a shelf of
 * them breathes as one, instead of sitting there as a blank square.
 *
 * No fade in. The skeleton already says the picture is coming, and a fade
 * plays again whenever a tile is drawn anew, a picture already in memory
 * included: an Explore shelf taking over from its preview dimmed every cover
 * and brought it back.
 */
function CoverImageBase({ style, ...image }: CoverImageProps) {
  const key = sourceKey(image.source);
  // Keyed on the picture rather than a flag: a recycled list cell keeps its
  // state, and a flag would carry "loaded" over to the next row's picture.
  const [settledKey, setSettledKey] = React.useState<string | null>(null);
  const settle = React.useCallback(() => setSettledKey(key), [key]);
  // No picture at all (a free book without a cover) never loads or fails, so
  // its skeleton would stay for good: the box's own ground is its cover.
  const loading = image.source != null && settledKey !== key;
  // Not reset when a recycled cell is handed a new picture that is also
  // loading: it is still a cover waiting, and the layer stays rather than
  // being dropped and mounted again.
  const slow = useDelayedFlag(loading, SLOW_MS);
  const skeleton = slow ? (
    <SkeletonGroup className="absolute inset-0">
      <SkeletonBar className="h-full w-full rounded-none" />
    </SkeletonGroup>
  ) : loading ? (
    <View className="absolute inset-0 bg-skeleton" />
  ) : null;
  return (
    <View style={style}>
      {skeleton}
      <Image {...image} style={StyleSheet.absoluteFill} onLoad={settle} onError={settle} />
    </View>
  );
}

export const CoverImage = React.memo(CoverImageBase);
