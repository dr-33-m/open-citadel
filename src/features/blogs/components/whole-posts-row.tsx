import React from 'react';
import { View } from 'react-native';

import { BookOpen, ChevronRight, Globe } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';

export type WholePostsRowProps = {
  text: string;
  /** `site` draws the globe, `reader` the open book, as the two choices are drawn. */
  mark: 'site' | 'reader';
  /** Null when the publisher has settled it, so there is nothing to change. */
  onPress: (() => void) | null;
  muted: string | undefined;
};

/** Where a summary-only blog's posts are read, as a quiet row that opens the choice, marked as the choice is. */
export function WholePostsRow({ text, mark, onPress, muted }: WholePostsRowProps) {
  const Mark = mark === 'site' ? Globe : BookOpen;
  const body = (
    <View className="flex-row items-center gap-2">
      <Mark size={16} color={muted} />
      <ThemedText type="bodySm" color={muted} className="flex-1" numberOfLines={2}>
        {text}
      </ThemedText>
      {onPress ? <ChevronRight size={16} color={muted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Touchable
      onPress={onPress}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint="Choose where this blog's posts are read"
    >
      {body}
    </Touchable>
  );
}
