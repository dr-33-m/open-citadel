import { BookOpen, Check, Lightbulb, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { eq } from 'drizzle-orm';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, elevation, motion, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { db } from '@/db/client';
import { chatSuggestions } from '@/db/schema';
import { useReaderStore } from '@/stores/reader';
import { useTimelineStore } from '@/stores/timeline';

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
  const colors = useColors();
  const [data, setData] = useState<SuggestionData | null>(null);

  useEffect(() => {
    const row = db.select().from(chatSuggestions).where(eq(chatSuggestions.id, id)).get();
    if (row) {
      setData({
        sessionId: row.sessionId,
        status: row.status,
        text: row.text,
        tags: row.tags ? JSON.parse(row.tags) : [],
        bookId: row.bookId,
        locator: row.locator,
      });
    }
  }, [id]);

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
      style={[styles.card, { backgroundColor: colors.surface.highest, borderLeftColor: colors.primary.default }]}
    >
      <ThemedText type="bodySm" color={colors.text.primary} numberOfLines={4} style={styles.quoteText}>
        {data.text}
      </ThemedText>

      {data.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {data.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={[styles.tagPill, { backgroundColor: colors.surface.mid }]}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                {tag}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      {data.status === 'pending' && (
        <Animated.View exiting={FadeOut.duration(motion.fast).easing(easing)} style={styles.actionsRow}>
          <View style={styles.sourceRow}>
            <Icon size={12} color={colors.text.secondary} />
            <ThemedText type="labelSm" color={colors.text.secondary}>
              {kind === 'highlight' ? 'Save as highlight?' : 'Save this thought?'}
            </ThemedText>
          </View>
          <View style={styles.buttonsRow}>
            <Touchable style={styles.actionBtn} haptic="warn" onPress={handleReject}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                REJECT
              </ThemedText>
            </Touchable>
            <Touchable style={styles.actionBtn} haptic="commit" onPress={() => void handleApprove()}>
              <ThemedText type="labelSm" color={colors.primary.default}>
                APPROVE
              </ThemedText>
            </Touchable>
          </View>
        </Animated.View>
      )}

      {data.status === 'approved' && (
        <Animated.View
          entering={FadeIn.duration(motion.base).easing(easing)}
          style={styles.sourceRow}
        >
          <Check size={12} color={colors.primary.default} />
          <ThemedText type="labelSm" color={colors.primary.default}>
            Saved
          </ThemedText>
        </Animated.View>
      )}

      {data.status === 'rejected' && (
        <Animated.View
          entering={FadeIn.duration(motion.base).easing(easing)}
          style={styles.sourceRow}
        >
          <X size={12} color={colors.text.secondary} />
          <ThemedText type="labelSm" color={colors.text.secondary}>
            Dismissed
          </ThemedText>
        </Animated.View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 3,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginVertical: spacing[1],
    gap: spacing[2],
    ...elevation.soft,
  },
  quoteText: {
    fontStyle: 'italic',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  tagPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  actionBtn: {
    paddingVertical: spacing[1],
  },
});
