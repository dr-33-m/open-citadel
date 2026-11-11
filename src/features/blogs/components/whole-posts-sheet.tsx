import React from 'react';
import { View } from 'react-native';

import { BookOpen, Globe, Lock } from '@/components/icons';
import { WelcomeChoice } from '@/components/stage/welcome-choice';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import type { WholePosts } from '@/db/schema';
import type { WholePostsAskCopy } from '@/features/blogs/utils/whole-posts';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type WholePostsSheetProps = {
  visible: boolean;
  /** Null draws an empty sheet; keep the copy while it slides away. */
  copy: WholePostsAskCopy | null;
  onChoose: (mode: WholePosts) => void;
  onClose: () => void;
};

/**
 * Asked once per blog whose feed carries only the opening of each post:
 * read the rest on its site, or fetch each post into the reader. Two doors
 * at the same weight, since neither is wrong; the publisher's way first.
 */
export function WholePostsSheet({ visible, copy, onChoose, onClose }: WholePostsSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const onSite = React.useCallback(() => onChoose('site'), [onChoose]);
  const inApp = React.useCallback(() => onChoose('app'), [onChoose]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      {copy ? (
        <View className="gap-6 px-6">
          <View className="gap-1">
            <ThemedText type="labelSm" color={tokens['--color-primary']} numberOfLines={1}>
              {copy.kicker}
            </ThemedText>
            <ThemedText type="headlineSm">{copy.title}</ThemedText>
            <ThemedText type="bodyMd" color={muted} className="pt-1">
              {copy.line}
            </ThemedText>
          </View>
          <View className="gap-3">
            <WelcomeChoice icon={Globe} title={copy.site.title} detail={copy.site.detail} onPress={onSite} />
            <WelcomeChoice icon={BookOpen} title={copy.app.title} detail={copy.app.detail} onPress={inApp} />
          </View>
          <View className="flex-row items-center gap-2">
            <Lock size={14} color={muted} />
            <ThemedText type="bodySm" color={muted} className="flex-1">
              {copy.note}
            </ThemedText>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
