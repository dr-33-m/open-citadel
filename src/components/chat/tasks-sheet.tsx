import React from 'react';
import { View } from 'react-native';

import { TurnTrail } from '@/components/chat/turn-trail';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { spacing } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { asColor } from '@/utils/colors';
import type { TurnStep } from '@/utils/turn-activity';

export interface TasksSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Kept by the caller while the sheet slides away, so it does not empty as it goes. */
  steps: readonly TurnStep[];
}

/** About how many closed rows sit inside the sheet's height on a small phone. */
const FITS_UNSCROLLED = 8;
const HEIGHT = 0.78;

/**
 * Everything Samwell did on the way to a reply, a step to a row, each closed
 * on what came of it until opened: raised from the ticked list in the reply's
 * footer (`TasksButton`). The title is pinned while the steps scroll under
 * it. One per conversation.
 */
export function TasksSheet({ visible, onClose, steps }: TasksSheetProps) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  // A sheet sized to its content never hands a list inside it the drag, so a
  // list that can outgrow the cap gets a fixed box to scroll in (see
  // `SourcesSheet`). A short one fits itself and does not scroll at all.
  const long = steps.length > FITS_UNSCROLLED;
  const line = steps.length === 1 ? 'One step on the way to his answer' : `${steps.length} steps on the way to his answer`;
  const trail = <TurnTrail steps={steps} />;

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
        <ThemedText type="headlineSm">What Samwell did</ThemedText>
        <ThemedText type="bodySm" color={muted}>
          {line}
        </ThemedText>
      </View>
      {long ? (
        <PageFade edges="both" surface="popover">
          <Sheet.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={CONTENT}>
            {trail}
          </Sheet.ScrollView>
        </PageFade>
      ) : (
        <View style={CONTENT}>{trail}</View>
      )}
    </Sheet>
  );
}

const CONTENT = { paddingHorizontal: spacing[6], paddingBottom: spacing[4] };
