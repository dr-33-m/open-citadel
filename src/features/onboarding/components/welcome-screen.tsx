import React from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { Compass, LibraryBig, UserStar } from '@/components/icons';
import { ActionButton } from '@/components/action-button';
import { SamwellText } from '@/components/samwell-text';
import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { GoldButton } from '@/components/ui/gold-button';
import { easing, motion, popIn } from '@/constants/theme';
import { ACCOUNT_ENABLED } from '@/constants/logto';
import { asColor } from '@/utils/colors';

/**
 * The first screen anybody sees, and the only chance to say what this is.
 *
 * Two doors, one primary. The concierge is gold because it is the one worth
 * taking: somebody who has just installed a reader has an empty library and no
 * idea what any of this is for, and the whole point of that door is that
 * Samwell fixes both while introducing himself. Tinkering is a real choice and
 * stays quiet beside it rather than being hidden, because an onboarding you
 * cannot decline is not a welcome.
 *
 * It appears once. There is no way back to it, which is what `explain_app`
 * exists to make safe: whichever door they take, Samwell can explain any part
 * of the app from an ordinary conversation later.
 */
export function WelcomeScreen({
  onConcierge,
  onTinker,
}: {
  onConcierge: () => void;
  onTinker: () => void;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);

  return (
    <View className="flex-1 justify-center gap-8 px-8">
      <View className="items-center gap-4">
        <Animated.View entering={popIn(motion.base)}>
          <LibraryBig size={48} color={asColor(primary)} />
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(motion.base).easing(easing).delay(80)}>
          <ThemedText type="headlineLg" className="text-center">
            Open Citadel
          </ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(motion.base).easing(easing).delay(140)}>
          <ThemedText
            type="bodyMd"
            color={asColor(mutedForeground)}
            style={{ textAlign: 'center', lineHeight: 24 }}
          >
            A place to read, and to make something of what you read.
          </ThemedText>
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeInUp.duration(motion.base).easing(easing).delay(220)}
        className="gap-6"
      >
        {/* The concierge, and only in a build that has accounts. Without Logto
            there is nobody to sign in as, so offering it would be a door onto
            a wall. Same reasoning `AccountCard` uses to draw nothing. */}
        {ACCOUNT_ENABLED && (
          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-2">
              <ThemedText type="labelLg" numberOfLines={1} className="shrink">
                CONCIERGE ONBOARDING
              </ThemedText>
              {/* What it costs you, on the right, exactly as the account card
                  places its own badge. */}
              <Badge variant="secondary">Needs an account</Badge>
            </View>
            <SamwellText type="bodySm" color={asColor(mutedForeground)}>
              Samwell will tell you about the app and set it up for you.
            </SamwellText>
            <GoldButton label="START WITH SAMWELL" icon={UserStar} onPress={onConcierge} />
          </View>
        )}

        <View className="gap-3">
          <ThemedText type="labelLg">TINKER AROUND</ThemedText>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Figure the app out as you use it.
          </ThemedText>
          <ActionButton
            icon={Compass}
            label="GO TO MY LIBRARY"
            tint={asColor(mutedForeground)}
            onPress={onTinker}
            className="self-start"
          />
        </View>
      </Animated.View>
    </View>
  );
}
