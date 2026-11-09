import React from 'react';

import { Reveal } from '@/components/navigation/reveal';
import { ChatTranscriptRegion } from '@/features/samwell/components/chat-transcript-region';

const Conversation = React.memo(ChatTranscriptRegion);

/**
 * The conversation. One, since reading and goals are one Samwell: the
 * transcript holds its own subscriptions, so this redraws only when the
 * keyboard's offset does.
 */
export function SamwellBody({ keyboardOffset }: { keyboardOffset: number }) {
  return (
    <Reveal index={0} className="flex-1">
      <Conversation keyboardOffset={keyboardOffset} />
    </Reveal>
  );
}
