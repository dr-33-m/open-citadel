import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { TextInput } from 'react-native';
import type { CompassChatMessage, CompassMorningAnalysis, CompassNightAnalysis } from 'samwell-shared';

import { CompassChat } from '@/components/compass/compass-chat';
import { MorningDraftCard, NightDraftCard } from '@/components/compass/draft-cards';
import { useCompassStore } from '@/stores/compass';

const OPENERS = {
  morning:
    "Tell me the plan for today. Say it however it comes; we will shape it together before you log it.",
  night:
    "How did today actually run? Tell it straight, including anything that pulled you off course.",
} as const;

function buildTranscript(messages: CompassChatMessage[]): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'Me' : 'Samwell'}: ${m.content}`)
    .join('\n\n');
}

export default function CompassCheckinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: 'morning' | 'night' = params.kind === 'night' ? 'night' : 'morning';

  const { submitting, error, sendMorningTurn, sendNightTurn, finalizeMorning, finalizeNight } =
    useCompassStore();
  const inputRef = useRef<TextInput | null>(null);

  const [messages, setMessages] = useState<CompassChatMessage[]>([]);
  const [morningDraft, setMorningDraft] = useState<CompassMorningAnalysis | null>(null);
  const [nightDraft, setNightDraft] = useState<CompassNightAnalysis | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  async function runTurn(msgs: CompassChatMessage[]) {
    if (kind === 'morning') {
      const turn = await sendMorningTurn(msgs);
      if (turn) {
        setMessages([...msgs, { role: 'assistant', content: turn.reply }]);
        setMorningDraft(turn.draft);
      }
    } else {
      const turn = await sendNightTurn(msgs);
      if (turn) {
        setMessages([...msgs, { role: 'assistant', content: turn.reply }]);
        setNightDraft(turn.draft);
      }
    }
  }

  async function handleSend(text: string) {
    const next: CompassChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setMorningDraft(null);
    setNightDraft(null);
    await runTurn(next);
  }

  function handleRetry() {
    if (messages.length === 0) return;
    setMorningDraft(null);
    setNightDraft(null);
    void runTurn(messages);
  }

  async function handleApprove() {
    const transcript = buildTranscript(messages);
    setFinalizing(true);
    let ok = false;
    if (kind === 'morning' && morningDraft) {
      ok = await finalizeMorning({ analysis: morningDraft, transcript });
    } else if (kind === 'night' && nightDraft) {
      ok = await finalizeNight({ analysis: nightDraft, transcript });
    }
    setFinalizing(false);
    if (ok) router.back();
  }

  function handleRefine() {
    inputRef.current?.focus();
  }

  const draftCard =
    kind === 'morning' && morningDraft ? (
      <MorningDraftCard
        analysis={morningDraft}
        onApprove={handleApprove}
        onRefine={handleRefine}
        disabled={finalizing}
      />
    ) : kind === 'night' && nightDraft ? (
      <NightDraftCard
        analysis={nightDraft}
        onApprove={handleApprove}
        onRefine={handleRefine}
        disabled={finalizing}
      />
    ) : null;

  return (
    <CompassChat
      title={kind === 'morning' ? 'Morning Check-in' : 'Night Check-in'}
      opener={OPENERS[kind]}
      messages={messages}
      submitting={submitting === kind}
      finalizing={finalizing}
      draftCard={draftCard}
      placeholder={kind === 'morning' ? 'Today I want to…' : 'Today I actually…'}
      error={error}
      onSend={handleSend}
      onRetry={handleRetry}
      onBack={() => router.back()}
      inputRef={inputRef}
    />
  );
}
