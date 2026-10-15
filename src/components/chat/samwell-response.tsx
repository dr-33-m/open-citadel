import React from "react";
import { View } from "react-native";

import { AssistantContent } from "@/components/chat/assistant-content";
import { SourceList } from "@/components/chat/source-list";
import { TurnTrail } from "@/components/chat/turn-trail";
import type { TurnActivity } from "@/utils/turn-activity";

interface SamwellResponseProps {
  content: string;
  streaming?: boolean;
  activity?: TurnActivity | null;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToBook?: (bookId: string) => void;
}

/**
 * A reply from Samwell, laid out on the page rather than in a bubble.
 *
 * Three parts, top to bottom, each only when it has something to show:
 *
 * - **The trail**: what he did to get there, a step to a row (`TurnTrail`).
 *   Live while the turn runs, so a search or a library lookup is visible as
 *   it happens; kept with the reply afterwards.
 * - **The answer**: his words, the full width of the column, with the books
 *   and highlights his markers name drawn in place (`AssistantContent`).
 * - **The sources**: the web pages a search found, folded under a count
 *   (`SourceList`). Once the reply is finished, so the fold does not ride
 *   down the screen as the text grows above it.
 *
 * A thin gold rule down the left edge says whose words these are, which the
 * bubble's tint used to say, without boxing the text in.
 */
export const SamwellResponse = React.memo(function SamwellResponse({
  content,
  streaming,
  activity,
  onNavigateToHighlight,
  onNavigateToTimeline,
  onNavigateToBook,
}: SamwellResponseProps) {
  const steps = activity?.steps ?? NO_STEPS;
  const sources = streaming ? NO_SOURCES : (activity?.sources ?? NO_SOURCES);
  const hasText = content.trim().length > 0;

  return (
    <View className="border-s-2 border-primary/60 ps-3">
      <TurnTrail steps={steps} />
      {hasText ? (
        <AssistantContent
          content={content}
          streaming={streaming}
          onNavigateToHighlight={onNavigateToHighlight}
          onNavigateToTimeline={onNavigateToTimeline}
          onNavigateToBook={onNavigateToBook}
        />
      ) : null}
      <SourceList sources={sources} />
    </View>
  );
});

const NO_STEPS: never[] = [];
const NO_SOURCES: never[] = [];
