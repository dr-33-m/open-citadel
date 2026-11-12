import React from 'react';

import { contentColumn } from '@/constants/theme';
import { useChatSessions } from '@/features/chat/hooks/use-chat-sessions';
import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { useSamwellStatus } from '@/features/chat/hooks/use-samwell-status';
import { turnIndicator } from '@/features/chat/utils/agent-activity';
import { useCompassDraft } from '@/features/compass/hooks/use-compass-draft';
import { composerInput } from '@/features/samwell/handles';
import { useEpisodeTimePlayer, useSamwellAttachment } from '@/features/samwell/hooks/use-samwell-attachment';
import { useFloatingClearance } from '@/features/samwell/hooks/use-floating-clearance';
import { useSamwellRoutes } from '@/features/samwell/hooks/use-samwell-routes';
import { isVisibleChatMessage } from '@/services/chat-transcript';
import { useChatStore } from '@/stores/chat';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useSamwellUiStore } from '@/stores/samwell-ui';

/**
 * The conversation's transcript, and everything it draws from.
 *
 * The one part of the Samwell page that redraws on every streamed token,
 * because it is the part that shows them. Its subscriptions used to sit on
 * the page itself, so each token redrew the header, the composer, the toolbox
 * and every sheet with it; here they redraw this and nothing else.
 */
export function useChatTranscriptRegion(keyboardOffset: number) {
  const routes = useSamwellRoutes();
  const { newChat, resend } = useChatSessions();
  const startNewChat = React.useCallback(() => void newChat(), [newChat]);
  const readiness = useSamwellReadiness();
  const status = useSamwellStatus({
    readiness,
    onOpenSettings: routes.samwellSettings,
    onOpenPlans: routes.plans,
    onOpenAccount: routes.account,
    onNewChat: startNewChat,
  });

  const sessionId = useChatStore((s) => s.activeSession?.id ?? null);
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const isThinking = useChatStore((s) => s.isThinking);
  const isToolCalling = useChatStore((s) => s.isToolCalling);
  const toolCallStatus = useChatStore((s) => s.toolCallStatus);
  const toolCallName = useChatStore((s) => s.toolCallName);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamingActivity = useChatStore((s) => s.streamingActivity);
  const thinkingContent = useChatStore((s) => s.thinkingContent);
  const thinkingSeconds = useChatStore((s) => s.thinkingSeconds);
  const titleRefreshing = useChatStore((s) => s.titleRefreshing);
  const queuedBehindTitle = useChatStore((s) => s.queuedBehindTitle);
  const lastStreamedMessageId = useChatStore((s) => s.lastStreamedMessageId);
  const opening = useSamwellSessionStore((s) => s.opening);
  const pendingUserMessage = useSamwellUiStore((s) => s.pendingUserMessage);

  const visibleMessages = React.useMemo(() => messages.filter(isVisibleChatMessage), [messages]);

  // `isGenerating` alone is not "waiting for a reply": it stays true after the
  // reply has landed while the engine names a fresh bookless chat. The generic
  // wait is suppressed then, and the titling activity owns it.
  const lastRole = visibleMessages[visibleMessages.length - 1]?.role;
  const waiting = (isGenerating && lastRole !== 'assistant') || titleRefreshing;
  const isStreamingText = streamingContent.length > 0;
  // Keyed on primitives: it rides into the transcript's memoized rows, and a
  // fresh object per token would defeat them.
  const indicator = React.useMemo(
    () =>
      turnIndicator({
        isGenerating: waiting,
        isTitling: titleRefreshing,
        isQueued: queuedBehindTitle,
        isToolCalling,
        toolCallName,
        toolCallStatus,
        isThinking,
        isStreaming: isStreamingText,
        trace: thinkingContent,
        traceSeconds: thinkingSeconds ?? undefined,
      }),
    [waiting, titleRefreshing, queuedBehindTitle, isToolCalling, toolCallName, toolCallStatus, isThinking, isStreamingText, thinkingContent, thinkingSeconds],
  );

  const floatingClearance = useFloatingClearance();

  const { episode } = useSamwellAttachment();
  const playEpisodeTime = useEpisodeTimePlayer(episode);
  // Refining a card puts the cursor in the composer, under the card.
  const compassDraft = useCompassDraft(composerInput);

  return {
    playEpisodeTime,
    compassDraft,
    transcript: {
      opening,
      sessionId,
      messages: visibleMessages,
      streamingContent,
      streamingActivity,
      isGenerating,
      indicator,
      lastStreamedMessageId,
      status,
      pendingUserMessage,
      contentColumn,
      floatingClearance,
      keyboardOffset,
      onNavigateToHighlight: routes.highlight,
      onNavigateToTimeline: routes.timeline,
      onNavigateToBook: routes.book,
      onNavigateToPodcast: routes.podcast,
      onResendMessage: resend,
    },
  };
}
