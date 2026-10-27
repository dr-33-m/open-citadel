import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BookOpen, Headphones, Info, Newspaper } from '@/components/icons';
import { SquareArtwork } from '@/components/square-artwork';
import { StatGrid } from '@/components/stage/stat-grid';
import { TrustLine } from '@/components/stage/trust-line';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { elevation, motion, popIn, revealIn } from '@/constants/theme';
import { ListenStatsSkeleton } from '@/features/audiobook/components/listen-stats-skeleton';
import type { ListenState } from '@/features/audiobook/hooks/use-listen';
import { VoicePickerRow } from '@/features/tts/components/voice-picker-row';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { coverAspect } from '@/utils/cover-aspect';
import { monogramOf } from '@/utils/monogram';

const COVER_HEIGHT = 132;

/**
 * Before a book (or a blog post) is first heard: what it will take. The
 * cover (a post's picture, square), the book, the
 * time left and the Neurons as figures, the voice it will be read in, and
 * LISTEN where the thumb is. How it is paid for is one tap deeper, behind
 * the "i"; what happens to the text is said in one line at the foot.
 */
export function ListenSheet({ sheet }: { sheet: ListenState['sheet'] }) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const { book } = sheet;
  const monogram = book && !book.post ? monogramOf(book.title) : null;
  const aspect = coverAspect(book?.post ?? false);
  const fallbackIcon = book?.post ? Newspaper : BookOpen;

  return (
    <Sheet visible={sheet.visible} onClose={sheet.onClose}>
      {book ? (
        <View className="items-center gap-8 px-6 pb-2 pt-2">
          <Animated.View entering={popIn(motion.base)} style={elevation.card}>
            <SquareArtwork
              uri={book.coverUrl}
              size={COVER_HEIGHT}
              aspect={aspect}
              fallbackIcon={fallbackIcon}
              monogram={monogram}
              placeholderColor={tokens['--color-surface-tertiary']}
            />
          </Animated.View>
          <Animated.View entering={revealIn(1)} className="items-center gap-2">
            <ThemedText type="headlineMd" className="text-center" numberOfLines={2}>
              {book.title}
            </ThemedText>
            <ThemedText type="bodyMd" color={muted} className="text-center" numberOfLines={1}>
              {book.author}
            </ThemedText>
          </Animated.View>
          {sheet.stats ? <StatGrid stats={sheet.stats} firstStep={2} /> : <ListenStatsSkeleton />}
          <Animated.View entering={revealIn(4)} className="self-stretch">
            <VoicePickerRow name={sheet.voiceName} onPress={sheet.onVoice} accessibilityLabel="Choose the voice" />
          </Animated.View>
          <Animated.View entering={revealIn(5)} className="self-stretch gap-4">
            <GoldButton label="LISTEN" icon={Headphones} onPress={sheet.onListen} />
            <Touchable
              className="flex-row items-center justify-center gap-2 py-1"
              onPress={sheet.onInfo}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="How listening is paid for"
            >
              <Info size={14} color={muted} />
              <ThemedText type="bodySm" color={muted}>
                Paid as it plays, from your Neurons
              </ThemedText>
            </Touchable>
            <TrustLine text="Each sentence goes to the voice only to be read, and is never kept." entering={revealIn(6)} />
          </Animated.View>
        </View>
      ) : null}
    </Sheet>
  );
}
