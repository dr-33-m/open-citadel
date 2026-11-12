/**
 * Samwell: the bar, the conversation, the card you type into, and the sheets
 * the card's tools raise.
 *
 * Only the frame. Each part subscribes to what it draws and nothing else, so
 * a streamed token redraws the transcript, a keystroke the card, and a sheet
 * opening that sheet. This file was once the app's largest render, holding
 * every one of those subscriptions itself, which made opening the toolbox or
 * a sheet in a long chat redraw every bubble in it.
 */
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeferredBody } from '@/components/navigation/deferred-body';
import { spacing } from '@/constants/theme';
import { SamwellBody } from '@/features/samwell/components/samwell-body';
import { SamwellComposerRegion } from '@/features/samwell/components/samwell-composer-region';
import { SamwellHeaderRegion } from '@/features/samwell/components/samwell-header-region';
import { SamwellSheets } from '@/features/samwell/components/samwell-sheets';
import { KEYBOARD_GAP } from '@/features/samwell/hooks/use-composer-frame';
import { useSamwellWarmup } from '@/features/samwell/hooks/use-samwell-warmup';

export function SamwellPage() {
  const insets = useSafeAreaInsets();
  useSamwellWarmup();

  // Paid once by the floating stack, and covered by the keyboard when one is
  // up. A transcript lifts exactly as far as the stack rises.
  const bottomInset = Math.max(insets.bottom, spacing[3]);
  const keyboardOffset = bottomInset - KEYBOARD_GAP;

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top }}>
        <SamwellHeaderRegion />
      </View>
      {/* The heavy body mounts the frame after the shell paints, so the push
          starts at once and the mount lands during the slide. */}
      <DeferredBody>
        <SamwellBody keyboardOffset={keyboardOffset} />
        <SamwellComposerRegion bottomInset={bottomInset} />
        <SamwellSheets />
      </DeferredBody>
    </View>
  );
}
