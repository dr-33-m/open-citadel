import React from 'react';
import { Image, ScrollView, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { HeartHandshake, Navigation2, Pointer, UserStar } from '@/components/icons';
import { ActionButton } from '@/components/action-button';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { ChoiceCard } from '@/features/onboarding/components/choice-card';
import { easing, motion, popIn } from '@/constants/theme';
import { ACCOUNT_ENABLED } from '@/constants/logto';
import { asColor } from '@/utils/colors';

/**
 * The mark, not a stand-in for it.
 *
 * The canvas is mostly padding — the gold glyph occupies roughly the middle
 * 45% — so the box has to be about twice the size the mark should read at.
 * `contain` keeps that true whatever the source is replaced with.
 */
const LOGO = require('@/assets/icons/oc-splash-icon-dark.png');
const LOGO_BOX = { width: 128, height: 128 } as const;

/** Hoisted: a fresh object per render re-lays the scroll region out. */
const SCROLL_CONTENT = { flexGrow: 1, justifyContent: 'center' } as const;

/**
 * The first screen anybody sees, and the only chance to say what this is.
 *
 * Two doors, presented as cards you compare rather than as a list of buttons.
 * That is the difference between offering a choice and offering a menu: the
 * cards hold the same slots in the same order, so the reader is comparing two
 * answers to one question instead of reading two unrelated paragraphs.
 *
 * The concierge is marked recommended and carries the gold button, because a
 * screen that presents two equal options to somebody with no basis to choose
 * has abdicated rather than empowered. Tinkering stays a real, unhidden
 * choice: an onboarding you cannot decline is not a welcome.
 *
 * It appears once. `explain_app` is what makes that safe, since whichever door
 * they take Samwell can explain any part of the app in an ordinary
 * conversation later.
 */
export function WelcomeScreen({
  onConcierge,
  onTinker,
}: {
  onConcierge: () => void;
  onTinker: () => void;
}) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);

  return (
    /* Scrollable, and not optionally. Two cards plus the mark and the name
       overflow a small phone, and a welcome screen that clips its second
       option is worse than one that scrolls. `PageFade` because every
       scrollable in this app carries one: the scrollbars are hidden, so the
       fade is the only thing saying there is more. */
    <PageFade edges="both">
      <ScrollView
        contentContainerStyle={SCROLL_CONTENT}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-8 px-6 py-10">
          <View className="items-center gap-3">
            <Animated.View entering={popIn(motion.base)}>
              <Image source={LOGO} style={LOGO_BOX} resizeMode="contain" />
            </Animated.View>

            <Animated.View entering={FadeInUp.duration(motion.base).easing(easing).delay(80)}>
              <ThemedText type="headlineLg" className="text-center">
                Open Citadel
              </ThemedText>
            </Animated.View>

            <Animated.View entering={FadeInUp.duration(motion.base).easing(easing).delay(140)}>
              {/* The promise, and the reason the rest of the screen exists.
                  `bodyMd` rather than a heading: it is a sentence, and setting
                  it in the serif display face would make it compete with the
                  name directly above it. */}
              <ThemedText
                type="bodyMd"
                color={asColor(mutedForeground)}
                style={{ textAlign: 'center', lineHeight: 24 }}
              >
                Your Companion in becoming The Best Version of yourself!
              </ThemedText>
            </Animated.View>
          </View>

          {/* Stacked, full width. Side by side was tried and abandoned: at
              phone width each column is about 170pt, which wraps every line
              three times and forces the labels down to two words, so the
              comparison was visible with nothing left worth comparing. A
              carousel fails the other way, showing one card at a time when
              seeing both at once is the entire reason these are cards. */}
          <Animated.View
            entering={FadeInUp.duration(motion.base).easing(easing).delay(220)}
            className="gap-4"
          >
            {/* The concierge, and only in a build that has accounts. Without
                Logto there is nobody to sign in as, so offering it would be a
                door onto a wall. Same reasoning `AccountCard` uses to draw
                nothing at all. */}
            {ACCOUNT_ENABLED && (
              <ChoiceCard
                recommended
                label="RECOMMENDED"
                samwellVoice
                icon={HeartHandshake}
                title="Concierge onboarding"
                description="Allow Samwell to tell you about the app and set it up for you."
                /* Three, matching Tinker Around. Two cards being compared
                   should have the same rhythm: an uneven pair reads as one
                   option having more to say rather than as two answers to the
                   same question. The two library lines merge, since "your own
                   books, or free ones" is one fact about what he builds it
                   from rather than two. */
                points={[
                  'He introduces himself and the app',
                  'He builds your library from your own books, or free ones',
                  'The concierge is on the house',
                ]}
                action={
                  <GoldButton
                    label="START WITH SAMWELL"
                    icon={UserStar}
                    size="compact"
                    onPress={onConcierge}
                  />
                }
              />
            )}

            <ChoiceCard
              icon={Pointer}
              title="Tinker Around"
              description="Figure the app out as you use it."
              points={[
                'Straight to your library',
                'No account needed',
                'Ask Samwell about the app any time',
              ]}
              action={
                /* `min-h-[40px]` lands this on GoldButton's `compact` box, so
                   the two cards' buttons are the same size. A minimum rather
                   than a fixed height, so a system text-size bump grows the
                   button instead of clipping its label. `centered` matches the
                   gold button beside it, which centres its own label. */
                <ActionButton
                  icon={Navigation2}
                  label="GET STARTED"
                  tint={asColor(mutedForeground)}
                  onPress={onTinker}
                  centered
                  className="w-full min-h-[40px]"
                />
              }
            />
          </Animated.View>
        </View>
      </ScrollView>
    </PageFade>
  );
}
