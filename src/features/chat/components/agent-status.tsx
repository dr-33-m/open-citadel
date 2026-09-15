/**
 * The live "Samwell is doing something" line.
 *
 * Was an icon in a grey pill: a lucide magnifier or sparkle at 14px, a label,
 * and a `bg-muted` box around the pair. Three problems, and the box was the
 * loudest — a filled rectangle under one line of text reads as a *message*,
 * so a transient status sat in the transcript looking like something Samwell
 * had said and left behind. The icon was the second: one glyph for every tool,
 * pulsing, which says "busy" and nothing more.
 *
 * Now it is the orb and the sentence, on the page ground. The orb's motion
 * carries the kind of work and the shimmer carries that it is still running,
 * so the two say the same thing in two registers and neither needs a
 * container to be legible.
 */
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Shimmer } from '@/components/ui/shimmer';
import { ThinkingOrb } from '@/components/ui/thinking-orb';
import { typography } from '@/constants/theme';
import type { AgentActivity } from '@/features/chat/utils/agent-activity';
import { asColor } from '@/utils/colors';

/**
 * Small enough that the orb reads as punctuation to the line rather than as a
 * figure beside it, and under the 32px cutoff where the orb swaps to its
 * few-large-dots tuning — which is the one that survives at this size.
 */
const ORB_SIZE = 20;

export function AgentStatus({ activity }: { activity: AgentActivity }) {
  const primary = useCSSVariable('--color-primary');

  return (
    <View
      className="mb-1 flex-row items-center gap-2 px-4"
      // One live region for the pair, so a screen reader announces "Searching
      // through highlights" once instead of reading the orb's own role label
      // and then the text.
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={activity.label}
    >
      <ThinkingOrb
        state={activity.orb}
        size={ORB_SIZE}
        color={asColor(primary)}
        // The row above already announces the sentence, which is more
        // specific than the orb's per-state word.
        importantForAccessibility="no-hide-descendants"
      />
      <Shimmer
        // `Shimmer` styles its own text, so the type scale is handed over
        // rather than wrapped around it — a `ThemedText` inside would be
        // masked by the sweep and lose its colour.
        textStyle={typography.bodySm}
      >
        {activity.label}
      </Shimmer>
    </View>
  );
}
