/**
 * ThinkingSection — the post-reply thinking trace, on PanelUI's Reasoning.
 *
 * Two states, and `streaming` picks which.
 *
 * **Live**, while the model is still thinking and has said nothing else. The
 * panel opens itself, the trigger shimmers, and Reasoning times the wait so
 * the row can say how long it thought. This is the state that matters: on a
 * reasoning model the thinking IS the wait, measured at 3.8s of a 4.0s turn,
 * and the alternative was an orb that said nothing for the whole of it.
 *
 * **Finished**, when a completed trace is all that is left. `defaultOpen`
 * false keeps it folded and also opts out of Reasoning's auto-open, so
 * replaying a transcript cannot spring one open on its own.
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
import { Shimmer } from '@/components/ui/shimmer';
import { typography } from '@/constants/theme';
import { asColor } from '@/utils/colors';

interface ThinkingSectionProps {
  content: string;
  /** Whether the trace is still arriving. Drives the shimmer and the timer. */
  streaming?: boolean;
}

export function ThinkingSection({ content, streaming = false }: ThinkingSectionProps) {
  // Literal colour for ThemedText's `color` prop.
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);

  if (!content) return null;

  return (
    <View className="mb-1 px-4">
      <Reasoning
        isStreaming={streaming}
        // Undefined while live, so Reasoning's own rule applies and the panel
        // opens on the way in. Explicitly false once finished, which both
        // folds it and opts out of that auto-open.
        defaultOpen={streaming ? undefined : false}
        className="w-auto max-w-[85%] self-start gap-0 border-l-2 border-l-primary bg-muted"
      >
        <Reasoning.Trigger
          className="gap-1 px-2 py-1"
          // Overriding `label` costs the trigger its built-in shimmer, so the
          // live half puts it back explicitly. Same `Shimmer` the agent status
          // line uses, so "still working" reads the same everywhere.
          label={(isStreaming, duration) =>
            isStreaming ? (
              <Shimmer textStyle={typography.labelSm}>Thinking</Shimmer>
            ) : (
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                {duration ? `Thought for ${duration}s` : 'Thinking'}
              </ThemedText>
            )
          }
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
