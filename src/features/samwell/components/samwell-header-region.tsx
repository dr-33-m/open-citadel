import React from 'react';

import { ChatHeader } from '@/features/chat/components/chat-header';
import { useSamwellHeader } from '@/features/samwell/hooks/use-samwell-header';

/** The bar over the conversation; see `useSamwellHeader`. */
export function SamwellHeaderRegion() {
  return <ChatHeader {...useSamwellHeader()} />;
}
