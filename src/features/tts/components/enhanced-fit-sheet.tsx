import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ActionButton } from '@/components/action-button';
import { CircleAlert, CircleCheck } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Sheet } from '@/components/ui/sheet';
import { enhancedFitCopy, type EnhancedFit } from '@/features/tts/utils/enhanced-fit';
import { asColor } from '@/utils/colors';

export interface EnhancedFitSheetProps {
  visible: boolean;
  onClose: () => void;
  fit: EnhancedFit;
  /** The way out for a phone that strains: switch to the Lite voices. */
  onUseLite: () => void;
  /**
   * The other way out: the same Kokoro voices from the cloud. Left out where
   * Cloud cannot be chosen here (this build cannot sell a plan, or the server
   * has no cloud voices); choosing it without a plan raises the plans sheet.
   */
  onUseCloud?: () => void;
}

/**
 * What the mark beside "Sounds more human" means on this phone.
 *
 * Where the voices run smoothly it says so and nothing more. Where they will
 * pause it says that plainly, that they can still be tried, and the way out
 * if they prove unusable: the warning is advice, never a lock.
 */
export function EnhancedFitSheet({ visible, onClose, fit, onUseLite, onUseCloud }: EnhancedFitSheetProps) {
  const [mutedForeground, success, warning, primary] = useCSSVariable([
    '--color-muted-foreground',
    '--color-success-foreground',
    '--color-warning-foreground',
    '--color-primary',
  ]);
  const smooth = fit === 'smooth';
  const copy = enhancedFitCopy(fit);
  const Icon = smooth ? CircleCheck : CircleAlert;

  return (
    // `push`: in the reader this opens from inside the voice sheet, and the
    // default would put that sheet away and take this one with it.
    <Sheet visible={visible} onClose={onClose} stackBehavior="push">
      <View className="gap-6 px-6">
        <View className="gap-3">
          <View className="flex-row items-start gap-2">
            <Icon size={20} color={asColor(smooth ? success : warning)} strokeWidth={2} />
            {/* The whole row's width, never measured to fit: Android measures
                the serif short and drops the last word onto a line it does not draw. */}
            <ThemedText type="headlineSm" className="flex-1">
              {copy.title}
            </ThemedText>
          </View>
          <ThemedText type="bodyMd" color={asColor(mutedForeground)}>
            {copy.line}
          </ThemedText>
          {copy.advice ? (
            <ThemedText type="bodyMd" color={asColor(mutedForeground)}>
              {copy.advice}
            </ThemedText>
          ) : null}
        </View>

        {/* An acknowledgement and a choice between two equals, so neither is
            the 56pt bar: that size is for a button that is the screen's whole
            purpose. The two choices are the same box side by side, and the
            fill alone says which one carries on as they are. */}
        {smooth ? (
          <GoldButton label="GOT IT" size="compact" onPress={onClose} />
        ) : onUseCloud ? (
          // Two ways out side by side, equal, and carrying on as they are
          // under them: the one choice that changes nothing.
          <View className="gap-3">
            <View className="flex-row gap-3">
              <ActionButton label="USE LITE VOICES" onPress={onUseLite} tint={asColor(primary)} centered className="h-10 flex-1" />
              <ActionButton label="USE CLOUD" onPress={onUseCloud} tint={asColor(primary)} centered className="h-10 flex-1" />
            </View>
            <GoldButton label="TRY ANYWAY" size="compact" onPress={onClose} />
          </View>
        ) : (
          <View className="flex-row gap-3">
            <ActionButton label="USE LITE VOICES" onPress={onUseLite} tint={asColor(primary)} centered className="h-10 flex-1" />
            <View className="flex-1">
              <GoldButton label="TRY ANYWAY" size="compact" onPress={onClose} />
            </View>
          </View>
        )}
      </View>
    </Sheet>
  );
}
