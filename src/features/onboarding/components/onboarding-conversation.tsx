import React from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth } from '@/constants/theme';
import {
  OnboardingComposer,
  type OnboardingPhase,
} from '@/features/onboarding/components/onboarding-composer';
import { OnboardingTranscript } from '@/features/onboarding/components/onboarding-transcript';
import { turnIndicator } from '@/features/chat/utils/agent-activity';
import { OPENING_MESSAGE, useOnboardingChatStore } from '@/stores/onboarding-chat';
import { useSettingsStore } from '@/stores/settings';
import { asColor } from '@/utils/colors';

/** Centred and capped on wide screens, pixel-identical on phones. */
const COLUMN = {
  maxWidth: MaxContentWidth,
  width: '100%',
  alignSelf: 'center',
} as const;

/**
 * The concierge conversation itself.
 *
 * Split out of `OnboardingScreen` for a reason beyond length. Every streaming
 * subscription lives here, and a reply writes to that store on every token —
 * so with this inline, the stage machine above (which owns the welcome screen,
 * the sign-in sheet, and the decision between them) re-rendered once per token
 * for state it does not read. Now the tokens stop at this boundary.
 */
export function OnboardingConversation({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);

  const [draft, setDraft] = React.useState('');
  /*
   * A press has been made and the store has not caught up yet.
   *
   * `send` on the store does real work before it sets `submitting`: it resolves
   * or creates the session, writes the setup notes, and asks the server whether
   * the free grant is still open. Reading busy-ness off `submitting` alone left
   * GET STARTED looking untouched through all of that, which is exactly the
   * "clicking things that talk to the server just makes you stare" complaint.
   */
  const [sending, setSending] = React.useState(false);

  // Field by field: a streaming reply writes to this store on every token, and
  // the whole-store form would re-render the header and composer with it.
  const sessionId = useOnboardingChatStore((s) => s.sessionId);
  const messages = useOnboardingChatStore((s) => s.messages);
  const submitting = useOnboardingChatStore((s) => s.submitting);
  const streamingReply = useOnboardingChatStore((s) => s.streamingReply);
  const streamingThinking = useOnboardingChatStore((s) => s.streamingThinking);
  const streamingThinkingSeconds = useOnboardingChatStore((s) => s.streamingThinkingSeconds);
  const lastStreamedMessageId = useOnboardingChatStore((s) => s.lastStreamedMessageId);
  const toolStatus = useOnboardingChatStore((s) => s.toolStatus);
  const toolName = useOnboardingChatStore((s) => s.toolName);
  const error = useOnboardingChatStore((s) => s.error);

  const onboarding = useSettingsStore((s) => s.onboarding);

  const busy = submitting || sending;
  const said = messages.some((m) => m.role === 'user');

  /*
   * Where the conversation is, derived rather than stored.
   *
   * `done` reads the same settings flag the router reads, so there is exactly
   * one answer to "is onboarding over" — `finish_onboarding` writes it, and
   * both this composer and `app/index` see the same thing. A `phase` field in
   * the chat store would have been a second copy of that fact, free to
   * disagree with the first.
   *
   * `!busy` on that branch matters. `finish_onboarding` runs mid-turn, so the
   * flag flips while Samwell's goodbye is still streaming. Without it the
   * composer swaps to GO TO MY LIBRARY over the top of a reply still arriving,
   * and takes the stop button away with it.
   *
   * `said` and NOT `busy` decides the other branch, which is the opposite
   * mistake and worth naming. Pressing GET STARTED puts the store to work for
   * a second or so — a session to create, a grant to ask the server about —
   * and keying on `busy` swapped the button out for a text field and a stop
   * square before a word had been said. The stop square did nothing, because
   * there was no request to stop yet. Staying on `start` and letting the
   * button show its own spinner is the honest report: the press landed, and
   * nothing else has happened yet.
   */
  const phase: OnboardingPhase =
    onboarding === 'done' && !busy ? 'done' : said ? 'talking' : 'start';

  /*
   * Keyed on primitives rather than rebuilt bare. A fresh indicator object per
   * render would re-render the status row on every streamed token for a value
   * that mostly has not changed.
   */
  const isStreamingText = streamingReply.length > 0;
  const isThinking = streamingThinking.length > 0;
  const indicator = React.useMemo(
    () =>
      turnIndicator({
        isGenerating: submitting,
        isToolCalling: toolStatus !== null,
        toolCallName: toolName,
        toolCallStatus: toolStatus,
        isThinking,
        isStreaming: isStreamingText,
        trace: streamingThinking,
        traceSeconds: streamingThinkingSeconds ?? undefined,
      }),
    [
      submitting,
      toolStatus,
      toolName,
      isThinking,
      isStreamingText,
      streamingThinking,
      streamingThinkingSeconds,
    ],
  );

  const send = React.useCallback(async (text: string) => {
    setDraft('');
    setSending(true);
    try {
      await useOnboardingChatStore.getState().send(text);
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1" style={COLUMN}>
        {/* No back button and no settings cog. There is nowhere to go back to,
            and Settings is a screen about an app they have not been shown
            yet. */}
        <View className="border-b border-border px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
          <ThemedText type="headlineSm">Concierge onboarding</ThemedText>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Samwell is setting you up.
          </ThemedText>
        </View>

        <OnboardingTranscript
          sessionId={sessionId}
          messages={messages}
          streamingReply={streamingReply}
          indicator={indicator}
          lastStreamedMessageId={lastStreamedMessageId}
        />

        {error && (
          <View className="px-4 pb-2">
            <ThemedText type="bodySm" color={asColor(destructive)}>
              {error}
            </ThemedText>
          </View>
        )}

        <OnboardingComposer
          phase={phase}
          value={draft}
          onChangeText={setDraft}
          onStart={() => void send(OPENING_MESSAGE)}
          onSend={() => void send(draft)}
          onStop={() => useOnboardingChatStore.getState().stop()}
          onFinish={onDone}
          busy={busy}
          bottomInset={insets.bottom}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
