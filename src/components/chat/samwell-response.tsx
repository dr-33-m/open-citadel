import React from "react";
import { View } from "react-native";

import { AssistantContent } from "@/components/chat/assistant-content";
import { CopyReplyButton } from "@/components/chat/copy-reply-button";
import { PrivacyButton } from "@/components/chat/privacy-button";
import { SourceStack } from "@/components/chat/source-stack";
import { TasksButton } from "@/components/chat/tasks-button";
import { ThoughtButton } from "@/components/chat/thought-button";
import { TurnTrail } from "@/components/chat/turn-trail";
import type { TurnActivity, TurnStep, TurnThought } from "@/utils/turn-activity";
import type { WebSource } from "samwell-shared";

interface SamwellResponseProps {
  content: string;
  streaming?: boolean;
  activity?: TurnActivity | null;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToBook?: (bookId: string) => void;
  /** Raises the sheet listing every web page the reply drew on. Without it, no sources are shown. */
  onOpenSources?: (sources: readonly WebSource[]) => void;
  /** Raises the sheet with what he thought before answering. Without it, no thought is shown. */
  onOpenThought?: (thought: TurnThought) => void;
  /** Raises the sheet with every step he took. Without it, the finished steps are not shown. */
  onOpenTasks?: (steps: readonly TurnStep[]) => void;
  /** Raises the sheet on zero data retention. Only a reply from the cloud gets it. */
  onOpenPrivacy?: () => void;
}

/** The faint rule between the parts, so the answer reads apart from the work and the pages around it. */
const DIVIDER = "border-border/60";
const TRAIL_RULED = `mb-3 border-b pb-3 ${DIVIDER}`;
const FOOTER = "flex-row items-center gap-4";
const FOOTER_RULED = `${FOOTER} mt-3 border-t pt-3 ${DIVIDER}`;
const FOOTER_PLAIN = `${FOOTER} mt-2`;

/**
 * A reply from Samwell, laid out on the page rather than in a bubble.
 *
 * - **While he works**: the step he is on, above the reply as it forms
 *   (`TurnTrail live`), one row that each new step takes over.
 * - **The answer**: his words, the full width of the column, with the books
 *   and highlights his markers name drawn in place (`AssistantContent`).
 * - **The footer**, once the reply is finished (so the row does not ride
 *   down the screen as the text grows above it): copy the reply
 *   (`CopyReplyButton`), what he thought on the way (`ThoughtButton`), the
 *   steps he took (`TasksButton`), then the web pages a search found
 *   (`SourceStack`). Each of the last three opens a sheet of its own. At
 *   the far end, on a reply from the cloud, a green shield that says what
 *   happens to what was said (`PrivacyButton`).
 *
 * A faint rule under the live step and another over a footer that carries
 * his work keep the answer apart from them, each only where there is
 * something on both sides of it.
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
  onOpenSources,
  onOpenThought,
  onOpenTasks,
  onOpenPrivacy,
}: SamwellResponseProps) {
  const steps = activity?.steps ?? NO_STEPS;
  const finished = !streaming;
  const sources = finished && onOpenSources ? (activity?.sources ?? NO_SOURCES) : NO_SOURCES;
  const hasText = content.trim().length > 0;
  const liveStep = streaming === true && steps.length > 0;
  const hasTasks = finished && onOpenTasks != null && steps.length > 0;
  const hasSources = sources.length > 0;
  const copyable = hasText && finished;
  const thought = finished && onOpenThought ? activity?.thought : undefined;
  const shielded = finished && hasText && onOpenPrivacy != null;
  const hasFooter = copyable || hasSources || hasTasks || thought != null || shielded;
  // Ruled over his work (the steps, the pages) when an answer sits above it;
  // a copy button or a thought alone is part of the reply, not a section.
  const footerClass = hasText ? ((hasSources || hasTasks) ? FOOTER_RULED : FOOTER_PLAIN) : FOOTER;

  return (
    <View className="border-s-2 border-primary/60 ps-3">
      {liveStep ? (
        <View className={hasText ? TRAIL_RULED : undefined}>
          <TurnTrail steps={steps} live />
        </View>
      ) : null}
      {hasText ? (
        <AssistantContent
          content={content}
          streaming={streaming}
          onNavigateToHighlight={onNavigateToHighlight}
          onNavigateToTimeline={onNavigateToTimeline}
          onNavigateToBook={onNavigateToBook}
        />
      ) : null}
      {hasFooter ? (
        <View className={footerClass}>
          {copyable ? <CopyReplyButton content={content} /> : null}
          {thought && onOpenThought ? <ThoughtButton thought={thought} onOpen={onOpenThought} /> : null}
          {hasTasks && onOpenTasks ? <TasksButton steps={steps} onOpen={onOpenTasks} /> : null}
          {hasSources && onOpenSources ? <SourceStack sources={sources} onOpen={onOpenSources} /> : null}
          {shielded && onOpenPrivacy ? <PrivacyButton onOpen={onOpenPrivacy} /> : null}
        </View>
      ) : null}
    </View>
  );
});

const NO_STEPS: never[] = [];
const NO_SOURCES: never[] = [];
