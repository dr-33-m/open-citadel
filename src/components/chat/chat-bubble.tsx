import React from "react";
import type { View } from "react-native";
import Animated, { FadeInUp, useReducedMotion } from "react-native-reanimated";
import { useCSSVariable } from "uniwind";

import { SamwellResponse } from "@/components/chat/samwell-response";
import { ThemedText } from "@/components/themed-text";
import { Message } from "@/components/ui/message";
import { easing, fontFamily, motion } from "@/constants/theme";
import { asColor } from "@/utils/colors";
import { haptics } from "@/utils/haptics";
import type { HeldMessage } from "@/hooks/use-message-actions";
import type { TurnActivity, TurnStep, TurnThought } from "@/utils/turn-activity";
import type { WebSource } from "samwell-shared";
import type { PodcastCardKind } from '@/services/listening-tools/card';

/** New turns rise and fade in rather than popping into the list —
 * fires once per instance, so it plays for a freshly-sent or
 * freshly-streamed-in message and for one scrolled into view for the
 * first time, not on every re-render. Only played where a caller opts
 * in (`animateEntry`) with Reduce Motion off — a recycled list row must
 * never replay an entrance. */
const turnEntering = FadeInUp.duration(motion.base).easing(easing);

/** The row's own rhythm in the transcript, shared by both kinds of turn. */
const ROW_CLASS = "mb-1 px-4";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** Samwell's turns only: what he did on the way to the reply, and its sources. */
  activity?: TurnActivity | null;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToBook?: (bookId: string) => void;
  onNavigateToPodcast?: (kind: PodcastCardKind, id: string) => void;
  /** Samwell's turns only: raises the conversation's sources sheet. */
  onOpenSources?: (sources: readonly WebSource[]) => void;
  /** Samwell's turns only: raises the conversation's thought sheet. */
  onOpenThought?: (thought: TurnThought) => void;
  /** Samwell's turns only: raises the conversation's tasks sheet. */
  onOpenTasks?: (steps: readonly TurnStep[]) => void;
  /** Samwell's cloud turns only: raises the conversation's privacy sheet. */
  onOpenPrivacy?: () => void;
  /** The reader's turns only: the message's id, handed back when it is held. */
  messageId?: string;
  /** The reader's turns only: a long press on the bubble (`useMessageActions`). */
  onHold?: (message: HeldMessage) => void;
  /** Play the rise-and-fade entrance. Off by default: the per-session chat
   * renders bubbles in a recycled FlashList, where replaying the entrance
   * on recycled rows violates the no-entering-on-recycled-rows motion law —
   * only callers whose transcript is a plain, non-recycled ScrollView opt
   * in. Skipped under Reduce Motion regardless. */
  animateEntry?: boolean;
}

/**
 * One turn of a conversation.
 *
 * The reader's words sit in a bubble at the end of the row. Samwell's do not:
 * a reply is laid out on the page at the column's full width, the way PanelUI's
 * `Response` draws an answer, with what he did above it and the pages it drew
 * on under it (`SamwellResponse`). A reply is something to read, often at
 * length, and a tinted box two thirds of the screen wide made every long one a
 * narrow column of text.
 */
export const ChatBubble = React.memo(function ChatBubble({
  role,
  content,
  streaming,
  activity,
  onNavigateToHighlight,
  onNavigateToTimeline,
  onNavigateToBook,
  onNavigateToPodcast,
  onOpenSources,
  onOpenThought,
  onOpenTasks,
  onOpenPrivacy,
  messageId,
  onHold,
  animateEntry,
}: ChatBubbleProps) {
  // Literal colour for ThemedText's `color` prop — the streaming cursor only;
  // everything else reads its colour from Message's align-driven classes.
  const [mutedForeground] = useCSSVariable(["--color-muted-foreground"]);
  // Reduce Motion collapses the spatial entrance to nothing — content just
  // appears (opacity-only cross-fades remain the reduced-motion vocabulary
  // elsewhere).
  const reduceMotion = useReducedMotion();
  const entering = animateEntry && !reduceMotion ? turnEntering : undefined;

  // Measured when held, not kept: the bubble moves as the transcript scrolls,
  // and the actions rise out of wherever it is now. The bubble, not the row
  // Message holds by, which is the column's full width.
  const bubbleRef = React.useRef<View>(null);
  const hold = React.useCallback(() => {
    if (!onHold || !messageId) return;
    // The thump is what says the hold registered, before anything rises.
    haptics.commit();
    bubbleRef.current?.measureInWindow((x, y, width, height) => onHold({ id: messageId, content, rect: { x, y, width, height } }));
  }, [onHold, messageId, content]);
  const holdable = onHold != null && messageId != null;

  if (role === "assistant") {
    return (
      <Animated.View entering={entering} className={ROW_CLASS}>
        <SamwellResponse
          content={content}
          streaming={streaming}
          activity={activity}
          onNavigateToHighlight={onNavigateToHighlight}
          onNavigateToTimeline={onNavigateToTimeline}
          onNavigateToBook={onNavigateToBook}
          onNavigateToPodcast={onNavigateToPodcast}
          onOpenSources={onOpenSources}
          onOpenThought={onOpenThought}
          onOpenTasks={onOpenTasks}
          onOpenPrivacy={onOpenPrivacy}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={entering} className={ROW_CLASS}>
      <Message
        align="end"
        onLongPress={holdable ? hold : undefined}
        accessibilityHint={holdable ? "Hold to copy it, or to send it again if it failed" : undefined}
      >
        <Message.Content>
          <Message.Bubble ref={bubbleRef} className="border-e-2 border-muted-foreground/50 bg-muted">
            <Message.BubbleContent
              className="text-foreground"
              style={USER_TEXT}
            >
              {content}
              {streaming && (
                <ThemedText type="bodyMd" color={asColor(mutedForeground)}>
                  {" ▍"}
                </ThemedText>
              )}
            </Message.BubbleContent>
          </Message.Bubble>
        </Message.Content>
      </Message>
    </Animated.View>
  );
});

const USER_TEXT = { fontFamily: fontFamily.sans, lineHeight: 22 };
