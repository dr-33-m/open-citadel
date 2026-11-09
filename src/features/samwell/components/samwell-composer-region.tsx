import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Reveal } from '@/components/navigation/reveal';
import { SamwellControlCenter } from '@/components/samwell/samwell-control-center';
import { SamwellToolbox } from '@/components/samwell/samwell-toolbox';
import { contentColumn } from '@/constants/theme';
import { useComposerFrame } from '@/features/samwell/hooks/use-composer-frame';
import { useSamwellComposer } from '@/features/samwell/hooks/use-samwell-composer';

type SamwellComposerRegionProps = {
  /** Paid once by this stack, and covered by the keyboard when one is up. */
  bottomInset: number;
};

/**
 * The card you type into, floating over the conversation, and the drawer of
 * tools under it.
 *
 * What a transcript keeps clear of is the card alone (`composerHeight`), not
 * the drawer: the drawer opening lies over the conversation, and its slide
 * no longer remeasures the stack and redraws the page on every frame of it.
 */
export function SamwellComposerRegion({ bottomInset }: SamwellComposerRegionProps) {
  const { controlCenter, toolbox } = useSamwellComposer();
  const { onCardLayout, liftStyle } = useComposerFrame(bottomInset);

  return (
    <Animated.View className="absolute bottom-0 left-0 right-0" style={liftStyle}>
      <Reveal index={1} style={{ paddingBottom: bottomInset }}>
        <View onLayout={onCardLayout} className="px-4 pt-2" style={contentColumn}>
          <SamwellControlCenter {...controlCenter} />
        </View>
        {/* Under the card, sharing its bottom edge. The stack is anchored to
            the bottom, so opening the drawer lifts the card rather than
            pushing anything off. */}
        <View className="px-4" style={contentColumn}>
          <SamwellToolbox {...toolbox} />
        </View>
      </Reveal>
    </Animated.View>
  );
}
