import React from 'react';

import { EpisodeTimesContext } from '@/components/chat/episode-times-context';
import { ChatTranscript } from '@/features/chat/components/chat-transcript';
import { CompassDraftCard } from '@/features/compass/components/compass-draft-card';
import { useChatTranscriptRegion } from '@/features/samwell/hooks/use-chat-transcript-region';

type ChatTranscriptRegionProps = {
  /** How far under the keyboard's top the floating card already sits. */
  keyboardOffset: number;
};

/** The conversation's transcript; see `useChatTranscriptRegion` for what it draws from. */
export function ChatTranscriptRegion({ keyboardOffset }: ChatTranscriptRegionProps) {
  const { playEpisodeTime, transcript, compassDraft } = useChatTranscriptRegion(keyboardOffset);
  const { draft, titles, approve, refine, committing, done } = compassDraft;
  // Built only when there is a card, and kept through the tokens of a reply.
  const card = React.useMemo(
    () => (draft ? <CompassDraftCard draft={draft} titles={titles} approve={approve} refine={refine} committing={committing} done={done} /> : null),
    [draft, titles, approve, refine, committing, done],
  );
  return (
    // In an episode chat, the times Samwell cites play the episode.
    <EpisodeTimesContext.Provider value={playEpisodeTime}>
      <ChatTranscript {...transcript} card={card} />
    </EpisodeTimesContext.Provider>
  );
}
