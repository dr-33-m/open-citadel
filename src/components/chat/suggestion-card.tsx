import { BookOpen, Check, Lightbulb, X } from '@/components/icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { eq } from 'drizzle-orm';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, elevation, motion, spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { chatSuggestions } from '@/db/schema';
import { useReaderStore } from '@/stores/reader';
import { useTimelineStore } from '@/stores/timeline';
import { asColor } from '@/utils/colors';

interface SuggestionCardProps {
  id: string;
  kind: 'highlight' | 'thought';
}

interface SuggestionData {
  sessionId: string;
  status: 'pending' | 'approved' | 'rejected';
  text: string;
  tags: string[];
  bookId: string | null;
  locator: string | null;
}

/**
 * A highlight/thought Samwell proposed mid-chat, rendered inline where the
 * [[suggest:kind:id]] marker appears. Nothing is saved until Approve is
 * tapped here — this card, not a blocking dialog, owns that decision.
 */
export const SuggestionCard = React.memo(function SuggestionCard({ id, kind }: SuggestionCardProps) {
  // Literal colours for the Reanimated card shell, the lucide props, and
  // ThemedText's `color` prop; everything on a plain View moves to classes.
  const [surfaceTertiary, primary, mutedForeground] = useCSSVariable([
    '--color-surface-tertiary',
    '--color-primary',
    '--color-muted-foreground',
  ]);
  /*
   * State, because Approve and Reject rewrite it — but seeded by a LAZY
   * initialiser rather than an effect, so the card's first paint already has
   * its content. The effect version rendered nothing on frame one and the
   * whole card on frame two, which is a layout jump in the middle of a
   * streaming reply. See the fuller note in `highlight-card`.
   *
   * The initialiser runs once per mount, and the transcript keys these by id,
   * so a different suggestion is a different instance.
   */
  const [data, setData] = useState<SuggestionData | null>(() => {
    const row = db.select().from(chatSuggestions).where(eq(chatSuggestions.id, id)).get();
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      status: row.status,
      text: row.text,
      tags: row.tags ? JSON.parse(row.tags) : [],
      bookId: row.bookId,
      locator: row.locator,
    };
  });

  if (!data) return null;

  const handleApprove = async () => {
    if (!data) return;
    let resultEntryId = '';
    if (kind === 'highlight') {
      if (!data.bookId || !data.locator) return;
      resultEntryId = await useReaderStore
        .getState()
        .addHighlight(data.text, JSON.parse(data.locator), undefined, data.sessionId, data.bookId);
    } else {
      resultEntryId = await useTimelineStore
        .getState()
        .addThought(data.text, '#f2ca50', data.tags, data.sessionId);
    }
    db.update(chatSuggestions)
      .set({ status: 'approved', resultEntryId })
      .where(eq(chatSuggestions.id, id))
      .run();
    setData((prev) => (prev ? { ...prev, status: 'approved' } : prev));
  };

  const handleReject = () => {
    db.update(chatSuggestions).set({ status: 'rejected' }).where(eq(chatSuggestions.id, id)).run();
    setData((prev) => (prev ? { ...prev, status: 'rejected' } : prev));
  };

  const Icon = kind === 'highlight' ? BookOpen : Lightbulb;

  return (
    <Animated.View
      layout={LinearTransition.duration(motion.base).easing(easing)}
      style={[
        elevation.soft,
        {
          gap: spacing[2],
          marginVertical: spacing[1],
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          borderLeftWidth: 3,
          borderLeftColor: asColor(primary),
          backgroundColor: asColor(surfaceTertiary),
        },
      ]}
    >
      <ThemedText type="bodySm" italic numberOfLines={4}>
        {data.text}
      </ThemedText>

      {data.tags.length > 0 && (
        <View className="flex-row flex-wrap gap-1">
          {data.tags.slice(0, 3).map((tag) => (
            <View key={tag} className="bg-muted px-2 py-[1px]">
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                {tag}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      {data.status === 'pending' && (
        <Animated.View
          exiting={FadeOut.duration(motion.fast).easing(easing)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing[2],
          }}
        >
          <View className="flex-row items-center gap-1">
            <Icon size={12} color={asColor(mutedForeground)} />
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              {kind === 'highlight' ? 'Save as highlight?' : 'Save this thought?'}
            </ThemedText>
          </View>
          <View className="flex-row gap-4">
            <Touchable className="py-1" haptic="warn" onPress={handleReject}>
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                REJECT
              </ThemedText>
            </Touchable>
            <Touchable className="py-1" haptic="commit" onPress={() => void handleApprove()}>
              <ThemedText type="labelSm" color={asColor(primary)}>
                APPROVE
              </ThemedText>
            </Touchable>
          </View>
        </Animated.View>
      )}

      {data.status === 'approved' && (
        <Animated.View
          entering={FadeIn.duration(motion.base).easing(easing)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
        >
          <Check size={12} color={asColor(primary)} />
          <ThemedText type="labelSm" color={asColor(primary)}>
            Saved
          </ThemedText>
        </Animated.View>
      )}

      {data.status === 'rejected' && (
        <Animated.View
          entering={FadeIn.duration(motion.base).easing(easing)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
        >
          <X size={12} color={asColor(mutedForeground)} />
          <ThemedText type="labelSm" color={asColor(mutedForeground)}>
            Dismissed
          </ThemedText>
        </Animated.View>
      )}
    </Animated.View>
  );
});
