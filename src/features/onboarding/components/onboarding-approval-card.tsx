import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ShieldQuestionMark } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, elevation, motion, spacing } from '@/constants/theme';
import { approvalCopy } from '@/services/approval-copy';
import { useApprovalStore } from '@/stores/approval';
import { asColor } from '@/utils/colors';

/**
 * Samwell asking permission, in the conversation rather than on top of it.
 *
 * The rest of the app answers an approval with `ApprovalDialog`, a modal
 * mounted above the navigator. That component reads the reading chat's active
 * session and Compass's, and knows nothing about this one, so an onboarding
 * approval sat unseen in the store while the turn waited on a promise nobody
 * could resolve. On screen that was "Waiting for your go-ahead…" forever, with
 * no go-ahead anywhere to give. This is the missing surface.
 *
 * Inline rather than teaching the dialog a third session, and the reason is
 * not only that this is somebody's first ninety seconds. A modal is an
 * interruption, and it is the right shape when it interrupts something: a
 * chat, a book, a page of goals. Here the conversation IS the screen, the
 * question is the next thing Samwell said, and a card in the thread reads as
 * him asking. A system dialog on first run reads as an error.
 *
 * The wording is `approvalCopy`, the same function the dialog uses, so the two
 * surfaces cannot drift into describing the same file operation differently.
 *
 * Memoized: it lives at the foot of the transcript, which re-renders on every
 * streamed token, and for all but a few seconds of the conversation its answer
 * is `null`.
 */
export const OnboardingApprovalCard = React.memo(function OnboardingApprovalCard({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const [surfaceTertiary, primary, mutedForeground] = useCSSVariable([
    '--color-surface-tertiary',
    '--color-primary',
    '--color-muted-foreground',
  ]);

  // Narrow, and keyed on the session: a turn writes to the chat store on every
  // token, and this must only wake when an approval for THIS conversation
  // arrives or leaves.
  const pending = useApprovalStore((s) =>
    sessionId ? (s.pendingBySession.get(sessionId)?.request ?? null) : null,
  );
  const respond = useApprovalStore((s) => s.respond);

  const copy = pending ? approvalCopy(pending) : null;

  /*
   * Answering ends the card. It does not leave a marker behind.
   *
   * A first version kept a "You said yes" line, on the theory that scrolling
   * back should show what was agreed to. It read as clutter, because this card
   * is not anchored where the question was asked: it lives at the foot of the
   * transcript, so the marker sat under the goodbye, permanently, describing
   * something four messages up. The conversation already says what happened.
   */
  const answer = (approved: boolean) => {
    if (!pending) return;
    respond(pending.sessionId, approved);
  };

  if (!copy) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(motion.base).easing(easing)}
      layout={LinearTransition.duration(motion.base).easing(easing)}
      exiting={FadeOut.duration(motion.fast).easing(easing)}
      style={[
        elevation.soft,
        {
          gap: spacing[2],
          marginVertical: spacing[1],
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[3],
          borderLeftWidth: 3,
          borderLeftColor: asColor(primary),
          backgroundColor: asColor(surfaceTertiary),
        },
      ]}
    >
      <View className="flex-row items-center gap-2">
        <ShieldQuestionMark size={14} color={asColor(primary)} />
        <ThemedText type="labelSm" color={asColor(primary)}>
          {copy.title}
        </ThemedText>
      </View>

      <ThemedText type="bodySm" color={asColor(mutedForeground)}>
        {copy.body}
      </ThemedText>

      <View
        style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[5] }}
      >
        <Touchable className="py-1" haptic="warn" onPress={() => answer(false)}>
          <ThemedText type="labelSm" color={asColor(mutedForeground)}>
            NOT NOW
          </ThemedText>
        </Touchable>
        <Touchable className="py-1" haptic="commit" onPress={() => answer(true)}>
          <ThemedText type="labelSm" color={asColor(primary)}>
            {copy.confirmLabel}
          </ThemedText>
        </Touchable>
      </View>
    </Animated.View>
  );
});
