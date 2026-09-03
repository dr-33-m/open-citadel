/**
 * TurnStatus — the one row that reports a turn while it happens.
 *
 * Thinking and tool work used to be two separate rows that took turns on
 * screen, and the taking turns was the bug: once a trace existed, the footer
 * rules showed the trace forever, so the orb that named the tool never got its
 * turn back and a mid-turn search looked like it had vanished. On a reasoning
 * model the phases interleave — think, call, think again — so there is really
 * one thing on screen the whole time: a row whose orb changes shape and whose
 * label changes words. This is that row.
 *
 * With a trace it is a Reasoning row whose icon is the orb, so there are not
 * two states to glance between (an orb row *and* a thinking row): the same row
 * folds open to the trace and folds back to "Thought for 12s" when the answer
 * starts. It sits below the streaming bubble, which is where it ends up once
 * the turn is history, so the handover from thinking to writing moves nothing.
 *
 * Default closed. The shimmer and the orb say work is happening; opening the
 * trace is the reader's call, at any point, even mid-stream.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Reasoning } from '@/components/ui/reasoning';
import { Shimmer } from '@/components/ui/shimmer';
import { ThinkingOrb } from '@/components/ui/thinking-orb';
import { typography } from '@/constants/theme';
import { AgentStatus } from '@/features/chat/components/agent-status';
import type { AgentActivity } from '@/features/chat/utils/agent-activity';
import { asColor } from '@/utils/colors';

/**
 * Same size as the AgentStatus orb, and under the 32px cutoff where the orb
 * swaps to its few-large-dots tuning — the one that survives at this size.
 */
const ORB_SIZE = 20;

interface TurnStatusProps {
  /** The reasoning trace so far. Empty when the model has produced none. */
  trace: string;
  /** True while the trace itself is still arriving. */
  traceActive: boolean;
  /** What the turn is doing right now, from `agentActivity`. Null when idle.
   *  Memoized below on these three props, so callers must hand it a stable
   *  object (the call sites keep theirs in `useMemo` keyed on primitives) —
   *  otherwise a fresh object per streamed token defeats the memo. */
  activity: AgentActivity | null;
}

export const TurnStatus = React.memo(function TurnStatus({ trace, traceActive, activity }: TurnStatusProps) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  /*
   * The trace text only mounts once the reader has opened the row. While it is
   * folded and streaming it would otherwise re-lay-out the whole growing string
   * on every throttled update for nobody — a minute-long trace got long enough
   * to stall the JS thread, which is the "Compass hangs" report.
   */
  const [everOpened, setEverOpened] = useState(false);

  if (!trace && !activity) return null;
  if (!trace) return <AgentStatus activity={activity!} />;

  // A tool running mid-trace outranks the thinking shimmer: the row names the
  // work in flight, and the trace is still there behind the fold.
  const live = traceActive || activity !== null;
  const orbState = activity?.orb ?? 'solving';

  return (
    <View className="mb-1 px-4">
      <Reasoning
        isStreaming={traceActive}
        // Closed by default, and `false` also opts out of the auto-open, so
        // the reader can fold and unfold it at any point of the turn.
        defaultOpen={false}
        onOpenChange={(open) => {
          if (open) setEverOpened(true);
        }}
        className="w-auto max-w-[85%] self-start gap-0 border-l-2 border-l-primary bg-muted"
      >
        <Reasoning.Trigger
          className="gap-2 px-2 py-1"
          icon={
            <ThinkingOrb
              state={orbState}
              size={ORB_SIZE}
              paused={!live}
              color={asColor(live ? primary : mutedForeground)}
              importantForAccessibility="no-hide-descendants"
            />
          }
          label={(streaming, duration) =>
            activity ? (
              <Shimmer textStyle={typography.bodySm}>{activity.label}</Shimmer>
            ) : streaming ? (
              <Shimmer textStyle={typography.labelSm}>Thinking</Shimmer>
            ) : (
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                {/* Reached finished without a measurement only when the trace
                    arrived in one piece (the offline path sets it once), so
                    there is no number to give. */}
                {duration ? `Thought for ${duration}s` : 'Thought for a few seconds'}
              </ThemedText>
            )
          }
        />
        <Reasoning.Content className="ps-2 pe-2 pb-2">
          {everOpened ? (
            <ThemedText
              type="bodySm"
              color={asColor(mutedForeground)}
              style={{ fontSize: 13, lineHeight: 20 }}
            >
              {trace}
            </ThemedText>
          ) : null}
        </Reasoning.Content>
      </Reasoning>
    </View>
  );
});
