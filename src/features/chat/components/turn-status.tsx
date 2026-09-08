/**
 * The one live row under a transcript while a turn is in flight.
 *
 * There is never more than one. Two shapes feed it:
 *
 * - `activity` — the plain orb-and-label row. The wait before the first
 *   token, or a tool running on a model that does not reason. This is the
 *   whole story on a non-reasoning model and it has to read well there.
 * - `trace` — the reasoning panel. Once a model has started thinking this is
 *   the only row for the rest of the turn: a tool call in the middle folds
 *   its own orb and label into this panel's trigger instead of stacking a
 *   second row, and the panel never unmounts, so its "thought for how long"
 *   clock survives the tool call.
 *
 * Both chat surfaces and Compass render this and nothing else for the footer.
 *
 * Memoized because all three of them re-render it on every streamed token,
 * and its one prop is already built inside a `useMemo` keyed on the handful of
 * primitives that actually describe the turn. So for a whole paragraph of
 * streaming text the prop does not move at all, and without the memo the orb,
 * the shimmer and the reasoning panel were rebuilt for every word of it.
 */
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Reasoning } from '@/components/ui/reasoning';
import { Shimmer } from '@/components/ui/shimmer';
import { ThinkingOrb } from '@/components/ui/thinking-orb';
import { AgentStatus } from '@/features/chat/components/agent-status';
import type { TurnIndicator } from '@/features/chat/utils/agent-activity';
import { asColor } from '@/utils/colors';

/** Matches the orb in `AgentStatus`, so the two rows are the same height. */
const ORB_SIZE = 20;

export const TurnStatus = React.memo(function TurnStatus({
  indicator,
}: {
  indicator: TurnIndicator | null;
}) {
  if (!indicator) return null;
  if (indicator.kind === 'activity') return <AgentStatus activity={indicator.activity} />;
  return <TraceRow indicator={indicator} />;
});

function TraceRow({
  indicator,
}: {
  indicator: Extract<TurnIndicator, { kind: 'trace' }>;
}) {
  const primary = useCSSVariable('--color-primary');
  const tool = indicator.toolActivity;

  return (
    <View className="mb-1 px-4">
      <Reasoning
        isStreaming={indicator.active}
        duration={indicator.seconds}
        defaultOpen={false}
      >
        <Reasoning.Trigger
          // A tool running mid-reasoning takes over the trigger: its own orb
          // shape, its own words. Otherwise the panel's built-in "Thinking…"
          // / "Thought for 2m 20s" stands.
          icon={
            tool ? (
              <ThinkingOrb
                state={tool.orb}
                size={ORB_SIZE}
                paused={false}
                color={asColor(primary)}
                importantForAccessibility="no-hide-descendants"
              />
            ) : undefined
          }
          label={
            tool
              ? () => (
                  <Shimmer textClassName="text-sm text-muted-foreground">
                    {tool.label}
                  </Shimmer>
                )
              : undefined
          }
        />
        <Reasoning.Content>{indicator.trace}</Reasoning.Content>
      </Reasoning>
    </View>
  );
}
