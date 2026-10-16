import React from 'react';
import { View } from 'react-native';

import { ThoughtTrace } from '@/components/chat/thought-trace';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { thoughtForLabel } from '@/components/ui/reasoning';
import { Sheet } from '@/components/ui/sheet';
import { spacing } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { asColor } from '@/utils/colors';
import type { TurnThought } from '@/utils/turn-activity';

export interface ThoughtSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Kept by the caller while the sheet slides away, so it does not empty as it goes. */
  thought: TurnThought | null;
}

/** About what fits in the sheet's height on a small phone without scrolling, beats and their spacing included. */
const FITS_UNSCROLLED = 450;
const HEIGHT = 0.78;

/**
 * What Samwell worked through before a reply, in full: raised from the brain
 * in the reply's footer (`ThoughtButton`). The title says how long, pinned
 * while the trace (`ThoughtTrace`), from where he started to where he
 * answered, scrolls under it. One per conversation.
 */
export function ThoughtSheet({ visible, onClose, thought }: ThoughtSheetProps) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  const text = thought?.text ?? '';
  // A sheet sized to its content never hands a list inside it the drag, so a
  // trace that can outgrow the cap gets a fixed box to scroll in (see
  // `SourcesSheet`). A short one fits itself and does not scroll at all.
  const long = text.length > FITS_UNSCROLLED;
  const title = thoughtForLabel(thought?.seconds ?? undefined);
  const body = <ThoughtTrace text={text} />;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      fixedHeightRatio={long ? HEIGHT : undefined}
      maxHeightRatio={long ? undefined : HEIGHT}
      scrollable={long}
    >
      {/* Pinned: headers never scroll. */}
      <View className="gap-1 px-6 pb-3">
        <ThemedText type="headlineSm">{title}</ThemedText>
        <ThemedText type="bodySm" color={muted}>
          What Samwell worked through before he answered.
        </ThemedText>
      </View>
      {long ? (
        <PageFade edges="both" surface="popover">
          <Sheet.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={CONTENT}>
            {body}
          </Sheet.ScrollView>
        </PageFade>
      ) : (
        <View style={CONTENT}>{body}</View>
      )}
    </Sheet>
  );
}

const CONTENT = { paddingHorizontal: spacing[6], paddingBottom: spacing[4] };
