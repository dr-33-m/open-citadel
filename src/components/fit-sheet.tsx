import React from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageFade } from '@/components/scroll-fades';
import { Sheet } from '@/components/ui/sheet';
import { MaxContentWidth } from '@/constants/theme';

/** The sheet's handle: its padding and the bar between (`Sheet`'s own styles). */
const HANDLE = 8 + 4 + 12;
/** Drawn nowhere, laid out only to be measured. */
const MEASURER: ViewStyle = { position: 'absolute', left: 0, top: 0, opacity: 0 };

export interface FitSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The title and its line: pinned, never scrolled (headers never scroll). */
  header: React.ReactNode;
  /** What the sheet shows, measured before it opens. */
  children: React.ReactNode;
  /** Around the content, in both shapes of the sheet. */
  contentStyle?: StyleProp<ViewStyle>;
  /** The tallest it grows, as a fraction of the window. */
  heightRatio?: number;
}

/**
 * A sheet exactly as tall as what it shows, scrolling only when that is
 * taller than it may grow.
 *
 * A sheet sized to its content stops at its cap but never hands a list
 * inside it the drag, so content that can outgrow the cap needs a fixed box
 * to scroll in; and a fixed box round content that fits leaves a band of
 * nothing under it. Guessing which from a count (pages, steps, characters)
 * was wrong both ways. So the content is laid out once, out of sight, the
 * moment the sheet is asked for, and the sheet opens a frame later in the
 * shape it needs: sized to fit, or fixed at the cap with the content
 * scrolling under the pinned header.
 *
 * The sources, the steps and the thought behind a reply all open in one.
 */
export function FitSheet({ visible, onClose, header, children, contentStyle, heightRatio = 0.78 }: FitSheetProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measured, setMeasured] = React.useState<number | null>(null);
  // Every opening measures afresh: the content is whatever it was opened on.
  const [wasVisible, setWasVisible] = React.useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) setMeasured(null);
  }
  const measure = React.useCallback((event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.height), []);

  const contentWidth = Math.min(width, MaxContentWidth);
  const room = height * heightRatio - HANDLE - Math.max(insets.bottom, 16);
  const long = measured !== null && measured > room;

  return (
    <>
      {visible && measured === null ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[MEASURER, { width: contentWidth }]}
          onLayout={measure}
        >
          {header}
          <View style={contentStyle}>{children}</View>
        </View>
      ) : null}
      <Sheet
        visible={visible && measured !== null}
        onClose={onClose}
        fixedHeightRatio={long ? heightRatio : undefined}
        maxHeightRatio={long ? undefined : heightRatio}
        scrollable={long}
      >
        {header}
        {long ? (
          <PageFade edges="both" surface="popover">
            <Sheet.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={contentStyle}>
              {children}
            </Sheet.ScrollView>
          </PageFade>
        ) : (
          <View style={contentStyle}>{children}</View>
        )}
      </Sheet>
    </>
  );
}
