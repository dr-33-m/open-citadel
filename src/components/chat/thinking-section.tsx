/**
 * ThinkingSection — the post-reply thinking trace, on PanelUI's Reasoning.
 *
 * Samwell's chat footer renders this only once generation has finished and
 * left a thinking trace behind, so the trace always arrives complete: it
 * starts folded and the reader expands it by hand. `defaultOpen={false}` is
 * what keeps it that way — it also opts out of Reasoning's auto-open, so a
 * panel can never spring open on its own here. The streaming half of
 * Reasoning's contract (shimmer, timed auto-close) stays wired in case a
 * live trace ever lands in this slot.
 *
 * The house trace was a muted box with a primary left edge, a 12px sparkles
 * row and the word "Thinking"; those come back through Reasoning's className
 * slots and the `label` prop rather than a rebuild.
 */
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Reasoning } from '@/components/ui/reasoning';
import { asColor } from '@/utils/colors';

interface ThinkingSectionProps {
  content: string;
}

export function ThinkingSection({ content }: ThinkingSectionProps) {
  // Literal colour for ThemedText's `color` prop.
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);

  if (!content) return null;

  return (
    <View className="mb-1 px-4">
      <Reasoning
        defaultOpen={false}
        className="w-auto max-w-[85%] self-start gap-0 border-l-2 border-l-primary bg-muted"
      >
        <Reasoning.Trigger
          className="gap-1 px-2 py-1"
          label={() => (
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              Thinking
            </ThemedText>
          )}
        />
        <Reasoning.Content className="ps-2 pe-2 pb-2">
          <ThemedText
            type="bodySm"
            color={asColor(mutedForeground)}
            style={{ fontSize: 13, lineHeight: 20 }}
          >
            {content}
          </ThemedText>
        </Reasoning.Content>
      </Reasoning>
    </View>
  );
}
