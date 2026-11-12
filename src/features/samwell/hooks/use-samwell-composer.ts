import React from 'react';

import { TOOLBOX_SETTLE } from '@/components/samwell/samwell-toolbox';
import { useChatSessions } from '@/features/chat/hooks/use-chat-sessions';
import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { composerInput } from '@/features/samwell/handles';
import { useCompassErrorToast } from '@/features/samwell/hooks/use-compass-error-toast';
import { useSamwellToolbox } from '@/features/samwell/hooks/use-samwell-toolbox';
import { useChatStore } from '@/stores/chat';
import { useCompassStore } from '@/stores/compass';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useSamwellUiStore } from '@/stores/samwell-ui';

/**
 * The floating card you type into and the drawer of tools under it.
 *
 * The draft lives here and nowhere else on the page, so a keystroke redraws
 * the card and not the transcript above it. The send reads the draft when it
 * runs instead of closing over it, which keeps it stable through typing.
 */
export function useSamwellComposer() {
  const text = useSamwellSessionStore((s) => s.draft);
  const setSession = useSamwellSessionStore((s) => s.set);
  const readiness = useSamwellReadiness();
  const { send, newChat } = useChatSessions();

  const isGenerating = useChatStore((s) => s.isGenerating);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const chatSwitching = useSamwellUiStore((s) => s.chatSwitching);
  // Approving a goal writes it; the field holds until that lands.
  const committing = useCompassStore((s) => s.committing);
  useCompassErrorToast();

  const toolboxOpen = useSamwellUiStore((s) => s.toolboxOpen);
  // Read once here and handed down: the drawer's hooks would otherwise each
  // subscribe to the same dozen fields again.
  const toolbox = useSamwellToolbox(readiness);

  const setText = React.useCallback((next: string) => setSession({ draft: next }), [setSession]);

  const onSend = React.useCallback(() => {
    const trimmed = useSamwellSessionStore.getState().draft.trim();
    if (trimmed.length === 0) return;
    setSession({ draft: '' });
    void send(trimmed);
  }, [setSession, send]);

  /*
   * The handle ignores a second press while the drawer is still settling.
   * Opening lifts the card by the drawer's height, so the handle jumps out from
   * under the finger, and a press before the eye has caught up is a bounce, not
   * a decision. See `TOOLBOX_SETTLE` for the number.
   */
  const settledAt = React.useRef(0);
  const onToggleToolbox = React.useCallback(() => {
    const now = Date.now();
    if (now < settledAt.current) return;
    settledAt.current = now + TOOLBOX_SETTLE;
    const ui = useSamwellUiStore.getState();
    ui.setToolboxOpen(!ui.toolboxOpen);
  }, []);

  const startNewChat = React.useCallback(() => void newChat(), [newChat]);
  // Held back mid-turn, as History is: leaving would cut the reply off.
  const held = isGenerating || chatSwitching != null;

  return {
    controlCenter: {
      toolboxOpen,
      onToggleToolbox,
      inputRef: composerInput,
      text,
      onChangeText: setText,
      onSend,
      // The input also holds while the model is not ready; the activity
      // indicator does not, since there is nothing to wait for then.
      busy: isGenerating || committing || !readiness.ready || readiness.loading,
      showStop: isGenerating,
      onStop: stopGeneration,
      placeholder: 'Message Samwell…',
      onNewChat: held ? undefined : startNewChat,
    },
    toolbox: { open: toolboxOpen, ...toolbox },
  };
}
